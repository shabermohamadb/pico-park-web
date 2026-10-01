// PICO PARK Shared Physics & Simulation Engine

const CONSTANTS = typeof require !== "undefined" ? require("./constants") : window.CONSTANTS;

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
    this.boxes = [];
    this.switches = [];
    this.bridges = [];
    this.warps = [];
    this.key = null;
    this.goal = null;

    this.levelCompleted = false;
    this.events = []; // Sound/visual events generated during ticks
    this.boxSoundCooldown = 0;

    this.initActors(level.actors);
  }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  initActors(actors) {
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
      initialX: br.initialX,
      initialY: br.initialY,
      targetY: br.initialY + 64,
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

    // Initialize key
    if (actors.key) {
      this.key = {
        id: actors.key.id,
        x: actors.key.x,
        y: actors.key.y,
        w: actors.key.w,
        h: actors.key.h,
        heldBy: null, // player id
        initialX: actors.key.initialX,
        initialY: actors.key.initialY,
        bobTimer: 0
      };
    }

    // Initialize goal
    if (actors.goal) {
      this.goal = {
        id: actors.goal.id,
        x: actors.goal.x,
        y: actors.goal.y,
        w: actors.goal.w,
        h: actors.goal.h,
        isOpen: !actors.key, // Levels without key have goal door open initially
        playersInside: new Set()
      };
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

    // Immediate initial ground/bridge detection so player is standing naturally on tick 0
    const resY = this.checkTileCollision(player, 0, 2.0);
    if (resY.collidedY) {
      player.y = resY.y;
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

    this.players.set(id, player);
    return player;
  }

  removePlayer(id) {
    // If player held the key, drop the key
    if (this.key && this.key.heldBy === id) {
      this.key.heldBy = null;
    }
    if (this.goal) {
      this.goal.playersInside.delete(id);
    }
    this.players.delete(id);
  }

  updatePlayerInput(id, inputs) {
    const p = this.players.get(id);
    if (p) {
      p.inputs = { ...p.inputs, ...inputs };
    }
  }

  // Check tile solidity
  isSolidAt(px, py) {
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
        this.isSolidAt(testX, topY) ||
        this.isSolidAt(testX, midY) ||
        this.isSolidAt(testX, bottomY)
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
        this.isSolidAt(leftX, testY) ||
        this.isSolidAt(midX, testY) ||
        this.isSolidAt(rightX, testY)
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

  step(dt) {
    // 1. Update Boxes (Gravity & Grid collision)
    this.boxSoundCooldown = Math.max(0, (this.boxSoundCooldown || 0) - dt);
    for (const b of this.boxes) {
      b.vy += CONSTANTS.GRAVITY * dt;
      if (b.vy > CONSTANTS.TERMINAL_VELOCITY) b.vy = CONSTANTS.TERMINAL_VELOCITY;
      b.vx *= CONSTANTS.BOX_FRICTION;

      const prevBoxVx = b.vx;
      const resX = this.checkTileCollision(b, b.vx * dt, 0);
      b.x = resX.x;
      if (resX.collidedX) {
        if (Math.abs(prevBoxVx) > 60 && this.boxSoundCooldown <= 0) {
          this.events.push({ type: "sound", name: "hit", x: b.x, y: b.y });
          this.boxSoundCooldown = 0.25;
        }
        b.vx = 0;
      }

      const prevBoxVy = b.vy;
      const resY = this.checkTileCollision(b, 0, b.vy * dt);
      b.y = resY.y;
      b.onGround = resY.collidedY && b.vy >= 0;
      if (resY.collidedY) {
        if (prevBoxVy > 140 && this.boxSoundCooldown <= 0) {
          this.events.push({ type: "sound", name: "hit", x: b.x, y: b.y });
          this.boxSoundCooldown = 0.25;
        }
        b.vy = 0;
      }
    }

    // 2. Update Bridges / Gates based on Switch states
    for (const br of this.bridges) {
      const isSwitchActive = this.switches.some(
        (s) => s.targetId === br.id && s.isPressed
      );
      br.isOpen = isSwitchActive;

      // Smoothly slide open/closed
      const targetY = br.isOpen ? br.targetY : br.initialY;
      const diffY = targetY - br.y;
      if (Math.abs(diffY) > 0.5) {
        br.y += Math.sign(diffY) * Math.min(Math.abs(diffY), br.speed * dt * 4);
      } else {
        br.y = targetY;
      }
    }

    // 3. Update Players
    const playerList = Array.from(this.players.values());

    for (const p of playerList) {
      if (p.isDead) continue;

      // Handle Inputs
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

      // Discrete leading-edge jump buffering (prevents bunny-hop spam when holding jump)
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
        this.events.push({ type: "sound", name: "jump", x: p.x, y: p.y });
      }

      // Gravity
      p.vy += CONSTANTS.GRAVITY * dt;
      if (p.vy > CONSTANTS.TERMINAL_VELOCITY) p.vy = CONSTANTS.TERMINAL_VELOCITY;

      // Horizontal movement vs Tilemap
      const prevPlayerX = p.x;
      const resX = this.checkTileCollision(p, p.vx * dt, 0);
      p.x = resX.x;
      const actualDeltaX = p.x - prevPlayerX;
      if (Math.abs(actualDeltaX) > 0.0001) {
        this.moveRiders(p.id, actualDeltaX);
      }

      // Check Push against Boxes with Anti-Penetration Resolution
      for (const b of this.boxes) {
        if (this.checkAABB(p, b)) {
          const overlapX = (p.w + b.w) / 2 - Math.abs(p.x - b.x);
          const overlapY = (p.h + b.h) / 2 - Math.abs(p.y - b.y);

          // Top landing on box
          if (p.vy >= 0 && p.y < b.y - b.h / 4 && overlapY < 20) {
            if (p.vy > 120) {
              this.events.push({ type: "sound", name: "bound", x: p.x, y: p.y });
            }
            p.y = b.y - b.h / 2 - p.h / 2;
            p.vy = 0;
            p.onGround = true;
            p.ridingOn = b.id;
          } else if (overlapX < overlapY && overlapY > 8) {
            // Horizontal push with full penetration resolution
            const pushDir = Math.sign(b.x - p.x) || 1;
            const pushSpeed = CONSTANTS.PUSH_FORCE / (b.weight * 0.1);
            const prevBoxX = b.x;
            const resBox = this.checkTileCollision(b, pushDir * pushSpeed * dt, 0);
            b.x = resBox.x;
            const actualBoxDeltaX = b.x - prevBoxX;
            if (Math.abs(actualBoxDeltaX) > 0.0001) {
              this.moveBoxRiders(b.id, actualBoxDeltaX);
            }
            if (resBox.collidedX) {
              b.vx = 0;
              // Box blocked by solid obstacle: resolve player completely outside box
              p.x = b.x - pushDir * (p.w + b.w) / 2;
            } else {
              b.vx = pushDir * 60;
              p.x = b.x - pushDir * (p.w + b.w) / 2;
            }
          }
        }
      }

      // Vertical movement vs Tilemap
      const prevPlayerVy = p.vy;
      const resY = this.checkTileCollision(p, 0, p.vy * dt);
      p.y = resY.y;
      const justLanded = !p.onGround && resY.collidedY && prevPlayerVy > 120;
      p.onGround = resY.collidedY && p.vy >= 0;
      if (resY.collidedY) p.vy = 0;
      if (justLanded) {
        this.events.push({ type: "sound", name: "bound", x: p.x, y: p.y });
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
              this.events.push({ type: "sound", name: "bound", x: p.x, y: p.y });
            }
            p.y = br.y - br.h / 2 - p.h / 2;
            p.vy = 0;
            p.onGround = true;
          }
        }
      }

      // Check standing on top of Boxes
      for (const b of this.boxes) {
        if (this.checkAABB(p, b)) {
          if (p.vy >= 0 && p.y < b.y) {
            p.y = b.y - b.h / 2 - p.h / 2;
            p.vy = 0;
            p.onGround = true;
            p.ridingOn = b.id;
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
              this.events.push({ type: "sound", name: "head", x: pA.x, y: pA.y });
            }
          } else if (overlapX < overlapY && overlapY > 12) {
            // Horizontal gentle separation so players don't clip through each other
            const pushDir = Math.sign(pA.x - pB.x) || 1;
            pA.x += pushDir * overlapX * 0.4;
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
        if (
          Math.abs(p.x - sw.x) < (p.w + sw.w) / 2 &&
          p.vy >= 0 &&
          p.y + p.h / 2 >= sw.y - sw.h / 2 - 2 &&
          p.y + p.h / 2 <= sw.y + sw.h / 2 + 8
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
            b.y + b.h / 2 >= sw.y - sw.h / 2 - 2 &&
            b.y + b.h / 2 <= sw.y + sw.h / 2 + 8
          ) {
            pressedNow = true;
            break;
          }
        }
      }

      sw.isPressed = pressedNow;
      if (!wasPressed && pressedNow) {
        this.events.push({ type: "sound", name: "switch", x: sw.x, y: sw.y });
      }
    }

    // 6. Key Logic & Pickup
    if (this.key) {
      if (this.key.heldBy) {
        const holder = this.players.get(this.key.heldBy);
        if (holder) {
          // Key follows holder smoothly above their head
          const targetKeyX = holder.x - holder.facing * 18;
          const targetKeyY = holder.y - holder.h / 2 - 14;
          this.key.x += (targetKeyX - this.key.x) * 0.25;
          this.key.y += (targetKeyY - this.key.y) * 0.25;
        } else {
          this.key.heldBy = null;
        }
      } else {
        // Idle bobbing
        this.key.bobTimer += dt * 4;
        this.key.y = this.key.initialY + Math.sin(this.key.bobTimer) * 4;

        // Check pickup by any player
        for (const p of playerList) {
          if (this.checkAABB(p, this.key)) {
            this.key.heldBy = p.id;
            this.events.push({ type: "sound", name: "get", x: this.key.x, y: this.key.y });
            break;
          }
        }
      }
    }

    // 7. Goal Door & Cooperative Level Completion
    if (this.goal) {
      // Goal unlocks if keyholder reaches goal OR key is already collected and touches door
      if (this.key && this.key.heldBy && !this.goal.isOpen) {
        const keyHolder = this.players.get(this.key.heldBy);
        if (keyHolder && this.checkAABB(keyHolder, this.goal)) {
          this.goal.isOpen = true;
          this.events.push({ type: "sound", name: "clear", x: this.goal.x, y: this.goal.y });
        }
      }

      // Check players entering goal door
      if (this.goal.isOpen) {
        for (const p of playerList) {
          if (this.checkAABB(p, this.goal)) {
            p.inGoal = true;
            p.animState = "celebrate";
            this.goal.playersInside.add(p.id);
          } else {
            // Player stepped away: remove from inside set
            if (this.goal.playersInside.has(p.id)) {
              this.goal.playersInside.delete(p.id);
              p.inGoal = false;
            }
          }
        }

        // All active players must be simultaneously inside the door to complete the stage!
        if (
          playerList.length > 0 &&
          playerList.every((p) => this.goal.playersInside.has(p.id))
        ) {
          if (!this.levelCompleted) {
            this.levelCompleted = true;
            this.events.push({ type: "level_clear" });
          }
        }
      }
    }

    // 8. Warp / Hazard checking
    for (const p of playerList) {
      // Fell off bottom of world
      if (p.y > this.worldHeight + 50) {
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

        // If holding key, snap key immediately to respawn location
        if (this.key && this.key.heldBy === p.id) {
          this.key.x = p.x;
          this.key.y = p.y - 25;
        }

        this.events.push({ type: "sound", name: "blip", x: p.x, y: p.y });
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
          this.events.push({ type: "sound", name: "blip", x: p.x, y: p.y });
        }
      }
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
      color: b.color
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
      players: playersArr,
      boxes: boxesArr,
      switches: switchesArr,
      bridges: bridgesArr,
      key: this.key
        ? {
            x: Math.round(this.key.x * 10) / 10,
            y: Math.round(this.key.y * 10) / 10,
            heldBy: this.key.heldBy
          }
        : null,
      goal: this.goal
        ? {
            isOpen: this.goal.isOpen,
            cleared: this.levelCompleted
          }
        : null,
      events: this.drainEvents()
    };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = PhysicsWorld;
} else if (typeof window !== "undefined") {
  window.PhysicsWorld = PhysicsWorld;
}
