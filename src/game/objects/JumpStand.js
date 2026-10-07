// src/game/objects/JumpStand.js
// Trampoline / Spring object for launching players upward

class JumpStand {
  constructor(data = {}) {
    this.id = data.id || `jumpstand_${Date.now()}`;
    this.x = data.x || 0;
    this.y = data.y || 0;
    this.w = data.w || 36;
    this.h = data.h || 24;
    this.jumpVelo = data.jumpVelo !== undefined ? Number(data.jumpVelo) : -19.5;
    this.compressed = 0; // Animation timer for spring compression
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = JumpStand;
} else if (typeof window !== "undefined") {
  window.JumpStand = JumpStand;
}
