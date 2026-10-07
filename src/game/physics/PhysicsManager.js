// src/game/physics/PhysicsManager.js
// PICO PARK Shared Physics & Simulation Engine

const CONSTANTS = typeof require !== "undefined"
  ? (function() {
      try { return require("../game-state/GameState"); } catch (e) { return require("./constants"); }
    })()
  : window.CONSTANTS;

const ChainSystem = typeof require !== "undefined"
  ? (function() {
      try { return require("../chain/ChainManager"); } catch (e) { return require("./chain"); }
    })()
  : window.ChainSystem;

class PhysicsWorld {
  constructor(level) {
    this.level = level;
    this.grid = level.grid;
    this.chipSize = level.chipSize;
    this.width = level.width;
    this.height = level.height;
    this.worldWidth = level.worldWidth;
    this.worldHeight = level.worldHeight;

    this.players = new Map();
    this.platforms = [];
    this.boxes = [];
    this.switches = [];
    this.bridges = [];
    this.key = null;
    this.keys = [];
    this.spikes = [];
    this.goal = null;
    this.jumpStands = [];
    this.timeLimit = level.timeLimit !== undefined && level.timeLimit !== null ? Number(level.timeLimit) : null;
    this.timeRemaining = this.timeLimit !== null ? this.timeLimit : null;

    // Co-op Chain configuration
    this.chainConfig = {
      enabled: level.chainEnabled !== undefined ? !!level.chainEnabled : false,
      maxDistance: Number(level.chainMaxDistance) || (CONSTANTS.CHAIN_DEFAULT_MAX_DISTANCE || 120),
      minDistance: Number(level.chainMinDistance) || (CONSTANTS.CHAIN_DEFAULT_MIN_DISTANCE || 35),
      strength: Number(level.chainStrength) !== undefined ? Number(level.chainStrength) : (CONSTANTS.CHAIN_DEFAULT_STRENGTH || 0.8)
    };
    this.chainSystem = new ChainSystem(this, this.chainConfig);

    this.stageState = CONSTANTS.STAGE_STATE.READY;
    this.nextEventId = 1;
    this.levelCompleted = false;
    this.events = []; // Sound/visual events generated during ticks
    this.boxSoundCooldown = 0;

    this.initActors(level.actors);
  }

  pushEvent(type, data = {}) {
    const event = {
      id: `ev_${this.nextEventId++}`,
      type,
      ...data
    };
    this.events.push(event);
    return event;
  }

  setStageState(newState) {
    if (this.stageState === newState) return;
    // Terminal state guard: once COMPLETE, no regular state transitions
    if (this.stageState === CONSTANTS.STAGE_STATE.COMPLETE && newState !== CONSTANTS.STAGE_STATE.RETRYING) {
      return;
    }
    this.stageState = newState;
    this.pushEvent("stage_state_changed", { state: newState });
  }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  resetStage() {
    this.stageState = CONSTANTS.STAGE_STATE.PLAYING;
    this.levelCompleted = false;
    this.timeRemaining = this.timeLimit !== null ? this.timeLimit : null;
    this.initActors(this.level.actors);
    this.drainEvents();

    let idx = 0;
    const spawns = (this.level.actors && this.level.actors.playerSpawns) || (this.level.actors && this.level.actors.players) || [];
    for (const p of this.players.values()) {
      const spawn = spawns[idx % Math.max(1, spawns.length)] || { x: 300 + idx * 50, y: 648 };
      p.x = spawn.x;
      p.y = spawn.y;
      p.vx = 0;
      p.vy = 0;
      p.onGround = false;
      p.isDead = false;
      p.inGoal = false;
      p.animState = "idle";
      p.inputs = { left: false, right: false, jump: false, action: false };
      idx++;
    }
    this.chainSystem.rebuild();
  }

  initActors(actors) {
    // Initialize platforms (Rects)
    this.platforms = (actors.platforms || []).map((plat) => ({
      id: plat.id,
      x: plat.x,
      y: plat.y,
      w: plat.w,
      h: plat.h,
      color: plat.color || null
    }));

    // Initialize jumpStands (trampolines/springs)
    this.jumpStands = (actors.jumpStands || []).map((js) => ({
      id: js.id,
      x: js.x,
      y: js.y,
      w: js.w || 36,
      h: js.h || 24,
      jumpVelo: js.jumpVelo !== undefined ? Number(js.jumpVelo) : -19.5,
      compressed: 0
    }));

    // Initialize boxes
    this.boxes = (actors.boxes || []).map((b) => ({
      id: b.id,
      type: b.type,
      x: b.x,
      y: b.y,
      vx: 0,
      vy: 0,
      w: b.w,
      h: b.h,
      weight: b.weight || 30,
      color: b.color || "#f59e0b",
      colorIndex: b.colorIndex,
      onGround: false
    }));

    // Initialize switches
    this.switches = (actors.switches || []).map((s) => ({
      id: s.id,
      targetId: s.targetId,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      isFloorSwitch: s.isFloorSwitch !== undefined ? s.isFloorSwitch : s.y > 400,
      isPressed: false,
      pressedY: s.y + 6
    }));

    // Initialize bridges/moving gates
    this.bridges = (actors.bridges || []).map((br) => ({
      id: br.id,
      x: br.x,
      y: br.y,
      w: br.w,
      h: br.h,
      initialX: br.initialX !== undefined ? br.initialX : br.x,
      initialY: br.initialY !== undefined ? br.initialY : br.y,
      targetX: br.targetX !== undefined ? br.targetX : (br.initialX !== undefined ? br.initialX : br.x),
      targetY: br.targetY !== undefined ? br.targetY : ((br.initialY !== undefined ? br.initialY : br.y) + 64),
      dirX: br.dirX || 0,
      dirY: br.dirY || 0,
      isOpen: false,
      speed: br.speed || 30
    }));

    // Initialize warps
    this.warps = (actors.warps || []).map((w) => ({
      id: w.id,
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.h,
      targetX: w.targetX,
      targetY: w.targetY
    }));

    // Initialize spikes
    this.spikes = (actors.spikes || []).map((sp) => ({
      id: sp.id,
      x: sp.x,
      y: sp.y,
      w: sp.w,
      h: sp.h
    }));

    // Initialize keys (single or multiple)
    this.keys = [];
    if (actors.keys && actors.keys.length > 0) {
      this.keys = actors.keys.map((k, idx) => ({
        id: k.id || `key_${idx + 1}`,
        x: k.x,
        y: k.y,
        w: k.w || 24,
        h: k.h || 30,
        state: CONSTANTS.KEY_STATE.KEY_AVAILABLE,
        heldBy: null,
        initialX: k.x,
        initialY: k.y,
        bobTimer: idx * 0.5
      }));
      this.key = this.keys[0];
    } else if (actors.key) {
      this.key = {
        id: actors.key.id,
        x: actors.key.x,
        y: actors.key.y,
        w: actors.key.w,
        h: actors.key.h,
        state: CONSTANTS.KEY_STATE.KEY_AVAILABLE,
        heldBy: null,
        initialX: actors.key.initialX,
        initialY: actors.key.initialY,
        bobTimer: 0
      };
      this.keys = [this.key];
    } else {
      this.key = null;
      this.keys = [];
    }

    // Initialize goal (Section 8)
    if (actors.goal) {
      this.goal = {
        id: actors.goal.id,
        x: actors.goal.x,
        y: actors.goal.y,
        w: actors.goal.w,
        h: actors.goal.h,
        isOpen: this.keys.length === 0, // Levels without keys have goal door open initially
        playersInside: new Set()
      };
      if (this.keys.length === 0) {
        this.stageState = CONSTANTS.STAGE_STATE.GOAL_UNLOCKED;
      }
    }
  }

