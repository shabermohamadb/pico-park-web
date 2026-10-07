// client/js/predictor.js
// PICO PARK Client Prediction & Reconciliation Engine
// Provides 0ms local movement and jump responsiveness while preserving server authority

const CONSTANTS_PRED = typeof require !== "undefined" ? require("../../shared/constants") : window.CONSTANTS;

class ClientPredictor {
  constructor() {
    this.localPlayers = new Map(); // id -> predictedState
  }

  reset() {
    this.localPlayers.clear();
  }

  registerPlayer(id, slot, initialX = 100, initialY = 400) {
    this.localPlayers.set(id, {
      id,
      slot,
      x: initialX,
      y: initialY,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      animState: "idle",
      prevJump: false,
      offsetX: 0,
      offsetY: 0,
      inGoal: false
    });
  }

  unregisterPlayer(id) {
    this.localPlayers.delete(id);
  }

  isSolidAt(stage, px, py) {
    if (!stage) return false;
    const { grid, width, height, chipSize, actors } = stage;
    if (px < 0 || px >= width * chipSize || py >= height * chipSize) return true;
    if (py < 0) return false;

    // Check platform collision
    if (actors && actors.platforms) {
      for (const plat of actors.platforms) {
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

    if (!grid) return false;
    const tx = Math.floor(px / chipSize);
    const ty = Math.floor(py / chipSize);
    if (ty < 0 || ty >= height || tx < 0 || tx >= width) return false;
    const tile = grid[ty][tx];
    return CONSTANTS_PRED.isSolidTile(tile);
  }

  checkTileCollision(stage, p, dx, dy) {
    let newX = p.x + dx;
    let newY = p.y + dy;
    let collidedX = false;
    let collidedY = false;
    const chipSize = stage ? stage.chipSize : 48;

    if (dx !== 0) {
      const dirX = Math.sign(dx);
      const testX = dirX > 0 ? newX + p.w / 2 : newX - p.w / 2;
      const topY = p.y - p.h / 2 + 4;
      const midY = p.y;
      const botY = p.y + p.h / 2 - 4;

      if (this.isSolidAt(stage, testX, topY) || this.isSolidAt(stage, testX, midY) || this.isSolidAt(stage, testX, botY)) {
        collidedX = true;
        const col = Math.floor(testX / chipSize);
        newX = dirX > 0 ? col * chipSize - p.w / 2 - 0.01 : (col + 1) * chipSize + p.w / 2 + 0.01;
      }
    }

    if (dy !== 0) {
      const dirY = Math.sign(dy);
      const testY = dirY > 0 ? newY + p.h / 2 : newY - p.h / 2;
      const leftX = newX - p.w / 2 + 4;
      const midX = newX;
      const rightX = newX + p.w / 2 - 4;

      if (this.isSolidAt(stage, leftX, testY) || this.isSolidAt(stage, midX, testY) || this.isSolidAt(stage, rightX, testY)) {
        collidedY = true;
        const row = Math.floor(testY / chipSize);
        newY = dirY > 0 ? row * chipSize - p.h / 2 - 0.01 : (row + 1) * chipSize + p.h / 2 + 0.01;
      }
    }

    return { x: newX, y: newY, collidedX, collidedY };
  }

  update(stage, boxes, inputStates, dt) {
    const pW = CONSTANTS_PRED.PLAYER_WIDTH;
    const pH = CONSTANTS_PRED.PLAYER_HEIGHT;

    for (const [id, p] of this.localPlayers.entries()) {
      if (p.inGoal) continue;

      const inputs = (inputStates && inputStates.get(id)) || { left: false, right: false, jump: false };
      p.w = pW;
      p.h = pH;

      // 1. Horizontal movement
      const moveDir = (inputs.right ? 1 : 0) - (inputs.left ? 1 : 0);
      if (moveDir !== 0) {
        p.vx = moveDir * CONSTANTS_PRED.WALK_SPEED;
        p.facing = moveDir;
        p.animState = "run";
      } else {
        p.vx *= 0.65;
        if (Math.abs(p.vx) < 5) p.vx = 0;
        p.animState = p.onGround ? "idle" : "jump";
      }

      // 2. Jump with discrete trigger
      if (inputs.jump && p.onGround && !p.prevJump) {
        p.vy = CONSTANTS_PRED.JUMP_VELOCITY;
        p.onGround = false;
        p.animState = "jump";
        if (typeof window !== "undefined" && window.AudioManager) {
          window.AudioManager.playSFX("jump");
        }
      }
      p.prevJump = !!inputs.jump;

      // 3. Gravity
      p.vy += CONSTANTS_PRED.GRAVITY * dt;
      if (p.vy > CONSTANTS_PRED.TERMINAL_VELOCITY) p.vy = CONSTANTS_PRED.TERMINAL_VELOCITY;

      // 4. Horizontal move & tile/platform collision
      const deltaX = p.vx * dt;
      const resX = this.checkTileCollision(stage, p, deltaX, 0);
      p.x = resX.x;
      if (resX.collidedX) p.vx = 0;

      // 5. Box collision (solid contact)
      if (boxes && boxes.length > 0) {
        for (const b of boxes) {
          const overlapX = (p.w + b.w) / 2 - Math.abs(p.x - b.x);
          const overlapY = (p.h + b.h) / 2 - Math.abs(p.y - b.y);
          if (overlapX > 0 && overlapY > 4) {
            if (p.x < b.x) p.x = b.x - (p.w + b.w) / 2;
            else p.x = b.x + (p.w + b.w) / 2;
          }
        }
      }

      // 6. Vertical move & tile/platform collision
      const deltaY = p.vy * dt;
      const resY = this.checkTileCollision(stage, p, 0, deltaY);
      p.y = resY.y;
      p.onGround = resY.collidedY && p.vy >= 0;
      if (resY.collidedY) p.vy = 0;

      // Box top landing
      if (boxes && boxes.length > 0) {
        for (const b of boxes) {
          if (
            Math.abs(p.x - b.x) < (p.w + b.w) / 2 * 0.95 &&
            p.y + p.h / 2 >= b.y - b.h / 2 - 2 &&
            p.y + p.h / 2 <= b.y - b.h / 2 + 10 &&
            p.vy >= 0
          ) {
            p.y = b.y - b.h / 2 - p.h / 2;
            p.vy = 0;
            p.onGround = true;
          }
        }
      }

      // 7. Smoothly decay reconciliation offsets (smooth convergence)
      p.offsetX *= 0.82;
      p.offsetY *= 0.82;
      if (Math.abs(p.offsetX) < 0.1) p.offsetX = 0;
      if (Math.abs(p.offsetY) < 0.1) p.offsetY = 0;
    }
  }

  reconcile(authoritativePlayers) {
    if (!authoritativePlayers || authoritativePlayers.length === 0) return;

    for (const authP of authoritativePlayers) {
      const pred = this.localPlayers.get(authP.id);
      if (!pred) continue;

      const dx = authP.x - pred.x;
      const dy = authP.y - pred.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 35 || authP.inGoal) {
        // Hard snap on large discrepancy or goal entry
        pred.x = authP.x;
        pred.y = authP.y;
        pred.vx = authP.vx;
        pred.vy = authP.vy;
        pred.facing = authP.facing;
        pred.animState = authP.anim;
        pred.inGoal = authP.inGoal;
        pred.offsetX = 0;
        pred.offsetY = 0;
      } else {
        // Soft smooth reconciliation blend
        pred.offsetX = dx;
        pred.offsetY = dy;
        pred.inGoal = authP.inGoal;
      }
    }
  }

  getRenderPlayer(id) {
    const pred = this.localPlayers.get(id);
    if (!pred) return null;
    return {
      ...pred,
      x: Math.round((pred.x + pred.offsetX) * 10) / 10,
      y: Math.round((pred.y + pred.offsetY) * 10) / 10
    };
  }
}

if (typeof window !== "undefined") {
  window.ClientPredictor = ClientPredictor;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = ClientPredictor;
}
