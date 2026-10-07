class Box {
  constructor(data = {}) {
    this.id = data.id || `box_${Date.now()}`;
    this.type = data.type || "SmallBox";
    this.x = data.x || 0;
    this.y = data.y || 0;
    this.vx = data.vx || 0;
    this.vy = data.vy || 0;
    this.w = data.w || 32;
    this.h = data.h || 32;
    this.color = data.color || "#eab308";
    this.colorIndex = data.colorIndex !== undefined ? data.colorIndex : 0;
    this.weight = data.weight || 20;
    this.isGrounded = false;
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = Box;
