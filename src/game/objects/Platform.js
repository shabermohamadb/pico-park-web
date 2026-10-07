class Platform {
  constructor(data = {}) {
    this.id = data.id || `platform_${Date.now()}`;
    this.x = data.x || 0;
    this.y = data.y || 0;
    this.w = data.w || 32;
    this.h = data.h || 32;
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = Platform;