  addPlayer(id, name, slotNumber) {
    const hasMultipleSpawns = this.level.actors.players && this.level.actors.players.length > 1;
    const spawnIdx = (slotNumber - 1) % (this.level.actors.players.length || 1);
    const spawn = (this.level.actors.players && this.level.actors.players[spawnIdx]) || { x: 100, y: 400 };
    const colorInfo = CONSTANTS.PLAYER_COLORS[(slotNumber - 1) % CONSTANTS.PLAYER_COLORS.length];

    // Only apply +35px offset if stage has only a single shared spawn point
    const spawnX = hasMultipleSpawns ? spawn.x : spawn.x + (slotNumber - 1) * 35;

    // In Pico Park levels, spawn.y is the floor/platform line if solid at (spawn.x, spawn.y).
    // Center Y is spawn.y - h/2 when spawned on floor.
    let initialY = spawn.y;
    if (this.isSolidAt(spawnX, spawn.y)) {
      initialY = spawn.y - CONSTANTS.PLAYER_HEIGHT / 2;
    }

    const player = {
      id: id,
      name: name || `Player ${slotNumber}`,
      slot: slotNumber,
      color: colorInfo.hex,
      rgb: colorInfo.rgb,
      x: spawnX,
      y: initialY,
      vx: 0,
      vy: 0,
      w: CONSTANTS.PLAYER_WIDTH,
      h: CONSTANTS.PLAYER_HEIGHT,
      facing: 1, // 1: right, -1: left
      onGround: false,
      ridingOn: null, // player id or box id
      isDead: false,
      inGoal: false,
      inputs: { left: false, right: false, jump: false, action: false },
      animState: "idle", // idle, run, jump, celebrate, dead
      coyoteTimer: 0,
      jumpBuffer: 0,
      prevJumpInput: false
    };

    // Immediate initial ground/platform/bridge detection so player is standing naturally on tick 0
    const resY = this.checkTileCollision(player, 0, 2.0);
    if (resY.collidedY) {
      player.y = resY.y;
      player.onGround = true;
      player.vy = 0;
    }
    const resPlat = this.checkPlatformCollision(player, 0, 2.0);
    if (resPlat.collidedY && (!player.onGround || resPlat.y < player.y)) {
      player.y = resPlat.y;
      player.onGround = true;
      player.vy = 0;
    }
    for (const br of this.bridges) {
      if (!br.isOpen && this.checkAABB(player, br) && player.y < br.y) {
        player.y = br.y - br.h / 2 - player.h / 2;
        player.onGround = true;
        player.vy = 0;
      }
    }
    for (const b of this.boxes) {
      if (this.checkAABB(player, b)) {
        if (player.y < b.y) {
          player.y = b.y - b.h / 2 - player.h / 2;
          player.onGround = true;
          player.vy = 0;
          player.ridingOn = b.id;
        } else {
          player.x = b.x + (b.w + player.w) / 2 + 2;
        }
      }
    }

    this.players.set(id, player);
    this.chainSystem.rebuild();
    return player;
  }

  removePlayer(id) {
    // If player held any key, drop keys safely at current position
    for (const k of this.keys) {
      if (k.heldBy === id) {
        k.heldBy = null;
        k.state = CONSTANTS.KEY_STATE.KEY_AVAILABLE;
        k.initialX = k.x;
        k.initialY = k.y;
      }
    }
    if (this.goal) {
      this.goal.playersInside.delete(id);
    }
    this.players.delete(id);
    this.chainSystem.rebuild();
  }

  killPlayer(id) {
    const p = this.players.get(id);
    if (!p || p.isDead) return;
    p.isDead = true;
    p.animState = "dead";
    for (const k of this.keys) {
      if (k.heldBy === id) {
        k.heldBy = null;
        k.state = CONSTANTS.KEY_STATE.KEY_AVAILABLE;
        k.initialX = k.x;
        k.initialY = k.y;
      }
    }
    this.chainSystem.rebuild();
    this.pushEvent("player_died", { playerId: id });
    this.pushEvent("sound", { name: "failure", x: p.x, y: p.y });
  }

  respawnPlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    const hasMultipleSpawns = this.level.actors.players && this.level.actors.players.length > 1;
    const spawnIdx = (p.slot - 1) % (this.level.actors.players.length || 1);
    const spawn = (this.level.actors.players && this.level.actors.players[spawnIdx]) || { x: 100, y: 400 };
    const spawnX = hasMultipleSpawns ? spawn.x : spawn.x + (p.slot - 1) * 35;
    let initialY = spawn.y;
    if (this.isSolidAt(spawnX, spawn.y)) {
      initialY = spawn.y - p.h / 2;
    }

    p.x = spawnX;
    p.y = initialY;
    p.vx = 0;
    p.vy = 0;
    p.onGround = false;
    p.isDead = false;
    p.animState = "idle";

    const resY = this.checkTileCollision(p, 0, 2.0);
    if (resY.collidedY) {
      p.y = resY.y;
      p.onGround = true;
    }
    for (const br of this.bridges) {
      if (!br.isOpen && this.checkAABB(p, br) && p.y < br.y) {
        p.y = br.y - br.h / 2 - p.h / 2;
        p.onGround = true;
      }
    }
    for (const b of this.boxes) {
      if (this.checkAABB(p, b)) {
        if (p.y < b.y) {
          p.y = b.y - b.h / 2 - p.h / 2;
          p.onGround = true;
          p.vy = 0;
          p.ridingOn = b.id;
        } else {
          p.x = b.x + (b.w + p.w) / 2 + 2;
        }
      }
    }

    for (const k of this.keys) {
      if (k.heldBy === p.id) {
        k.x = p.x;
        k.y = p.y - 25;
      }
    }

