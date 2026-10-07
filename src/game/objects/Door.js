class Door {
  constructor(data = {}) {
    this.id = data.id || "goal_door";
    this.x = data.x || 0;
    this.y = data.y || 0;
    this.w = data.w || 40;
    this.h = data.h || 52;
    this.isOpen = false;
    this.playersInside = new Set();
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = Door;
