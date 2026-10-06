// PICO PARK Room Manager

const fs = require("fs");
const path = require("path");
const CONSTANTS = require("../shared/constants");
const LevelLoader = require("../shared/levelLoader");
const PhysicsWorld = require("../shared/physics");

class Room {
  constructor(code, hostPlayer, settings = {}) {
    this.code = code;
    this.hostId = hostPlayer.id;
    this.state = CONSTANTS.ROOM_STATE.LOBBY;
    this.maxPlayers = Math.min(Math.max(settings.maxPlayers || 8, 2), 10);
    this.currentWorldIndex = 0;
    this.currentStageIndex = 0;

    // Load manifest
    const manifestPath = path.join(__dirname, "../shared/levels/manifest.json");
    this.manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    this.levelLoader = new LevelLoader();
    this.levelLoader.setManifest(this.manifest);

    this.stageList = this.getStageList();
    this.currentStageName = (settings && settings.stage) || this.stageList[0] || "stage_jump01";

    this.players = new Map(); // id -> { id, ws, name, slot, isHost, isReady }
    this.physicsWorld = null;
    this.gameLoopInterval = null;
    this.snapshotInterval = null;

    this.addPlayer(hostPlayer, true);
  }

  getStageList() {
    // Collect stages in order from manifest
    const stages = [];
    if (this.manifest && this.manifest.worlds) {
      for (const w of this.manifest.worlds) {
        for (const s of w.stages) {
          stages.push(s);
        }
      }
    }
    return stages.length > 0 ? stages : ["stage_jump01", "stage_push02", "stage_jump02", "stage_push01"];
  }

  getNextSlot() {
    const usedSlots = new Set(Array.from(this.players.values()).map((p) => p.slot));
    let slot = 1;
    while (usedSlots.has(slot)) {
      slot++;
    }
    return slot;
  }

  addPlayer(playerData, isHost = false) {
    if (this.players.size >= this.maxPlayers) {
      return { success: false, error: "Room is full" };
    }

    const slot = this.getNextSlot();

    const player = {
      id: playerData.id,
      ws: playerData.ws,
      name: playerData.name || `Player ${slot}`,
      slot: slot,
      isHost: isHost || this.players.size === 0,
      isReady: isHost, // Host is ready by default
      color: CONSTANTS.PLAYER_COLORS[(slot - 1) % CONSTANTS.PLAYER_COLORS.length].hex
    };

    this.players.set(player.id, player);

    // If game is already running, spawn them into physics world
    if (this.state === CONSTANTS.ROOM_STATE.PLAYING && this.physicsWorld) {
      this.physicsWorld.addPlayer(player.id, player.name, player.slot);
    }

    return { success: true, player };
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;

    this.players.delete(playerId);

    if (this.physicsWorld) {
      this.physicsWorld.removePlayer(playerId);
    }

    // Host migration
    if (player.isHost && this.players.size > 0) {
      const nextPlayer = this.players.values().next().value;
      nextPlayer.isHost = true;
      this.hostId = nextPlayer.id;
    }
  }

  setReady(playerId, isReady) {
    const player = this.players.get(playerId);
    if (player) {
      player.isReady = isReady;
    }
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    for (const p of this.players.values()) {
      if (p.ws && p.ws.readyState === 1) { // WebSocket.OPEN
        p.ws.send(data);
      }
    }
  }

  loadStage(stageName) {
    this.currentStageName = stageName;
    const stageFilePath = path.join(__dirname, `../shared/levels/${stageName}.json`);
    if (!fs.existsSync(stageFilePath)) {
      console.error(`Stage file not found: ${stageFilePath}`);
      return false;
    }

    const stageData = JSON.parse(fs.readFileSync(stageFilePath, "utf-8"));
    const processedLevel = this.levelLoader.loadLevelSync(stageData);

    this.physicsWorld = new PhysicsWorld(processedLevel);

    // Spawn all existing players into the physics world
    for (const p of this.players.values()) {
      this.physicsWorld.addPlayer(p.id, p.name, p.slot);
    }

    return true;
  }

