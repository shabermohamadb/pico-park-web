class AudioManagerEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;

    this.masterVolume = 0.8;
    this.musicVolume = 0.6;
    this.sfxVolume = 0.8;

    this.buffers = new Map();
    this.currentBgmSource = null;
    this.currentBgmName = null;
    this.isUnlocked = false;
    this.isMuted = false;

    // SFX Throttling / Debouncing to prevent duplicate or every-frame audio spam
    this.lastPlayedTimes = new Map();
    this.cooldowns = {
      jump: 90,
      bound: 130,
      hit: 200,
      switch: 150,
      get: 300,
      clear: 500,
      win: 2500,
      fanf01: 2500,
      blip: 100,
      select: 80,
      start: 500,
      head: 150,
      default: 80
    };

    // Load saved volume preferences
    this.loadSettings();
  }

  loadSettings() {
    try {
      const savedMaster = localStorage.getItem("pico_vol_master");
      const savedMusic = localStorage.getItem("pico_vol_music");
      const savedSfx = localStorage.getItem("pico_vol_sfx");
      const savedMuted = localStorage.getItem("pico_vol_muted");
      if (savedMaster !== null) this.masterVolume = parseFloat(savedMaster);
      if (savedMusic !== null) this.musicVolume = parseFloat(savedMusic);
      if (savedSfx !== null) this.sfxVolume = parseFloat(savedSfx);
      if (savedMuted !== null) this.isMuted = savedMuted === "true";
    } catch (e) {
      // localStorage disabled or error
    }
  }

  saveSettings() {
    try {
      localStorage.setItem("pico_vol_master", this.masterVolume);
      localStorage.setItem("pico_vol_music", this.musicVolume);
      localStorage.setItem("pico_vol_sfx", this.sfxVolume);
      localStorage.setItem("pico_vol_muted", this.isMuted);
    } catch (e) {}
  }

  initContext() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.isMuted ? 0 : this.masterVolume;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.masterGain);
  }

  unlock() {
    if (this.isUnlocked) return;
    this.initContext();
    if (!this.ctx) return;

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    this.isUnlocked = true;

    // Preload audio files
    this.preloadAll();
  }

  async loadSound(name, url) {
    if (!this.ctx) this.initContext();
    if (!this.ctx) return;

    try {
      const res = await fetch(url);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(name, audioBuffer);
    } catch (err) {
      console.warn(`[Audio] Could not load ${name} from ${url}:`, err);
    }
  }

  preloadAll() {
    const sounds = [
      { name: "jump", url: "assets/audio/jump.ogg" },
      { name: "bound", url: "assets/audio/bound.ogg" },
      { name: "head", url: "assets/audio/head.ogg" },
      { name: "switch", url: "assets/audio/switch.ogg" },
      { name: "get", url: "assets/audio/get.ogg" },
      { name: "clear", url: "assets/audio/clear.ogg" },
      { name: "fanf01", url: "assets/audio/win_layered.ogg" },
      { name: "fanf02", url: "assets/audio/fanf02.ogg" },
      { name: "coin", url: "assets/audio/coin.ogg" },
      { name: "hit", url: "assets/audio/hit.ogg" },
      { name: "laser", url: "assets/audio/laser.ogg" },
      { name: "blip", url: "assets/audio/blip.ogg" },
      { name: "ball_hit", url: "assets/audio/ball_hit.ogg" },
      { name: "select", url: "assets/audio/select.ogg" },
      { name: "win", url: "assets/audio/win_layered.ogg" },
      { name: "bgm", url: "assets/audio/bgm.ogg" },
      { name: "title_bgm", url: "assets/audio/title_bgm.ogg" }
    ];

    for (const s of sounds) {
      if (!this.buffers.has(s.name)) {
        this.loadSound(s.name, s.url);
      }
    }
  }

  playSFX(name) {
    if (!this.ctx || !this.isUnlocked || this.isMuted) return;

    // Cooldown check to eliminate duplicate / every-frame sound triggers
    const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const cd = this.cooldowns[name] || this.cooldowns.default;
    const last = this.lastPlayedTimes.get(name) || 0;
    if (now - last < cd) return;
    this.lastPlayedTimes.set(name, now);

    const buffer = this.buffers.get(name);
    if (!buffer) return;

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.sfxGain);
      source.start(0);
    } catch (err) {
      console.warn(`[Audio] Failed to play SFX ${name}:`, err);
    }
  }

  playBGM(name) {
    if (!this.ctx || !this.isUnlocked) return;
    if (this.currentBgmName === name && this.currentBgmSource) return;

    this.stopBGM();

    const buffer = this.buffers.get(name);
    if (!buffer) {
      // If not loaded yet, load and play
      this.loadSound(name, `assets/audio/${name}.ogg`).then(() => {
        if (this.currentBgmName === name) {
          this.playBGM(name);
        }
      });
      this.currentBgmName = name;
      return;
    }

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.musicGain);
      source.start(0);

      this.currentBgmSource = source;
      this.currentBgmName = name;
    } catch (err) {
      console.warn(`[Audio] Failed to play BGM ${name}:`, err);
    }
  }

  stopBGM() {
    if (this.currentBgmSource) {
      try {
        this.currentBgmSource.stop();
        this.currentBgmSource.disconnect();
      } catch (e) {}
      this.currentBgmSource = null;
    }
    this.currentBgmName = null;
  }

  setMasterVolume(val) {
    this.masterVolume = Math.max(0, Math.min(1, val));
    if (this.masterGain) this.masterGain.gain.value = this.masterVolume;
    this.saveSettings();
  }

  setMusicVolume(val) {
    this.musicVolume = Math.max(0, Math.min(1, val));
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
    this.saveSettings();
  }

  setSFXVolume(val) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
    this.saveSettings();
  }

  setMuted(muted) {
    this.isMuted = !!muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.isMuted ? 0 : this.masterVolume;
    }
    this.saveSettings();
  }

  toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  static unlock() { return window.audioManager?.unlock(); }
  static playSFX(name) { return window.audioManager?.playSFX(name); }
  static playBGM(name) { return window.audioManager?.playBGM(name); }
  static stopBGM() { return window.audioManager?.stopBGM(); }
  static setMasterVolume(val) { return window.audioManager?.setMasterVolume(val); }
  static setMusicVolume(val) { return window.audioManager?.setMusicVolume(val); }
  static setSFXVolume(val) { return window.audioManager?.setSFXVolume(val); }
  static setMuted(val) { return window.audioManager?.setMuted(val); }
  static toggleMute() { return window.audioManager?.toggleMute(); }
  static get isMuted() { return !!window.audioManager?.isMuted; }
}

const audioManagerInstance = new AudioManagerEngine();
window.audioManager = audioManagerInstance;
window.AudioManager = audioManagerInstance;
