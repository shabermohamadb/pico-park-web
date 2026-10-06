// PICO PARK Web Game Server

const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");
const CONSTANTS = require("../shared/constants");
const roomManager = require("./roomManager");

const app = express();
let PORT = parseInt(process.env.PORT, 10) || 3001;

// Serve static client assets
const clientPath = path.join(__dirname, "../client");
const sharedPath = path.join(__dirname, "../shared");

app.use(express.static(clientPath));
app.use("/shared", express.static(sharedPath));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    rooms: roomManager.rooms.size,
    uptime: process.uptime()
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let nextPlayerId = 1;

wss.on("connection", (ws, req) => {
  const playerId = `player_${nextPlayerId++}_${Math.random().toString(36).substr(2, 6)}`;
  ws.playerId = playerId;
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      handleClientMessage(ws, playerId, msg);
    } catch (err) {
      console.error("Invalid client message:", err);
    }
  });

  ws.on("close", () => {
    roomManager.removePlayer(playerId);
  });

  ws.on("error", (err) => {
    console.error(`Socket error for ${playerId}:`, err);
    roomManager.removePlayer(playerId);
  });
});

function handleClientMessage(ws, playerId, msg) {
  const type = msg.type;

  switch (type) {
    case CONSTANTS.MSG.CREATE_ROOM: {
      const playerName = (msg.name || "Host").trim().slice(0, 16);
      const settings = msg.settings || {};
      const room = roomManager.createRoom({ id: playerId, ws, name: playerName }, settings);

      ws.send(JSON.stringify({
        type: CONSTANTS.MSG.ROOM_CREATED,
        playerId,
        room: room.getLobbyState()
      }));
      break;
    }

    case CONSTANTS.MSG.JOIN_ROOM: {
      const code = (msg.code || "").trim().toUpperCase();
      const playerName = (msg.name || "Player").trim().slice(0, 16);
      const res = roomManager.joinRoom(code, { id: playerId, ws, name: playerName });

      if (!res.success) {
        ws.send(JSON.stringify({
          type: CONSTANTS.MSG.ERROR,
          message: res.error
        }));
        return;
      }

      ws.send(JSON.stringify({
        type: CONSTANTS.MSG.ROOM_JOINED,
        playerId,
        room: res.room.getLobbyState()
      }));

      // Broadcast updated lobby to all players in room
      res.room.broadcast({
        type: CONSTANTS.MSG.ROOM_STATE,
        room: res.room.getLobbyState()
      });
      break;
    }

    case CONSTANTS.MSG.SET_READY: {
      const code = roomManager.playerRooms.get(playerId);
      const room = roomManager.getRoom(code);
      if (room) {
        room.setReady(playerId, !!msg.ready);
        room.broadcast({
          type: CONSTANTS.MSG.ROOM_STATE,
          room: room.getLobbyState()
        });
      }
      break;
    }

    case CONSTANTS.MSG.START_GAME: {
      const code = roomManager.playerRooms.get(playerId);
      const room = roomManager.getRoom(code);
      if (room && room.hostId === playerId) {
        room.startGame();
      }
      break;
    }

    case CONSTANTS.MSG.RESTART_LEVEL: {
      const code = roomManager.playerRooms.get(playerId);
      const room = roomManager.getRoom(code);
      if (room) {
        if (room.hostId === playerId) {
          room.restartStage();
        } else {
          ws.send(JSON.stringify({
            type: CONSTANTS.MSG.ERROR,
            message: "Only the room host can restart the stage"
          }));
        }
      }
      break;
    }

    case CONSTANTS.MSG.ADD_LOCAL_PLAYER: {
      const code = roomManager.playerRooms.get(playerId);
      const room = roomManager.getRoom(code);
      if (room) {
        const nextSlot = room.getNextSlot();
        if (nextSlot > room.maxPlayers) {
          ws.send(JSON.stringify({
            type: CONSTANTS.MSG.ERROR,
            message: "Room is already full"
          }));
          return;
        }
        const subId = `${playerId}_local_${Date.now()}`;
        const playerName = (msg.name || `Player ${nextSlot}`).trim().slice(0, 16);
        const addRes = room.addPlayer({ id: subId, ws, name: playerName }, false);
        if (addRes.success) {
          addRes.player.isReady = true;
          roomManager.playerRooms.set(subId, code);
          ws.send(JSON.stringify({
            type: CONSTANTS.MSG.LOCAL_PLAYER_ADDED,
            playerId: subId,
            slot: addRes.player.slot,
            room: room.getLobbyState()
          }));
          room.broadcast({
            type: CONSTANTS.MSG.ROOM_STATE,
            room: room.getLobbyState()
          });
        } else {
          ws.send(JSON.stringify({
            type: CONSTANTS.MSG.ERROR,
            message: addRes.error
          }));
        }
      }
      break;
    }

    case CONSTANTS.MSG.PLAYER_INPUT: {
      const code = roomManager.playerRooms.get(playerId);
      const room = roomManager.getRoom(code);
      if (room && msg.inputs) {
        const targetId = msg.targetPlayerId || playerId;
        const targetPlayer = room.players.get(targetId);
        if (targetPlayer && targetPlayer.ws === ws) {
          room.handlePlayerInput(targetId, msg.inputs);
        } else if (!msg.targetPlayerId) {
          room.handlePlayerInput(playerId, msg.inputs);
        }
      }
      break;
    }

    case CONSTANTS.MSG.PLAYER_EMOTE: {
      const code = roomManager.playerRooms.get(playerId);
      const room = roomManager.getRoom(code);
      if (room && msg.emote) {
        room.broadcast({
          type: CONSTANTS.MSG.EMOTE_TRIGGER,
          playerId,
          emote: msg.emote
        });
      }
      break;
    }

    case CONSTANTS.MSG.LEAVE_ROOM: {
      roomManager.removePlayer(playerId);
      break;
    }
  }
}

// Keep-alive ping every 30s
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => {
  clearInterval(pingInterval);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.warn(`[PICO PARK Web] Port ${PORT} busy, trying ${PORT + 1}...`);
    PORT += 1;
    server.listen(PORT);
  } else {
    console.error("Server error:", err);
  }
});

server.listen(PORT, () => {
  console.log(`[PICO PARK Web] Server listening on http://localhost:${PORT}`);
});
