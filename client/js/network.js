// PICO PARK Web Network Client with Snapshot Interpolation

class NetworkClient {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.ws = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.localPlayerId = null;

    // Snapshot interpolation buffer
    this.snapshots = [];
    this.interpolationDelay = 60; // 60ms buffer for smooth interpolation
  }

  connect() {
    let wsUrl;
    if (window.location.protocol === "file:" || !window.location.host) {
      wsUrl = "ws://localhost:3001";
    } else {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${protocol}//${window.location.host}`;
    }

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        console.log(`[Network] Connected to PICO PARK server at ${wsUrl}`);
        if (this.callbacks.onConnected) this.callbacks.onConnected();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (e) {
          console.error("[Network] Malformed server message:", e);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        console.warn("[Network] Connection closed");
        if (this.callbacks.onDisconnect) this.callbacks.onDisconnect();
      };

      this.ws.onerror = (err) => {
        console.error("[Network] Socket error:", err);
      };
    } catch (err) {
      console.error("[Network] Connection failed:", err);
    }
  }

  send(type, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        // Wait for connection to open then send
        this.ws.addEventListener("open", () => {
          this.ws.send(JSON.stringify({ type, ...payload }));
        }, { once: true });
        return;
      }
      console.warn("[Network] Socket not open. State:", this.ws ? this.ws.readyState : "null");
      if (this.callbacks.onError) {
        this.callbacks.onError("Unable to connect to server. Please check your connection.");
      }
      return;
    }
    this.ws.send(JSON.stringify({ type, ...payload }));
  }

  createRoom(name, settings) {
    this.send(CONSTANTS.MSG.CREATE_ROOM, { name, settings });
  }

  joinRoom(code, name) {
    this.send(CONSTANTS.MSG.JOIN_ROOM, { code, name });
  }

  setReady(ready) {
    this.send(CONSTANTS.MSG.SET_READY, { ready });
  }

  startGame() {
    this.send(CONSTANTS.MSG.START_GAME);
  }

  restartLevel() {
    this.send(CONSTANTS.MSG.RESTART_LEVEL);
  }

  sendInput(inputs) {
    this.send(CONSTANTS.MSG.PLAYER_INPUT, { inputs });
  }

  sendEmote(emote) {
    this.send(CONSTANTS.MSG.PLAYER_EMOTE, { emote });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case CONSTANTS.MSG.ROOM_CREATED:
      case CONSTANTS.MSG.ROOM_JOINED:
        this.localPlayerId = msg.playerId ||
          msg.room.players.find((p) => p.isHost && msg.type === CONSTANTS.MSG.ROOM_CREATED)?.id ||
          msg.room.players[msg.room.players.length - 1].id;
        if (this.callbacks.onRoomJoined) this.callbacks.onRoomJoined(msg.room, this.localPlayerId);
        break;

      case CONSTANTS.MSG.ROOM_STATE:
        if (this.callbacks.onRoomState) this.callbacks.onRoomState(msg.room);
        break;

      case CONSTANTS.MSG.GAME_STARTED:
        this.snapshots = [];
        if (this.callbacks.onGameStarted) this.callbacks.onGameStarted(msg.stage, msg.players);
        break;

      case CONSTANTS.MSG.GAME_SNAPSHOT:
        this.addSnapshot(msg.snapshot);
        break;

      case CONSTANTS.MSG.LEVEL_CLEAR:
        if (this.callbacks.onLevelClear) this.callbacks.onLevelClear(msg.stage);
        break;

      case CONSTANTS.MSG.NEXT_LEVEL:
        this.snapshots = [];
        if (this.callbacks.onNextLevel) this.callbacks.onNextLevel(msg.stage);
        break;

      case CONSTANTS.MSG.EMOTE_TRIGGER:
        if (this.callbacks.onEmote) this.callbacks.onEmote(msg.playerId, msg.emote);
        break;

      case CONSTANTS.MSG.ERROR:
        if (this.callbacks.onError) this.callbacks.onError(msg.message);
        break;
    }
  }

  addSnapshot(snap) {
    // Process server events (sounds, triggers)
    if (snap.events && snap.events.length > 0) {
      for (const ev of snap.events) {
        if (ev.type === "sound" && window.AudioManager) {
          // Do not play win/fanfare here - level clear is authoritatively handled by onLevelClear
          if (ev.name !== "win" && ev.name !== "fanf01" && ev.name !== "fanf02") {
            window.AudioManager.playSFX(ev.name);
          }
        }
      }
    }

    this.snapshots.push(snap);
    // Keep last 15 snapshots (~0.5s of history)
    if (this.snapshots.length > 15) {
      this.snapshots.shift();
    }
  }

  // Linear interpolation for smooth 60fps rendering
  getInterpolatedState() {
    if (this.snapshots.length === 0) return null;
    if (this.snapshots.length === 1) return this.snapshots[0];

    const renderTime = Date.now() - this.interpolationDelay;

    // Find the two surrounding snapshots: s0 <= renderTime <= s1
    let s0 = null;
    let s1 = null;

    for (let i = 0; i < this.snapshots.length - 1; i++) {
      if (this.snapshots[i].t <= renderTime && renderTime <= this.snapshots[i + 1].t) {
        s0 = this.snapshots[i];
        s1 = this.snapshots[i + 1];
        break;
      }
    }

    if (!s0 || !s1) {
      // Extrapolate to latest snapshot
      return this.snapshots[this.snapshots.length - 1];
    }

    const duration = s1.t - s0.t;
    const alpha = duration > 0 ? (renderTime - s0.t) / duration : 1.0;

    // Interpolate players
    const interpolatedPlayers = [];
    const p1Map = new Map((s1.players || []).map((p) => [p.id, p]));

    for (const p0 of s0.players || []) {
      const p1 = p1Map.get(p0.id);
      if (p1) {
        interpolatedPlayers.push({
          ...p1,
          x: p0.x + (p1.x - p0.x) * alpha,
          y: p0.y + (p1.y - p0.y) * alpha
        });
      } else {
        interpolatedPlayers.push(p0);
      }
    }

    // Interpolate boxes
    const interpolatedBoxes = [];
    const b1Map = new Map((s1.boxes || []).map((b) => [b.id, b]));

    for (const b0 of s0.boxes || []) {
      const b1 = b1Map.get(b0.id);
      if (b1) {
        interpolatedBoxes.push({
          ...b1,
          x: b0.x + (b1.x - b0.x) * alpha,
          y: b0.y + (b1.y - b0.y) * alpha
        });
      } else {
        interpolatedBoxes.push(b0);
      }
    }

    return {
      t: renderTime,
      players: interpolatedPlayers,
      boxes: interpolatedBoxes,
      switches: s1.switches,
      bridges: s1.bridges,
      key: s1.key,
      goal: s1.goal,
      events: []
    };
  }
}

window.NetworkClient = NetworkClient;