    this.chainSystem.rebuild();
  }

  updatePlayerInput(id, inputs) {
    const p = this.players.get(id);
    if (p) {
      p.inputs = { ...p.inputs, ...inputs };
    }
  }

  // Check tile grid solidity
  isTileSolidAt(px, py) {
    if (px < 0 || px >= this.worldWidth || py >= this.worldHeight) {
      return true;
    }
    if (py < 0) return false;

    const tileX = Math.floor(px / this.chipSize);
    const tileY = Math.floor(py / this.chipSize);

    if (tileY < 0 || tileY >= this.height || tileX < 0 || tileX >= this.width) {
      return false;
    }

    const tile = this.grid[tileY][tileX];
    return CONSTANTS.isSolidTile(tile);
  }

  // Check tile & platform solidity
  isSolidAt(px, py) {
    if (this.platforms && this.platforms.length > 0) {
      for (const plat of this.platforms) {
        if (
          px >= plat.x - plat.w / 2 &&
          px <= plat.x + plat.w / 2 &&
          py >= plat.y - plat.h / 2 &&
          py <= plat.y + plat.h / 2
        ) {
          return true;
        }
      }
    }

    return this.isTileSolidAt(px, py);
  }

  // AABB collision vs tile grid
  checkTileCollision(box, dx, dy) {
    let newX = box.x + dx;
    let newY = box.y + dy;
    let collidedX = false;
    let collidedY = false;

    // Check X movement
    if (dx !== 0) {
      const stepX = dx > 0 ? 1 : -1;
      const testX = dx > 0 ? newX + box.w / 2 : newX - box.w / 2;
      const topY = box.y - box.h / 2 + 4;
      const bottomY = box.y + box.h / 2 - 4;
      const midY = box.y;

      if (
        this.isTileSolidAt(testX, topY) ||
        this.isTileSolidAt(testX, midY) ||
        this.isTileSolidAt(testX, bottomY)
      ) {
        collidedX = true;
        const tileCol = Math.floor(testX / this.chipSize);
        newX = dx > 0
          ? tileCol * this.chipSize - box.w / 2 - 0.01
          : (tileCol + 1) * this.chipSize + box.w / 2 + 0.01;
      }
    }

    // Check Y movement
    if (dy !== 0) {
      const testY = dy > 0 ? newY + box.h / 2 : newY - box.h / 2;
      const leftX = newX - box.w / 2 + 4;
      const rightX = newX + box.w / 2 - 4;
      const midX = newX;

      if (
        this.isTileSolidAt(leftX, testY) ||
        this.isTileSolidAt(midX, testY) ||
        this.isTileSolidAt(rightX, testY)
      ) {
        collidedY = true;
        const tileRow = Math.floor(testY / this.chipSize);
        newY = dy > 0
          ? tileRow * this.chipSize - box.h / 2 - 0.01
          : (tileRow + 1) * this.chipSize + box.h / 2 + 0.01;
      }
    }

    return { x: newX, y: newY, collidedX, collidedY };
  }

  // Exact AABB collision vs Rect platforms
  checkPlatformCollision(box, dx, dy) {
    let newX = box.x + dx;
    let newY = box.y + dy;
    let collidedX = false;
    let collidedY = false;

    if (!this.platforms || this.platforms.length === 0) {
      return { x: newX, y: newY, collidedX, collidedY };
    }

    // Check X movement against platforms
    if (dx !== 0) {
      for (const plat of this.platforms) {
        const vertOverlap = (box.h + plat.h) / 2 - Math.abs(box.y - plat.y);
        if (vertOverlap > 4) {
          if (dx > 0 && box.x + box.w / 2 <= plat.x - plat.w / 2 + 4) {
            if (newX + box.w / 2 >= plat.x - plat.w / 2) {
              newX = plat.x - plat.w / 2 - box.w / 2 - 0.01;
              collidedX = true;
            }
          } else if (dx < 0 && box.x - box.w / 2 >= plat.x + plat.w / 2 - 4) {
            if (newX - box.w / 2 <= plat.x + plat.w / 2) {
              newX = plat.x + plat.w / 2 + box.w / 2 + 0.01;
              collidedX = true;
            }
          }
        }
      }
    }

    // Check Y movement against platforms
    if (dy !== 0) {
      for (const plat of this.platforms) {
        const horizOverlap = (box.w + plat.w) / 2 - Math.abs(newX - plat.x);
        if (horizOverlap > 4) {
          if (dy > 0 && box.y + box.h / 2 <= plat.y - plat.h / 2 + 6) {
            if (newY + box.h / 2 >= plat.y - plat.h / 2) {
              newY = plat.y - plat.h / 2 - box.h / 2 - 0.01;
              collidedY = true;
            }
          } else if (dy < 0 && box.y - box.h / 2 >= plat.y + plat.h / 2 - 6) {
            if (newY - box.h / 2 <= plat.y + plat.h / 2) {
              newY = plat.y + plat.h / 2 + box.h / 2 + 0.01;
              collidedY = true;
            }
          }
        }
      }
    }

    return { x: newX, y: newY, collidedX, collidedY };
  }

  // Box to Box AABB
  checkAABB(a, b) {
    return (
      Math.abs(a.x - b.x) * 2 < a.w + b.w &&
      Math.abs(a.y - b.y) * 2 < a.h + b.h
    );
  }

  // Recursive Rider Momentum Transfer (Reference 1 - PICO PARK stack carrying)
  moveRiders(carrierId, deltaX) {
    if (Math.abs(deltaX) < 0.0001) return;
    const carrier = this.players.get(carrierId);
    if (!carrier) return;

    for (const rider of this.players.values()) {
      if (rider.id === carrierId || rider.isDead) continue;

      const feetY = rider.y + rider.h / 2;
      const carrierHeadY = carrier.y - carrier.h / 2;
      const isRestingOn =
        (rider.ridingOn === carrierId || Math.abs(feetY - carrierHeadY) <= 4.0) &&
        rider.onGround &&
        Math.abs(rider.x - carrier.x) < (rider.w + carrier.w) / 2 * 0.92;

      if (isRestingOn) {
        rider.ridingOn = carrierId;
        const prevRiderX = rider.x;
        const res = this.checkTileCollision(rider, deltaX, 0);
        rider.x = res.x;
        const riderDeltaX = rider.x - prevRiderX;
        if (Math.abs(riderDeltaX) > 0.0001) {
          this.moveRiders(rider.id, riderDeltaX);
        }
      }
    }
  }

  moveBoxRiders(boxId, deltaX) {
    if (Math.abs(deltaX) < 0.0001) return;
    const box = this.boxes.find((b) => b.id === boxId);
    if (!box) return;

    for (const rider of this.players.values()) {
      if (rider.isDead) continue;

      const feetY = rider.y + rider.h / 2;
      const boxTopY = box.y - box.h / 2;
      const isRestingOn =
        (rider.ridingOn === boxId || Math.abs(feetY - boxTopY) <= 4.0) &&
        rider.onGround &&
        Math.abs(rider.x - box.x) < (rider.w + box.w) / 2 * 0.95;

      if (isRestingOn) {
        rider.ridingOn = boxId;
        const prevRiderX = rider.x;
        const res = this.checkTileCollision(rider, deltaX, 0);
        rider.x = res.x;
        const riderDeltaX = rider.x - prevRiderX;
        if (Math.abs(riderDeltaX) > 0.0001) {
          this.moveRiders(rider.id, riderDeltaX);
        }
      }
    }
  }

  // Checks how much a box (and any downstream chain of boxes) can move along X
  canMoveBox(box, dx, visited = new Set()) {
    if (visited.has(box.id) || Math.abs(dx) < 0.0001) return 0;
    visited.add(box.id);

    const dir = Math.sign(dx);
    let allowed = dx;

    // 1. World boundaries
    if (dir > 0) {
      const maxBound = this.worldWidth - box.w / 2;
      if (box.x + allowed > maxBound) {
        allowed = Math.max(0, maxBound - box.x);
      }
    } else {
      const minBound = box.w / 2;
      if (box.x + allowed < minBound) {
        allowed = Math.min(0, minBound - box.x);
      }
    }
    if (Math.abs(allowed) < 0.0001) return 0;

    // 2. Tilemap and Platform walls
    const resTile = this.checkTileCollision(box, allowed, 0);
    const resPlat = this.checkPlatformCollision(box, allowed, 0);
    let bestAllowed = resTile.x - box.x;
    if (resPlat.collidedX) {
      const platAllowed = resPlat.x - box.x;
      if (Math.abs(platAllowed) < Math.abs(bestAllowed)) {
        bestAllowed = platAllowed;
      }
    }
    allowed = bestAllowed;
    if (Math.abs(allowed) < 0.0001) return 0;

    // 3. Closed bridges/gates
    for (const br of this.bridges) {
      if (!br.isOpen) {
        const vertOverlap = (box.h + br.h) / 2 - Math.abs(box.y - br.y);
        if (vertOverlap > 1) {
          if (dir > 0 && box.x < br.x) {
            const dist = (br.x - br.w / 2) - (box.x + box.w / 2);
            if (dist >= -0.5 && allowed > dist) {
              allowed = Math.max(0, dist);
            }
          } else if (dir < 0 && box.x > br.x) {
            const dist = (box.x - box.w / 2) - (br.x + br.w / 2);
            if (dist >= -0.5 && Math.abs(allowed) > dist) {
              allowed = -Math.max(0, dist);
            }
          }
        }
      }
    }
    if (Math.abs(allowed) < 0.0001) return 0;

    // 4. Downstream pushable boxes (Chain push detection)
    for (const other of this.boxes) {
      if (other.id === box.id || visited.has(other.id)) continue;
      const vertOverlap = (box.h + other.h) / 2 - Math.abs(box.y - other.y);
      if (vertOverlap > 2) {
        if (dir > 0 && box.x < other.x) {
          const dist = (other.x - other.w / 2) - (box.x + box.w / 2);
          if (dist >= -0.5 && allowed > dist) {
            const contactDist = Math.max(0, dist);
            const excess = allowed - contactDist;
            const otherAllowed = this.canMoveBox(other, excess, visited);
            allowed = contactDist + Math.max(0, otherAllowed);
          }
        } else if (dir < 0 && box.x > other.x) {
          const dist = (box.x - box.w / 2) - (other.x + other.w / 2);
          if (dist >= -0.5 && Math.abs(allowed) > dist) {
            const contactDist = Math.max(0, dist);
            const excess = allowed + contactDist;
            const otherAllowed = this.canMoveBox(other, excess, visited);
            allowed = -(contactDist + Math.abs(otherAllowed));
          }
        }
      }
    }
    if (Math.abs(allowed) < 0.0001) return 0;

    // 5. Downstream players: verify they won't be crushed against a solid wall
    for (const p of this.players.values()) {
      if (p.isDead) continue;
      const vertOverlap = (box.h + p.h) / 2 - Math.abs(box.y - p.y);
      if (vertOverlap > 2) {
        if (dir > 0 && box.x < p.x) {
          const dist = (p.x - p.w / 2) - (box.x + box.w / 2);
          if (dist >= -0.5 && allowed > dist) {
            const contactDist = Math.max(0, dist);
            const excess = allowed - contactDist;
            const testP = this.checkTileCollision(p, excess, 0);
            const pAllowed = Math.max(0, testP.x - p.x);
            allowed = contactDist + pAllowed;
          }
        } else if (dir < 0 && box.x > p.x) {
          const dist = (box.x - box.w / 2) - (p.x + p.w / 2);
          if (dist >= -0.5 && Math.abs(allowed) > dist) {
            const contactDist = Math.max(0, dist);
            const excess = allowed + contactDist;
            const testP = this.checkTileCollision(p, excess, 0);
            const pAllowed = Math.max(0, p.x - testP.x);
            allowed = -(contactDist + pAllowed);
          }
        }
      }
    }

    return allowed;
  }

  // Recursively moves a box and any downstream chain of boxes
  pushBoxChain(box, dx, movedBoxes = new Set()) {
    if (movedBoxes.has(box.id) || Math.abs(dx) < 0.0001) return;
    movedBoxes.add(box.id);
    const dir = Math.sign(dx);

    // 1. Push any contacted downstream boxes
    for (const other of this.boxes) {
      if (other.id === box.id || movedBoxes.has(other.id)) continue;
      const vertOverlap = (box.h + other.h) / 2 - Math.abs(box.y - other.y);
      if (vertOverlap > 2) {
        if (dir > 0 && box.x < other.x) {
          const dist = (other.x - other.w / 2) - (box.x + box.w / 2);
          if (dist >= -0.5 && dx > dist) {
            const pushExcess = dx - Math.max(0, dist);
            this.pushBoxChain(other, pushExcess, movedBoxes);
          }
        } else if (dir < 0 && box.x > other.x) {
          const dist = (box.x - box.w / 2) - (other.x + other.w / 2);
          if (dist >= -0.5 && Math.abs(dx) > dist) {
            const pushExcess = dx + Math.max(0, dist);
            this.pushBoxChain(other, pushExcess, movedBoxes);
          }
        }
      }
    }

    // 2. Push downstream players so they aren't penetrated
    for (const p of this.players.values()) {
      if (p.isDead) continue;
      const vertOverlap = (box.h + p.h) / 2 - Math.abs(box.y - p.y);
      if (vertOverlap > 2) {
        if (dir > 0 && box.x < p.x) {
          const dist = (p.x - p.w / 2) - (box.x + box.w / 2);
          if (dist >= -0.5 && dx > dist) {
            const pushExcess = dx - Math.max(0, dist);
            p.x += pushExcess;
          }
        } else if (dir < 0 && box.x > p.x) {
          const dist = (box.x - box.w / 2) - (p.x + p.w / 2);
          if (dist >= -0.5 && Math.abs(dx) > dist) {
            const pushExcess = dx + Math.max(0, dist);
            p.x += pushExcess;
          }
        }
      }
    }

    // 3. Move this box
    box.x += dx;
    box.vx = dir * 60;

    // 4. Move riders on this box
    this.moveBoxRiders(box.id, dx);
  }

  step(dt) {
    if (this.stageState === CONSTANTS.STAGE_STATE.READY) {
      this.setStageState(CONSTANTS.STAGE_STATE.PLAYING);
    }

    // Substepping for large timesteps (prevents tunneling through boxes/walls on frame drops)
    const maxSubDt = 0.0166;
    if (dt > maxSubDt) {
      let remaining = dt;
      while (remaining > 0.0001) {
        const sub = Math.min(remaining, maxSubDt);
        this.stepSingle(sub);
        remaining -= sub;
      }
      return;
    }
    this.stepSingle(dt);
  }

  stepSingle(dt) {
    // Stage countdown timer
    if (this.timeRemaining !== null && this.stageState === CONSTANTS.STAGE_STATE.PLAYING) {
      this.timeRemaining = Math.max(0, this.timeRemaining - dt);
      if (this.timeRemaining <= 0) {
        this.pushEvent("sound", { name: "dead", x: this.worldWidth / 2, y: this.worldHeight / 2 });
        this.resetStage();
        return;
      }
    }

    // Update JumpStand spring compression
    if (this.jumpStands && this.jumpStands.length > 0) {
      for (const js of this.jumpStands) {
        if (js.compressed > 0) {
          js.compressed = Math.max(0, js.compressed - dt);
        }
      }
    }

    // 1. Update Boxes (Gravity, Grid & Box-to-Box collision)
    this.boxSoundCooldown = Math.max(0, (this.boxSoundCooldown || 0) - dt);
    for (const b of this.boxes) {
      b.vy += CONSTANTS.GRAVITY * dt;
      if (b.vy > CONSTANTS.TERMINAL_VELOCITY) b.vy = CONSTANTS.TERMINAL_VELOCITY;
      b.vx *= CONSTANTS.BOX_FRICTION;

      const prevBoxVx = b.vx;
      const resTileX = this.checkTileCollision(b, b.vx * dt, 0);
      const resPlatX = this.checkPlatformCollision(b, b.vx * dt, 0);
      let resX = resTileX;
      if (resPlatX.collidedX && (!resTileX.collidedX || Math.abs(resPlatX.x - b.x) < Math.abs(resTileX.x - b.x))) {
        resX = resPlatX;
      }
      b.x = resX.x;
      if (resX.collidedX) {
        if (Math.abs(prevBoxVx) > 60 && this.boxSoundCooldown <= 0) {
          this.pushEvent("sound", { name: "hit", x: b.x, y: b.y });
          this.boxSoundCooldown = 0.25;
        }
        b.vx = 0;
      }

      // Check box-to-box horizontal collision
      for (const other of this.boxes) {
        if (other.id === b.id) continue;
        if (this.checkAABB(b, other)) {
          const overlapX = (b.w + other.w) / 2 - Math.abs(b.x - other.x);
          const overlapY = (b.h + other.h) / 2 - Math.abs(b.y - other.y);
          if (overlapX < overlapY && overlapY > 4) {
            const dir = Math.sign(b.x - other.x) || 1;
            b.x = other.x + dir * (b.w + other.w) / 2;
            b.vx = 0;
          }
        }
      }

      const prevBoxVy = b.vy;
      const resTileY = this.checkTileCollision(b, 0, b.vy * dt);
      const resPlatY = this.checkPlatformCollision(b, 0, b.vy * dt);
      let resY = resTileY;
      if (resPlatY.collidedY && (!resTileY.collidedY || (b.vy > 0 && resPlatY.y < resTileY.y) || (b.vy < 0 && resPlatY.y > resTileY.y))) {
        resY = resPlatY;
      }
      b.y = resY.y;
      b.onGround = resY.collidedY && b.vy >= 0;
      if (resY.collidedY) {
        if (prevBoxVy > 140 && this.boxSoundCooldown <= 0) {
          this.pushEvent("sound", { name: "hit", x: b.x, y: b.y });
          this.boxSoundCooldown = 0.25;
        }
        b.vy = 0;
      }

      // Check box landing on closed bridge
      for (const br of this.bridges) {
        if (!br.isOpen && this.checkAABB(b, br) && b.y < br.y) {
          b.y = br.y - br.h / 2 - b.h / 2;
          b.vy = 0;
          b.onGround = true;
        }
      }

      // Check box landing on top of another box
      for (const other of this.boxes) {
        if (other.id === b.id) continue;
        if (this.checkAABB(b, other)) {
          if (b.vy >= 0 && b.y < other.y) {
            b.y = other.y - other.h / 2 - b.h / 2;
            b.vy = 0;
            b.onGround = true;
          }
        }
      }
    }

    // 2. Update Bridges / Gates based on Switch states
    for (const br of this.bridges) {
      const isSwitchActive = this.switches.some(
        (s) =>
          (s.targetId === br.id ||
            (br.id === "2" && (s.targetId === "Bridge2" || s.targetId === "2")) ||
            (br.id === "Bridge" && s.targetId === "Bridge")) &&
          s.isPressed
      );
      br.isOpen = isSwitchActive;

      // Smoothly slide open/closed in both dimensions
      const targetX = br.isOpen ? br.targetX : br.initialX;
      const targetY = br.isOpen ? br.targetY : br.initialY;
      const diffX = targetX - br.x;
      const diffY = targetY - br.y;
      const moveSpeed = (br.speed || 30) * dt * 4;

      if (Math.abs(diffX) > 0.5) {
        br.x += Math.sign(diffX) * Math.min(Math.abs(diffX), moveSpeed);
      } else {
        br.x = targetX;
      }

      if (Math.abs(diffY) > 0.5) {
        br.y += Math.sign(diffY) * Math.min(Math.abs(diffY), moveSpeed);
      } else {
        br.y = targetY;
      }
    }

    // 3. Update Players
    const playerList = Array.from(this.players.values());

    for (const p of playerList) {
      if (p.isDead) continue;

      // Handle Inputs (Step 1)
      let moveDir = 0;
      if (p.inputs.left) moveDir -= 1;
      if (p.inputs.right) moveDir += 1;

      if (moveDir !== 0) {
        p.facing = moveDir;
        p.vx = moveDir * CONSTANTS.WALK_SPEED;
        p.animState = p.onGround ? "run" : "jump";
      } else {
        p.vx = 0;
        p.animState = p.onGround ? "idle" : "jump";
      }

      // Coyote time
      if (p.onGround) {
        p.coyoteTimer = 0.1; // 100ms
      } else {
        p.coyoteTimer = Math.max(0, p.coyoteTimer - dt);
      }

      // Discrete leading-edge jump buffering
      const jumpPressedNow = !!p.inputs.jump;
      if (jumpPressedNow && !p.prevJumpInput) {
        p.jumpBuffer = 0.15; // 150ms buffer on fresh key press
      } else {
        p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
      }
      p.prevJumpInput = jumpPressedNow;

      // Variable jump height cut on early release
      if (!jumpPressedNow && p.vy < -150) {
        p.vy *= 0.85;
      }

      // Execute jump if buffered and allowed
      if (p.jumpBuffer > 0 && p.coyoteTimer > 0) {
        p.vy = CONSTANTS.JUMP_VELOCITY;
        p.onGround = false;
        p.coyoteTimer = 0;
        p.jumpBuffer = 0;
        p.ridingOn = null;
        this.pushEvent("sound", { name: "jump", x: p.x, y: p.y });
      }

      // Gravity (Step 2)
      p.vy += CONSTANTS.GRAVITY * dt;
      if (p.vy > CONSTANTS.TERMINAL_VELOCITY) p.vy = CONSTANTS.TERMINAL_VELOCITY;

      // Steps 3, 4, 5, 6: Horizontal Movement & Pushable Box Interaction
      let intendedDeltaX = p.vx * dt;
      const pushDir = intendedDeltaX > 0 ? 1 : (intendedDeltaX < 0 ? -1 : 0);

      if (pushDir !== 0) {
        // Continuous collision detection against pushable boxes along intended X
        for (const b of this.boxes) {
          const vertOverlap = (p.h + b.h) / 2 - Math.abs(p.y - b.y);
          const isRidingThis = p.ridingOn === b.id || (p.y + p.h / 2 <= b.y - b.h / 2 + 2);
          const isBelowThis = p.y - p.h / 2 >= b.y + b.h / 2 - 2;

          if (vertOverlap > 4 && !isRidingThis && !isBelowThis) {
            if (pushDir > 0 && p.x < b.x) {
              const dist = (b.x - b.w / 2) - (p.x + p.w / 2);
              if (dist >= -1.0 && intendedDeltaX > dist) {
                const contactDist = Math.max(0, dist);
                const pushAttempt = intendedDeltaX - contactDist;
                const pushSpeed = CONSTANTS.PUSH_FORCE / (b.weight * 0.1);
                const maxBoxMove = pushSpeed * dt;
                const tryBoxDx = Math.min(pushAttempt, maxBoxMove);

                const actualBoxMove = this.canMoveBox(b, tryBoxDx);
                if (actualBoxMove > 0.0001) {
                  this.pushBoxChain(b, actualBoxMove);
                  if (this.boxSoundCooldown <= 0) {
                    this.pushEvent("sound", { name: "hit", x: b.x, y: b.y });
                    this.boxSoundCooldown = 0.25;
                  }
                }
                intendedDeltaX = contactDist + actualBoxMove;
              }
            } else if (pushDir < 0 && p.x > b.x) {
              const dist = (p.x - p.w / 2) - (b.x + b.w / 2);
              if (dist >= -1.0 && Math.abs(intendedDeltaX) > dist) {
                const contactDist = Math.max(0, dist);
                const pushAttempt = Math.abs(intendedDeltaX) - contactDist;
                const pushSpeed = CONSTANTS.PUSH_FORCE / (b.weight * 0.1);
                const maxBoxMove = pushSpeed * dt;
                const tryBoxDx = -Math.min(pushAttempt, maxBoxMove);

                const actualBoxMove = this.canMoveBox(b, tryBoxDx);
                if (Math.abs(actualBoxMove) > 0.0001) {
                  this.pushBoxChain(b, actualBoxMove);
                  if (this.boxSoundCooldown <= 0) {
                    this.pushEvent("sound", { name: "hit", x: b.x, y: b.y });
                    this.boxSoundCooldown = 0.25;
                  }
                }
                intendedDeltaX = -(contactDist + Math.abs(actualBoxMove));
              }
            }
          }
        }
      }

      // Step 7: Resolve world/platform collision for X
      const prevPlayerX = p.x;
      const resTileX = this.checkTileCollision(p, intendedDeltaX, 0);
      const resPlatX = this.checkPlatformCollision(p, intendedDeltaX, 0);
      let resX = resTileX;
      if (resPlatX.collidedX && (!resTileX.collidedX || Math.abs(resPlatX.x - p.x) < Math.abs(resTileX.x - p.x))) {
        resX = resPlatX;
      }
      p.x = resX.x;

      // Closed vertical gates act as solid walls
      for (const br of this.bridges) {
        if (!br.isOpen && br.h > br.w * 2) {
          const vertOverlap = (p.h + br.h) / 2 - Math.abs(p.y - br.y);
          if (vertOverlap > 4) {
            const overlapX = (p.w + br.w) / 2 - Math.abs(p.x - br.x);
            if (overlapX > 0) {
              const pushDir = Math.sign(p.x - br.x) || 1;
              p.x = br.x + pushDir * (p.w + br.w) / 2;
            }
          }
        }
      }

      // Ensure player is clamped outside box boundary
      for (const b of this.boxes) {
        const vertOverlap = (p.h + b.h) / 2 - Math.abs(p.y - b.y);
        const isRidingThis = p.ridingOn === b.id || (p.y + p.h / 2 <= b.y - b.h / 2 + 2);
        const isBelowThis = p.y - p.h / 2 >= b.y + b.h / 2 - 2;

        if (vertOverlap > 4 && !isRidingThis && !isBelowThis) {
          const overlapX = (p.w + b.w) / 2 - Math.abs(p.x - b.x);
          if (overlapX > 0) {
            if (p.x < b.x) {
              p.x = b.x - (p.w + b.w) / 2;
            } else {
              p.x = b.x + (p.w + b.w) / 2;
            }
          }
        }
      }

      const actualDeltaX = p.x - prevPlayerX;
      if (Math.abs(actualDeltaX) > 0.0001) {
        this.moveRiders(p.id, actualDeltaX);
      }

      // Step 8: Apply vertical movement & resolve tilemap/platform collision
      const prevPlayerVy = p.vy;
      const resTileY = this.checkTileCollision(p, 0, p.vy * dt);
      const resPlatY = this.checkPlatformCollision(p, 0, p.vy * dt);
      let resY = resTileY;
      if (resPlatY.collidedY && (!resTileY.collidedY || (p.vy > 0 && resPlatY.y < resTileY.y) || (p.vy < 0 && resPlatY.y > resTileY.y))) {
        resY = resPlatY;
      }
      p.y = resY.y;
      const justLanded = !p.onGround && resY.collidedY && prevPlayerVy > 120;
      p.onGround = resY.collidedY && p.vy >= 0;
      if (resY.collidedY) p.vy = 0;
      if (justLanded) {
        this.pushEvent("sound", { name: "bound", x: p.x, y: p.y });
      }

      // Validate riding state
      if (p.ridingOn) {
        if (typeof p.ridingOn === "string" && p.ridingOn.startsWith("box_")) {
          const b = this.boxes.find((box) => box.id === p.ridingOn);
          if (!b || Math.abs(p.x - b.x) >= (p.w + b.w) / 2 || Math.abs((p.y + p.h / 2) - (b.y - b.h / 2)) > 6) {
            p.ridingOn = null;
          }
        } else {
          const base = this.players.get(p.ridingOn);
          if (!base || base.isDead || Math.abs(p.x - base.x) >= (p.w + base.w) / 2 || Math.abs((p.y + p.h / 2) - (base.y - base.h / 2)) > 6) {
            p.ridingOn = null;
          }
        }
      }

      // Check collision with solid Bridges
      for (const br of this.bridges) {
        if (!br.isOpen && this.checkAABB(p, br)) {
          if (p.vy >= 0 && p.y < br.y) {
            if (p.vy > 120) {
              this.pushEvent("sound", { name: "bound", x: p.x, y: p.y });
            }
            p.y = br.y - br.h / 2 - p.h / 2;
            p.vy = 0;
            p.onGround = true;
          }
        }
      }

      // Step 9: Resolve vertical collisions vs boxes (landing on box / hitting from below)
      for (const b of this.boxes) {
        const horizOverlap = (p.w + b.w) / 2 - Math.abs(p.x - b.x);
        if (horizOverlap > 2) {
          // Landing on top of box
          if (p.vy >= 0 && p.y < b.y) {
            const overlapY = (p.h + b.h) / 2 - Math.abs(p.y - b.y);
            if (overlapY > 0) {
              if (p.vy > 120) {
                this.pushEvent("sound", { name: "bound", x: p.x, y: p.y });
              }
              p.y = b.y - b.h / 2 - p.h / 2;
              p.vy = 0;
              p.onGround = true;
              p.ridingOn = b.id;
            }
          }
          // Hitting box from below (head bonk)
          else if (p.vy < 0 && p.y > b.y) {
            const overlapY = (p.h + b.h) / 2 - Math.abs(p.y - b.y);
            if (overlapY > 0) {
              p.y = b.y + b.h / 2 + p.h / 2;
              p.vy = 0;
              this.pushEvent("sound", { name: "head", x: p.x, y: p.y });
            }
          }
        }
      }

      // JumpStand collision (spring trampoline launch)
      if (this.jumpStands && this.jumpStands.length > 0) {
        for (const js of this.jumpStands) {
          const horizOverlap = (p.w + js.w) / 2 - Math.abs(p.x - js.x);
          if (horizOverlap > 2) {
            // Landing on top of JumpStand
            if (p.vy >= 0 && p.y < js.y) {
              const overlapY = (p.h + js.h) / 2 - Math.abs(p.y - js.y);
              if (overlapY > 0) {
                const launchVelo = js.jumpVelo < -50 ? js.jumpVelo : (js.jumpVelo * 35 || -680);
                p.vy = launchVelo;
                p.onGround = false;
                p.y = js.y - js.h / 2 - p.h / 2;
                p.ridingOn = null;
                js.compressed = 0.25;
                this.pushEvent("sound", { name: "bound", x: js.x, y: js.y });
              }
            }
          }
        }
      }

      // Vertical shaft screen wrap for stage_time_trampoline
      if (this.level && this.level.name === "stage_time_trampoline") {
        if (p.y < -10 && p.vy < 0) {
          if ((p.x >= 200 && p.x <= 370) || (p.x >= 900 && p.x <= 1060)) {
            p.y = this.worldHeight - 20;
          }
        } else if (p.y > this.worldHeight + 20 && p.vy > 0) {
          if ((p.x >= 230 && p.x <= 370) || (p.x >= 900 && p.x <= 1040)) {
            p.y = 10;
          }
        }
      }
    }

    // 4. Player-to-Player Stacking & Climbing (Core PICO PARK mechanic)
    for (let i = 0; i < playerList.length; i++) {
      for (let j = 0; j < playerList.length; j++) {
        if (i === j) continue;
        const pA = playerList[i];
        const pB = playerList[j];

        if (this.checkAABB(pA, pB)) {
          const overlapX = (pA.w + pB.w) / 2 - Math.abs(pA.x - pB.x);
          const overlapY = (pA.h + pB.h) / 2 - Math.abs(pA.y - pB.y);

          // If pA is falling or landing onto pB's head
          if (pA.vy >= 0 && pA.y < pB.y && overlapY < 20) {
            const landedOnHead = !pA.onGround && pA.vy > 80;
            pA.y = pB.y - pB.h / 2 - pA.h / 2;
            pA.vy = 0;
            pA.onGround = true;
            pA.ridingOn = pB.id;

            if (landedOnHead) {
              this.pushEvent("sound", { name: "head", x: pA.x, y: pA.y });
            }
          } else if (overlapX < overlapY && overlapY > 12) {
            // Horizontal gentle separation so players don't clip through each other
            const pushDir = Math.sign(pA.x - pB.x) || 1;
            pA.x += pushDir * overlapX * 0.4;
          }
        }
      }
    }

    // 5. Final Zero-Penetration Pass (Step 10)
    for (const p of playerList) {
      if (p.isDead) continue;
      for (const b of this.boxes) {
        if (this.checkAABB(p, b)) {
          const overlapX = (p.w + b.w) / 2 - Math.abs(p.x - b.x);
          const overlapY = (p.h + b.h) / 2 - Math.abs(p.y - b.y);
          if (overlapX > 0.001 && overlapY > 0.001) {
            if (overlapY < overlapX) {
              if (p.y < b.y) {
                p.y = b.y - b.h / 2 - p.h / 2;
                p.vy = 0;
                p.onGround = true;
                p.ridingOn = b.id;
              } else {
                if (p.onGround) {
                  const pushDir = Math.sign(p.x - b.x) || 1;
                  p.x = b.x + pushDir * (p.w + b.w) / 2;
                } else {
                  p.y = b.y + b.h / 2 + p.h / 2;
                  p.vy = 0;
                }
              }
            } else {
              const pushDir = Math.sign(p.x - b.x) || 1;
              p.x = b.x + pushDir * (p.w + b.w) / 2;
              const resTile = this.checkTileCollision(p, 0, 0);
              p.x = resTile.x;
            }
          }
        }
      }
    }

    // 4b. Co-op Chain Constraint Resolution
    this.chainSystem.solve(dt);

    // 4c. Post-Chain Collision Clamping (Guarantees zero solid wall/platform or box overlap under chain forces)
    for (const p of playerList) {
      if (p.isDead) continue;
      const resTile = this.checkTileCollision(p, 0, 0);
      p.x = resTile.x;
      p.y = resTile.y;
      const resPlat = this.checkPlatformCollision(p, 0, 0);
      if (resPlat.collidedX) p.x = resPlat.x;
      if (resPlat.collidedY) p.y = resPlat.y;

      for (const b of this.boxes) {
        if (this.checkAABB(p, b)) {
          const overlapX = (p.w + b.w) / 2 - Math.abs(p.x - b.x);
          const overlapY = (p.h + b.h) / 2 - Math.abs(p.y - b.y);
          if (overlapX > 0.001 && overlapY > 0.001) {
            if (overlapY < overlapX) {
              if (p.y < b.y) {
                p.y = b.y - b.h / 2 - p.h / 2;
                p.vy = 0;
                p.onGround = true;
              } else {
                p.y = b.y + b.h / 2 + p.h / 2;
                p.vy = 0;
              }
            } else {
              const pushDir = Math.sign(p.x - b.x) || 1;
              p.x = b.x + pushDir * (p.w + b.w) / 2;
              const resT = this.checkTileCollision(p, 0, 0);
              p.x = resT.x;
            }
          }
        }
      }
    }

    // 5. Switches Activation (Top-contact verification)
    for (const sw of this.switches) {
      const wasPressed = sw.isPressed;
      let pressedNow = false;

      // Check if any player stands on the switch from above
      for (const p of playerList) {
        if (!p.isDead &&
          Math.abs(p.x - sw.x) < (p.w + sw.w) / 2 &&
          p.vy >= 0 &&
          p.y + p.h / 2 >= sw.y - sw.h / 2 - 4 &&
          p.y + p.h / 2 <= sw.y + sw.h / 2 + 10
        ) {
          pressedNow = true;
          break;
        }
      }

      // Check if any box stands on the switch
      if (!pressedNow) {
        for (const b of this.boxes) {
          if (
            Math.abs(b.x - sw.x) < (b.w + sw.w) / 2 &&
            b.y + b.h / 2 >= sw.y - sw.h / 2 - 4 &&
            b.y + b.h / 2 <= sw.y + sw.h / 2 + 12
          ) {
            pressedNow = true;
            break;
          }
        }
      }

      sw.isPressed = pressedNow;
      if (!wasPressed && pressedNow) {
        this.pushEvent("sound", { name: "switch", x: sw.x, y: sw.y });
      }
    }

    // 6. Key Logic & Pickup (Section 7)
    if (this.keys && this.keys.length > 0) {
      for (const k of this.keys) {
        if (k.state === CONSTANTS.KEY_STATE.KEY_CARRIED) {
          const holder = this.players.get(k.heldBy);
          if (holder && !holder.isDead) {
            // Key follows holder smoothly above their head, offset if multiple keys held
            const holderKeys = this.keys.filter((other) => other.heldBy === holder.id);
            const keyIdx = holderKeys.indexOf(k);
            const offsetMultiplier = holderKeys.length > 1 ? (keyIdx - (holderKeys.length - 1) / 2) * 16 : 0;
            const targetKeyX = holder.x - holder.facing * 18 + offsetMultiplier;
            const targetKeyY = holder.y - holder.h / 2 - 14 - (keyIdx > 0 ? 8 : 0);
            k.x += (targetKeyX - k.x) * 0.25;
            k.y += (targetKeyY - k.y) * 0.25;
          } else {
            // Drop key if holder left or died
            k.heldBy = null;
            k.state = CONSTANTS.KEY_STATE.KEY_AVAILABLE;
            k.initialX = k.x;
            k.initialY = k.y;
          }
        } else if (k.state === CONSTANTS.KEY_STATE.KEY_AVAILABLE) {
          // Idle bobbing
          k.bobTimer += dt * 4;
          k.y = k.initialY + Math.sin(k.bobTimer) * 4;

          // Check pickup by any alive player
          for (const p of playerList) {
            if (!p.isDead && this.checkAABB(p, k)) {
              k.heldBy = p.id;
              k.state = CONSTANTS.KEY_STATE.KEY_CARRIED;
              this.pushEvent("sound", { name: "get", x: k.x, y: k.y });
              break;
            }
          }
        }
      }

      // Check if all keys collected
      const allKeysCarried = this.keys.every((k) => k.state === CONSTANTS.KEY_STATE.KEY_CARRIED || k.state === CONSTANTS.KEY_STATE.KEY_USED);
      if (allKeysCarried) {
        if (this.stageState === CONSTANTS.STAGE_STATE.READY || this.stageState === CONSTANTS.STAGE_STATE.PLAYING) {
          this.setStageState(CONSTANTS.STAGE_STATE.KEY_COLLECTED);
        }
      }
    }

    // 7. Goal Door & Cooperative Level Completion (Sections 8, 9)
    if (this.goal) {
      const switchesReady = this.allRequiredSwitchesActive();
      const allKeysCarried = this.keys.length > 0 && this.keys.every((k) => k.state === CONSTANTS.KEY_STATE.KEY_CARRIED || k.state === CONSTANTS.KEY_STATE.KEY_USED);

      // Goal unlocks if keyholder reaches goal AND all required switches/keys are active
      if (allKeysCarried && !this.goal.isOpen) {
        const anyKeyHolderTouchesGoal = Array.from(this.players.values()).some((p) =>
          !p.isDead && this.keys.some((k) => k.heldBy === p.id) && this.checkAABB(p, this.goal)
        );

        if (anyKeyHolderTouchesGoal && switchesReady) {
          for (const k of this.keys) {
            k.state = CONSTANTS.KEY_STATE.KEY_USED;
            k.heldBy = null;
          }
          this.goal.isOpen = true;
          this.setStageState(CONSTANTS.STAGE_STATE.GOAL_UNLOCKED);
          this.pushEvent("sound", { name: "clear", x: this.goal.x, y: this.goal.y });
        }
      }

      // Check players entering goal door
      if (this.goal.isOpen) {
        for (const p of playerList) {
          if (!p.isDead && this.checkAABB(p, this.goal)) {
            if (!p.inGoal) {
              p.inGoal = true;
              p.animState = "celebrate";
              this.goal.playersInside.add(p.id);
              this.pushEvent("sound", { name: "goal", x: p.x, y: p.y });
            }
          } else {
            if (p.inGoal || this.goal.playersInside.has(p.id)) {
              p.inGoal = false;
              this.goal.playersInside.delete(p.id);
            }
          }
        }

        this.checkStageCompletion(playerList);
      }
    }

    // 8. Warp / Hazard checking
    for (const p of playerList) {
      // Check spike hazard collision
      if (!p.isDead && this.spikes && this.spikes.length > 0) {
        for (const sp of this.spikes) {
          if (this.checkAABB(p, sp)) {
            this.killPlayer(p.id);
            break;
          }
        }
      }

      // Fell off bottom of world or marked dead
      if (p.y > this.worldHeight + 20 || p.isDead) {
        this.pushEvent("sound", { name: "failure", x: p.x, y: p.y });
        this.respawnPlayer(p.id);
      }

      for (const w of this.warps) {
        if (
          p.x >= w.x && p.x <= w.x + w.w &&
          p.y >= w.y && p.y <= w.y + w.h
        ) {
          p.x = w.targetX;
          p.y = w.targetY;
          p.vx = 0;
          p.vy = 0;
          this.pushEvent("sound", { name: "blip", x: p.x, y: p.y });
        }
      }
    }
  }

  // Multi-switch tracking: evaluates required floor switches based on player count
  allRequiredSwitchesActive() {
    if (this.level.name === "stage_four_keys") return true;
    const floorSwitches = this.switches.filter((s) => s.isFloorSwitch || s.y > 400);
    if (floorSwitches.length === 0) return true;

    const alivePlayers = Array.from(this.players.values()).filter((p) => !p.isDead);
    const playerCount = Math.max(1, alivePlayers.length);
    // Solo play (1 player with 2 pushable boxes): requires 2 switches
    // Multiplayer (N players): requires min(floorSwitches.length, Math.max(playerCount, 2))
    const requiredCount = Math.min(floorSwitches.length, Math.max(playerCount, 2));

    const activeCount = floorSwitches.filter((s) => s.isPressed).length;
    return activeCount >= requiredCount;
  }

  // Centralized Stage Completion Validator (Section 9)
  checkStageCompletion(playerList) {
    if (this.stageState === CONSTANTS.STAGE_STATE.COMPLETE || this.levelCompleted) {
      return;
    }
    if (!this.goal || !this.goal.isOpen) {
      return;
    }
    if (playerList.length === 0) {
      return;
    }
    // If level has keys, all keys must be used
    if (this.keys && this.keys.length > 0) {
      if (!this.keys.every((k) => k.state === CONSTANTS.KEY_STATE.KEY_USED || k.state === CONSTANTS.KEY_STATE.LEVEL_COMPLETE)) {
        return;
      }
    }
    // All active, non-dead players must be inside the goal door simultaneously
    const allInside = playerList.every((p) => !p.isDead && this.goal.playersInside.has(p.id));
    if (allInside) {
      this.setStageState(CONSTANTS.STAGE_STATE.COMPLETE);
      this.levelCompleted = true;
      for (const k of this.keys) {
        k.state = CONSTANTS.KEY_STATE.LEVEL_COMPLETE;
      }
      this.pushEvent("level_clear", { stageName: this.level.name });
      this.pushEvent("sound", { name: "win" });
    }
  }

  getSnapshot() {
    const playersArr = [];
    for (const p of this.players.values()) {
      playersArr.push({
        id: p.id,
        name: p.name,
        slot: p.slot,
        color: p.color,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        vx: Math.round(p.vx * 10) / 10,
        vy: Math.round(p.vy * 10) / 10,
        facing: p.facing,
        anim: p.animState,
        inGoal: p.inGoal
      });
    }

    const boxesArr = this.boxes.map((b) => ({
      id: b.id,
      x: Math.round(b.x * 10) / 10,
      y: Math.round(b.y * 10) / 10,
      w: b.w,
      h: b.h,
      color: b.color,
      colorIndex: b.colorIndex
    }));

    const switchesArr = this.switches.map((s) => ({
      id: s.id,
      isPressed: s.isPressed
    }));

    const bridgesArr = this.bridges.map((br) => ({
      id: br.id,
      x: Math.round(br.x * 10) / 10,
      y: Math.round(br.y * 10) / 10,
      w: br.w,
      h: br.h,
      isOpen: br.isOpen
    }));

    return {
      t: Date.now(),
      stageState: this.stageState,
      players: playersArr,
      boxes: boxesArr,
      switches: switchesArr,
      bridges: bridgesArr,
      keys: this.keys.map((k) => ({
        id: k.id,
        x: Math.round(k.x * 10) / 10,
        y: Math.round(k.y * 10) / 10,
        heldBy: k.heldBy,
        state: k.state
      })),
      key: this.key
        ? {
            x: Math.round(this.key.x * 10) / 10,
            y: Math.round(this.key.y * 10) / 10,
            heldBy: this.key.heldBy,
            state: this.key.state
          }
        : null,
      goal: this.goal
        ? {
            isOpen: this.goal.isOpen,
            cleared: this.levelCompleted,
            playersInside: Array.from(this.goal.playersInside)
          }
        : null,
      jumpStands: this.jumpStands.map((js) => ({
        id: js.id,
        x: Math.round(js.x * 10) / 10,
        y: Math.round(js.y * 10) / 10,
        w: js.w,
        h: js.h,
        compressed: Math.round(js.compressed * 100) / 100
      })),
      timeRemaining: this.timeRemaining !== null ? Math.round(this.timeRemaining * 10) / 10 : null,
      chain: this.chainSystem ? this.chainSystem.getSnapshotData() : null,
      events: this.drainEvents()
    };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = PhysicsWorld;
} else if (typeof window !== "undefined") {
  window.PhysicsWorld = PhysicsWorld;
}
