// PICO PARK Collision System

const GameState = require("../game-state/GameState");

class CollisionSystem {
  static checkAABB(a, b) {
    if (!a || !b) return false;
    const aW = a.w !== undefined ? a.w : 42;
    const aH = a.h !== undefined ? a.h : 46;
    const bW = b.w !== undefined ? b.w : 42;
    const bH = b.h !== undefined ? b.h : 46;
    return Math.abs(a.x - b.x) * 2 < (aW + bW) && Math.abs(a.y - b.y) * 2 < (aH + bH);
  }

  static isTileSolid(tileId) {
    return GameState.checkTileSolid ? GameState.checkTileSolid(tileId) : (tileId > 1);
  }

  static getOverlap(a, b) {
    if (!a || !b) return { overlapX: 0, overlapY: 0 };
    const aW = a.w !== undefined ? a.w : 42;
    const aH = a.h !== undefined ? a.h : 46;
    const bW = b.w !== undefined ? b.w : 42;
    const bH = b.h !== undefined ? b.h : 46;
    const overlapX = (aW + bW) / 2 - Math.abs(a.x - b.x);
    const overlapY = (aH + bH) / 2 - Math.abs(a.y - b.y);
    return {
      overlapX: Math.max(0, overlapX),
      overlapY: Math.max(0, overlapY)
    };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = CollisionSystem;
} else if (typeof window !== "undefined") {
  window.CollisionSystem = CollisionSystem;
}
