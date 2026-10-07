class Switch {
  constructor(data = {}) {
    this.id = data.id || `switch_${Date.now()}`;
    this.x = data.x || 0;
    this.y = data.y || 0;
    this.w = data.w || 28;
    this.h = data.h || 12;
    this.isPressed = false;
    this.targetId = data.targetId || null;
    this.isFloorSwitch = !!data.isFloorSwitch;
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = Switch;
