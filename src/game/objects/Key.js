class Key {
  constructor(data = {}) {
    this.id = data.id || `key_${Date.now()}`;
    this.x = data.x || 0;
    this.y = data.y || 0;
    this.w = data.w || 24;
    this.h = data.h || 30;
    this.initialX = data.initialX || data.x || 0;
    this.initialY = data.initialY || data.y || 0;
    this.bobTimer = 0;
    this.heldBy = null;
    this.state = "available"; // available | carried | used
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = Key;