  startGame() {
    this.state = CONSTANTS.ROOM_STATE.PLAYING;
    this.loadStage(this.currentStageName);

    // Notify clients game started with level metadata
    this.broadcast({
      type: CONSTANTS.MSG.GAME_STARTED,
      stage: {
        name: this.currentStageName,
        width: this.physicsWorld.width,
        height: this.physicsWorld.height,
        chipSize: this.physicsWorld.chipSize,
        scale: this.physicsWorld.level.scale,
        grid: this.physicsWorld.grid,
        actors: this.physicsWorld.level.actors
      },
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        color: p.color
      }))
    });

    // Start 60Hz physics loop
    const dt = 1.0 / CONSTANTS.SERVER_TICK_RATE;
    if (this.gameLoopInterval) clearInterval(this.gameLoopInterval);
    this.gameLoopInterval = setInterval(() => {
      this.tick(dt);
    }, 1000 / CONSTANTS.SERVER_TICK_RATE);

    // Start 30Hz network snapshot broadcast
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    this.snapshotInterval = setInterval(() => {
      this.broadcastSnapshot();
    }, 1000 / CONSTANTS.NETWORK_TICK_RATE);
  }

  tick(dt) {
    if (this.state !== CONSTANTS.ROOM_STATE.PLAYING || !this.physicsWorld) return;

    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.physicsWorld.step(dt);
    this.lastTickDuration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;

    // Check for level clear event
    if (this.physicsWorld.levelCompleted && this.state === CONSTANTS.ROOM_STATE.PLAYING) {
      this.state = CONSTANTS.ROOM_STATE.LEVEL_CLEAR;

      this.broadcast({
        type: CONSTANTS.MSG.LEVEL_CLEAR,
        stage: this.currentStageName
      });

      if (this.transitionTimer) {
        clearTimeout(this.transitionTimer);
      }

      // Advance to next stage after 2.5s celebration
      this.transitionTimer = setTimeout(() => {
        this.transitionTimer = null;
        this.nextStage();
      }, 2500);
    }
  }

  nextStage() {
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }

    const currentIndex = this.stageList.indexOf(this.currentStageName);
    const nextIndex = (currentIndex + 1) % this.stageList.length;
    this.currentStageName = this.stageList[nextIndex];

    this.state = CONSTANTS.ROOM_STATE.PLAYING;
    this.loadStage(this.currentStageName);

    this.broadcast({
      type: CONSTANTS.MSG.NEXT_LEVEL,
      stage: {
        name: this.currentStageName,
        width: this.physicsWorld.width,
        height: this.physicsWorld.height,
        chipSize: this.physicsWorld.chipSize,
        scale: this.physicsWorld.level.scale,
        grid: this.physicsWorld.grid,
        actors: this.physicsWorld.level.actors
      }
    });
  }

  restartStage() {
    if (this.state === CONSTANTS.ROOM_STATE.PLAYING || this.state === CONSTANTS.ROOM_STATE.LEVEL_CLEAR) {
      if (this.transitionTimer) {
        clearTimeout(this.transitionTimer);
        this.transitionTimer = null;
      }

      this.state = CONSTANTS.ROOM_STATE.PLAYING;
      this.loadStage(this.currentStageName);
      this.broadcast({
        type: CONSTANTS.MSG.NEXT_LEVEL,
        stage: {
          name: this.currentStageName,
          width: this.physicsWorld.width,
          height: this.physicsWorld.height,
          chipSize: this.physicsWorld.chipSize,
          scale: this.physicsWorld.level.scale,
          grid: this.physicsWorld.grid,
          actors: this.physicsWorld.level.actors
        }
      });
    }
  }

  broadcastSnapshot() {
    if (!this.physicsWorld) return;

    const snapshot = this.physicsWorld.getSnapshot();
    if (this.lastTickDuration !== undefined) {
      snapshot.tickDuration = Math.round(this.lastTickDuration * 100) / 100;
    }
    this.broadcast({
      type: CONSTANTS.MSG.GAME_SNAPSHOT,
      snapshot
    });
  }

  handlePlayerInput(playerId, inputs) {
    if (this.physicsWorld) {
      this.physicsWorld.updatePlayerInput(playerId, inputs);
    }
  }

  destroy() {
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    if (this.gameLoopInterval) clearInterval(this.gameLoopInterval);
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    this.players.clear();
    this.physicsWorld = null;
  }

  getLobbyState() {
    return {
      code: this.code,
      state: this.state,
      hostId: this.hostId,
      stage: this.currentStageName,
      maxPlayers: this.maxPlayers,
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        isHost: p.isHost,
        isReady: p.isReady,
        color: p.color
      }))
    };
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map(); // code -> Room
    this.playerRooms = new Map(); // playerId -> roomCode
  }

  generateRoomCode() {
    // Generate clean 6-letter uppercase room code
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No confusing characters like 0/O, 1/I
    let code = "";
    for (let attempts = 0; attempts < 1000; attempts++) {
      code = "";
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      if (!this.rooms.has(code)) return code;
    }
    return `PARK${Math.floor(Math.random() * 900 + 100)}`;
  }

  createRoom(playerData, settings) {
    const code = this.generateRoomCode();
    const room = new Room(code, playerData, settings);
    this.rooms.set(code, room);
    this.playerRooms.set(playerData.id, code);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(code.toUpperCase());
  }

  joinRoom(code, playerData) {
    const room = this.getRoom(code);
    if (!room) {
      return { success: false, error: "Room not found. Check the code and try again." };
    }
    const res = room.addPlayer(playerData);
    if (res.success) {
      this.playerRooms.set(playerData.id, room.code);
    }
    return { ...res, room };
  }

  removePlayer(playerId) {
    const code = this.playerRooms.get(playerId);
    if (!code) return;

    const room = this.rooms.get(code);
    if (room) {
      const player = room.players.get(playerId);
      const ws = player ? player.ws : null;
      if (ws) {
        for (const [otherId, otherP] of Array.from(room.players.entries())) {
          if (otherP.ws === ws && otherId !== playerId) {
            room.removePlayer(otherId);
            this.playerRooms.delete(otherId);
          }
        }
      }

      room.removePlayer(playerId);
      this.playerRooms.delete(playerId);

      if (room.players.size === 0) {
        room.destroy();
        this.rooms.delete(code);
      } else {
        room.broadcast({
          type: CONSTANTS.MSG.ROOM_STATE,
          room: room.getLobbyState()
        });
      }
    } else {
      this.playerRooms.delete(playerId);
    }
  }
}

const roomManagerInstance = new RoomManager();
roomManagerInstance.RoomManager = RoomManager;
roomManagerInstance.Room = Room;
module.exports = roomManagerInstance;
