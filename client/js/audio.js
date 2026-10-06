// PICO PARK Web Audio Manager with Studio-Grade Procedural Synthesizer & Deduplication

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
    this.loadingPromises = new Map();
    this.currentBgmSource = null;
    this.currentBgmName = null;
    this.isUnlocked = false;
    this.isMuted = false;

    // Deduplication of server event IDs to prevent duplicate audio playback across snapshot broadcasts
    this.seenEventIds = new Set();

    // SFX Throttling / Debouncing to prevent duplicate or every-frame audio spam
    this.lastPlayedTimes = new Map();
    this.cooldowns = {
      jump: 80,
      bound: 120,
      head: 120,
      hit: 150,
      switch: 150,
      get: 300,
      clear: 500,
      goal: 300,
      start: 500,
      win: 2500,
      fanf01: 2500,
      fanf02: 2500,
      retry: 250,
      join: 300,
      leave: 300,
      failure: 400,
      tick: 60,
      blip: 80,
      select: 80,
      default: 80
    };

    // Load saved volume preferences
    this.loadSettings();
  }

  loadSettings() {
    try {
      if (typeof localStorage === "undefined") return;
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
      if (typeof localStorage === "undefined") return;
      localStorage.setItem("pico_vol_master", this.masterVolume);
      localStorage.setItem("pico_vol_music", this.musicVolume);
      localStorage.setItem("pico_vol_sfx", this.sfxVolume);
      localStorage.setItem("pico_vol_muted", this.isMuted);
    } catch (e) {}
  }

  initContext() {
    if (this.ctx) return;
    if (typeof window === "undefined") return;
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

    // Preload audio files (BGM, fallbacks)
    this.preloadAll();
  }

  loadSound(name, urls) {
    if (!this.ctx) this.initContext();
    if (!this.ctx) return Promise.resolve(null);

    if (this.buffers.has(name)) {
      return Promise.resolve(this.buffers.get(name));
    }

    if (this.loadingPromises.has(name)) {
      return this.loadingPromises.get(name);
    }

    const urlList = Array.isArray(urls) ? urls : [urls];

    const loadPromise = (async () => {
      for (const url of urlList) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const arrayBuffer = await res.arrayBuffer();
          const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
          this.buffers.set(name, audioBuffer);
          this.loadingPromises.delete(name);
          return audioBuffer;
        } catch (err) {
          // Fall through to next candidate URL
        }
      }
      this.loadingPromises.delete(name);
      console.warn(`[Audio] Could not load sound '${name}' from candidates:`, urlList);
      return null;
    })();

    this.loadingPromises.set(name, loadPromise);
    return loadPromise;
  }

  preloadAll() {
    const sounds = [
      { name: "bgm", urls: ["assets/audio/bgm.mp3", "assets/audio/bgm.ogg"] },
      { name: "title_bgm", urls: ["assets/audio/title_bgm.ogg", "assets/audio/title_bgm.mp3"] }
    ];

    for (const s of sounds) {
      if (!this.buffers.has(s.name)) {
        this.loadSound(s.name, s.urls);
      }
    }
  }

  // Studio-grade procedural Web Audio synthesis for clean, pleasant, non-intrusive sound effects
  synthSFX(name) {
    if (!this.ctx || !this.sfxGain) return false;
    const ctx = this.ctx;
    const dest = this.sfxGain;
    const t = ctx.currentTime;

    switch (name) {
      case "jump": {
        // Soft cheerful rising chirp
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(340, t + 0.08);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.22, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.09);
        return true;
      }

      case "bound": {
        // Soft cushioned landing thud
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = "triangle";
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(180, t);
        osc.frequency.setValueAtTime(110, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.065);
        g.gain.setValueAtTime(0.24, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
        osc.connect(filter);
        filter.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.07);
        return true;
      }

      case "head": {
        // Soft hollow pop on player head contact
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(290, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.06);
        g.gain.setValueAtTime(0.24, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.07);
        return true;
      }

      case "hit": {
        // Low soft wooden nudge / friction when pushing a box
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = "triangle";
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(150, t);
        osc.frequency.setValueAtTime(130, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.07);
        g.gain.setValueAtTime(0.20, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.connect(filter);
        filter.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.075);
        return true;
      }

      case "switch": {
        // Crisp dual-click mechanical switch
        [ [440, t, 0.015], [700, t + 0.02, 0.025] ].forEach(([freq, startTime, dur]) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, startTime);
          g.gain.setValueAtTime(0.18, startTime);
          g.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
          osc.connect(g);
          g.connect(dest);
          osc.start(startTime);
          osc.stop(startTime + dur + 0.005);
        });
        return true;
      }

      case "get": {
        // Melodic sparkling two-note pickup chime (D5 -> A5)
        const notes = [
          { freq: 587.33, start: 0, dur: 0.10, vol: 0.22 },
          { freq: 880.00, start: 0.08, dur: 0.26, vol: 0.25 }
        ];
        notes.forEach((n) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(n.freq, t + n.start);
          g.gain.setValueAtTime(0.001, t + n.start);
          g.gain.linearRampToValueAtTime(n.vol, t + n.start + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, t + n.start + n.dur);
          osc.connect(g);
          g.connect(dest);
          osc.start(t + n.start);
          osc.stop(t + n.start + n.dur + 0.01);
        });
        return true;
      }

      case "clear": {
        // Majestic 3-tone arpeggio unlock chime: C5 -> E5 -> G5
        const triad = [
          { freq: 523.25, start: 0, dur: 0.12, vol: 0.22 },
          { freq: 659.25, start: 0.09, dur: 0.12, vol: 0.22 },
          { freq: 783.99, start: 0.18, dur: 0.38, vol: 0.26 }
        ];
        triad.forEach((n) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(n.freq, t + n.start);
          g.gain.setValueAtTime(0.001, t + n.start);
          g.gain.linearRampToValueAtTime(n.vol, t + n.start + 0.015);
          g.gain.exponentialRampToValueAtTime(0.001, t + n.start + n.dur);
          osc.connect(g);
          g.connect(dest);
          osc.start(t + n.start);
          osc.stop(t + n.start + n.dur + 0.01);
        });
        return true;
      }

      case "goal": {
        // Soft arrival chime when player steps into the open goal doorway
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(698.46, t);
        osc.frequency.exponentialRampToValueAtTime(880, t + 0.06);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.20, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.19);
        return true;
      }

      case "start": {
        // Energetic ascending ready pulse
        const notes = [
          { freq: 440, start: 0, dur: 0.07, vol: 0.18 },
          { freq: 554.37, start: 0.06, dur: 0.07, vol: 0.18 },
          { freq: 659.25, start: 0.12, dur: 0.20, vol: 0.22 }
        ];
        notes.forEach((n) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(n.freq, t + n.start);
          g.gain.setValueAtTime(0.001, t + n.start);
          g.gain.linearRampToValueAtTime(n.vol, t + n.start + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, t + n.start + n.dur);
          osc.connect(g);
          g.connect(dest);
          osc.start(t + n.start);
          osc.stop(t + n.start + n.dur + 0.01);
        });
        return true;
      }

      case "win":
      case "fanf01":
      case "fanf02": {
        // Uplifting celebratory fanfare: arpeggio + triumphant major chord shimmer
        const arp = [
          { freq: 523.25, start: 0, dur: 0.12, vol: 0.22 },
          { freq: 659.25, start: 0.10, dur: 0.12, vol: 0.22 },
          { freq: 783.99, start: 0.20, dur: 0.15, vol: 0.24 },
          { freq: 1046.50, start: 0.32, dur: 0.35, vol: 0.26 }
        ];
        const chord = [523.25, 659.25, 783.99, 1046.50];
        arp.forEach((n) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(n.freq, t + n.start);
          g.gain.setValueAtTime(0.001, t + n.start);
          g.gain.linearRampToValueAtTime(n.vol, t + n.start + 0.015);
          g.gain.exponentialRampToValueAtTime(0.001, t + n.start + n.dur);
          osc.connect(g);
          g.connect(dest);
          osc.start(t + n.start);
          osc.stop(t + n.start + n.dur + 0.01);
        });
        chord.forEach((freq) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, t + 0.48);
          g.gain.setValueAtTime(0.001, t + 0.48);
          g.gain.linearRampToValueAtTime(0.10, t + 0.52);
          g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
          osc.connect(g);
          g.connect(dest);
          osc.start(t + 0.48);
          osc.stop(t + 1.45);
        });
        return true;
      }

      case "retry": {
        // Soft rewind swoosh
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = "sine";
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(600, t);
        osc.frequency.setValueAtTime(420, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.20, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(filter);
        filter.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.13);
        return true;
      }

      case "join": {
        // Welcoming two-tone chime (A4 -> C#5)
        [ { freq: 440, start: 0, dur: 0.10 }, { freq: 554.37, start: 0.08, dur: 0.18 } ].forEach((n) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(n.freq, t + n.start);
          g.gain.setValueAtTime(0.001, t + n.start);
          g.gain.linearRampToValueAtTime(0.20, t + n.start + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, t + n.start + n.dur);
          osc.connect(g);
          g.connect(dest);
          osc.start(t + n.start);
          osc.stop(t + n.start + n.dur + 0.01);
        });
        return true;
      }

      case "leave": {
        // Gentle descending two-tone departure cue
        [ { freq: 554.37, start: 0, dur: 0.10 }, { freq: 440, start: 0.08, dur: 0.18 } ].forEach((n) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(n.freq, t + n.start);
          g.gain.setValueAtTime(0.001, t + n.start);
          g.gain.linearRampToValueAtTime(0.18, t + n.start + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, t + n.start + n.dur);
          osc.connect(g);
          g.connect(dest);
          osc.start(t + n.start);
          osc.stop(t + n.start + n.dur + 0.01);
        });
        return true;
      }

      case "failure": {
        // Friendly minor descent on player hazard/failure
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = "triangle";
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(450, t);
        osc.frequency.setValueAtTime(320, t);
        osc.frequency.exponentialRampToValueAtTime(140, t + 0.20);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.22, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
        osc.connect(filter);
        filter.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.21);
        return true;
      }

      case "tick":
      case "blip": {
        // Quick subtle blip
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1100, t);
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.025);
        return true;
      }

      case "select": {
        // Soft UI button feedback
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(580, t);
        osc.frequency.exponentialRampToValueAtTime(820, t + 0.035);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.04);
        return true;
      }

      default:
        return false;
    }
  }

  playSFX(name, eventId = null) {
    if (!this.ctx || !this.isUnlocked || this.isMuted) return;

    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    // Deduplicate event ID if provided
    if (eventId) {
      if (this.seenEventIds.has(eventId)) return;
      this.seenEventIds.add(eventId);
      if (this.seenEventIds.size > 500) {
        const it = this.seenEventIds.values();
        for (let i = 0; i < 200; i++) {
          this.seenEventIds.delete(it.next().value);
        }
      }
    }

    // Cooldown check to eliminate duplicate / every-frame sound triggers
    const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const cd = this.cooldowns[name] || this.cooldowns.default;
    const last = this.lastPlayedTimes.get(name) || 0;
    if (now - last < cd) return;
    this.lastPlayedTimes.set(name, now);

    // Prefer studio-grade procedural synthesis
    if (this.synthSFX(name)) {
      return;
    }

    // Fallback to preloaded audio buffer if synthesized variant not available
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
    this.currentBgmName = name;

    const buffer = this.buffers.get(name);
    if (!buffer) {
      // If not loaded yet, load candidates and play when ready
      const candidates = [`assets/audio/${name}.mp3`, `assets/audio/${name}.ogg`];
      this.loadSound(name, candidates).then((loadedBuf) => {
        if (loadedBuf && this.currentBgmName === name && !this.currentBgmSource) {
          this.startBgmSource(loadedBuf, name);
        }
      });
      return;
    }

    this.startBgmSource(buffer, name);
  }

  startBgmSource(buffer, name) {
    if (!this.ctx || !this.musicGain || !this.isUnlocked) return;
    if (this.currentBgmSource) return; // Prevent duplicate audio playback

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

  pauseBGM() {
    if (this.ctx && this.ctx.state === "running") {
      this.ctx.suspend();
    }
  }

  resumeBGM() {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
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
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx ? this.ctx.currentTime : 0);
    }
    this.saveSettings();
  }

  setMusicVolume(val) {
    this.musicVolume = Math.max(0, Math.min(1, val));
    if (this.musicGain) {
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx ? this.ctx.currentTime : 0);
    }
    this.saveSettings();
  }

  setSFXVolume(val) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
    if (this.sfxGain) {
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx ? this.ctx.currentTime : 0);
    }
    this.saveSettings();
  }

  setMuted(muted) {
    this.isMuted = !!muted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx ? this.ctx.currentTime : 0);
    }
    this.saveSettings();
  }

  toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  static unlock() { return window.audioManager?.unlock(); }
  static playSFX(name, eventId = null) { return window.audioManager?.playSFX(name, eventId); }
  static playBGM(name) { return window.audioManager?.playBGM(name); }
  static pauseBGM() { return window.audioManager?.pauseBGM(); }
  static resumeBGM() { return window.audioManager?.resumeBGM(); }
  static stopBGM() { return window.audioManager?.stopBGM(); }
  static setMasterVolume(val) { return window.audioManager?.setMasterVolume(val); }
  static setMusicVolume(val) { return window.audioManager?.setMusicVolume(val); }
  static setSFXVolume(val) { return window.audioManager?.setSFXVolume(val); }
  static setMuted(val) { return window.audioManager?.setMuted(val); }
  static toggleMute() { return window.audioManager?.toggleMute(); }
  static get isMuted() { return !!window.audioManager?.isMuted; }
}

const audioManagerInstance = new AudioManagerEngine();
if (typeof window !== "undefined") {
  window.audioManager = audioManagerInstance;
  window.AudioManager = audioManagerInstance;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = AudioManagerEngine;
}
