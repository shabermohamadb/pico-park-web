class Spikes {
  constructor(data = {}) {
    this.id = data.id || `spike_${Date.now()}`;
    this.x = data.x || 0;
    this.y = data.y || 0;
    this.w = data.w || 32;
    this.h = data.h || 24;
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = Spikes;
