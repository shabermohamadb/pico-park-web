// PICO PARK Web Network Client with Snapshot Interpolation & Latency Tracking

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

    // Latency & performance telemetry
    this.ping = 0;
    this.serverTickDuration = 0;
    this.pingInterval = null;
    this.recentPackets = 0;
    this.updatesPerSecond = 0;
    this.lastPacketRateCheck = typeof performance !== "undefined" ? performance.now() : Date.now();
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
        this.startPingLoop();
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
        this.stopPingLoop();
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

  startPingLoop() {
    this.stopPingLoop();
    this.pingInterval = setInterval(() => {
      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        const clientTime = typeof performance !== "undefined" ? performance.now() : Date.now();
        this.send("ping", { clientTime });
      }
    }, 1500);
  }

  stopPingLoop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  send(type, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        // Wait for connection to open then send
        this.ws.addEventListener(
          "open",
          () => {
            this.ws.send(JSON.stringify({ type, ...payload }));
          },
          { once: true }
        );
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

  addLocalPlayer(name = null) {
    this.send(CONSTANTS.MSG.ADD_LOCAL_PLAYER, { name });
  }

  sendInput(inputs, targetPlayerId = null) {
    this.send(CONSTANTS.MSG.PLAYER_INPUT, { inputs, targetPlayerId });
  }

  sendEmote(emote) {
    this.send(CONSTANTS.MSG.PLAYER_EMOTE, { emote });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case "pong":
        if (msg.clientTime !== undefined) {
          const now = typeof performance !== "undefined" ? performance.now() : Date.now();
          this.ping = Math.round(now - msg.clientTime);
        }
        if (msg.serverTickDuration !== undefined) {
          this.serverTickDuration = msg.serverTickDuration;
        }
        break;

      case CONSTANTS.MSG.ROOM_CREATED:
      case CONSTANTS.MSG.ROOM_JOINED:
        this.localPlayerId =
          msg.playerId ||
          msg.room.players.find((p) => p.isHost && msg.type === CONSTANTS.MSG.ROOM_CREATED)?.id ||
          msg.room.players[msg.room.players.length - 1].id;
        if (this.callbacks.onRoomJoined) this.callbacks.onRoomJoined(msg.room, this.localPlayerId);
        break;

      case CONSTANTS.MSG.LOCAL_PLAYER_ADDED:
        if (this.callbacks.onLocalPlayerAdded) {
          this.callbacks.onLocalPlayerAdded(msg.playerId, msg.slot);
        }
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
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    snap.clientReceiveTime = now;

    if (snap.tickDuration !== undefined) {
      this.serverTickDuration = snap.tickDuration;
    }

    // Packet frequency monitor
    this.recentPackets++;
    if (now - this.lastPacketRateCheck >= 1000) {
      this.updatesPerSecond = Math.round((this.recentPackets * 1000) / (now - this.lastPacketRateCheck));
      this.recentPackets = 0;
      this.lastPacketRateCheck = now;
    }

    // Process server events (sounds, triggers)
    if (snap.events && snap.events.length > 0) {
      for (const ev of snap.events) {
        if (ev.id) {
          if (!this.seenEventIds) this.seenEventIds = new Set();
          if (this.seenEventIds.has(ev.id)) continue;
          this.seenEventIds.add(ev.id);
          if (this.seenEventIds.size > 500) {
            const it = this.seenEventIds.values();
            for (let i = 0; i < 200; i++) {
              this.seenEventIds.delete(it.next().value);
            }
          }
        }
        if (ev.type === "sound" && window.AudioManager) {
          // Do not play win/fanfare here - level clear is authoritatively handled by onLevelClear
          if (ev.name !== "win" && ev.name !== "fanf01" && ev.name !== "fanf02") {
            window.AudioManager.playSFX(ev.name, ev.id);
          }
        }
      }
    }

    this.snapshots.push(snap);
    // Keep last 20 snapshots (~0.6s of history)
    if (this.snapshots.length > 20) {
      this.snapshots.shift();
    }
  }

  interpolateTwoSnapshots(s0, s1, alpha) {
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

    // Client-side visual de-penetration clamp: ensure interpolated players never visually overlap boxes
    const pW = (typeof CONSTANTS !== "undefined" && CONSTANTS.PLAYER_WIDTH) || 42;
    const pH = (typeof CONSTANTS !== "undefined" && CONSTANTS.PLAYER_HEIGHT) || 46;
    for (const p of interpolatedPlayers) {
      for (const b of interpolatedBoxes) {
        const overlapX = (pW + b.w) / 2 - Math.abs(p.x - b.x);
        const overlapY = (pH + b.h) / 2 - Math.abs(p.y - b.y);
        if (overlapX > 0.001 && overlapY > 0.001) {
          if (overlapX < overlapY) {
            const pushDir = p.x < b.x ? -1 : 1;
            p.x = b.x + pushDir * ((pW + b.w) / 2);
          } else {
            const pushDir = p.y < b.y ? -1 : 1;
            p.y = b.y + pushDir * ((pH + b.h) / 2);
          }
        }
      }
    }

    return {
      t: s1.t,
      clientReceiveTime: s1.clientReceiveTime,
      stageState: s1.stageState,
      players: interpolatedPlayers,
      boxes: interpolatedBoxes,
      switches: s1.switches,
      bridges: s1.bridges,
      key: s1.key,
      goal: s1.goal,
      events: []
    };
  }

  // Linear interpolation using monotonic client receive timestamps
  // Completely eliminates clock drift between Render server and browser client
  getInterpolatedState() {
    if (this.snapshots.length === 0) return null;
    if (this.snapshots.length === 1) return this.snapshots[0];

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const renderTime = now - this.interpolationDelay;

    // Find the two surrounding snapshots: s0 <= renderTime <= s1
    let s0 = null;
    let s1 = null;

    for (let i = 0; i < this.snapshots.length - 1; i++) {
      const t0 = this.snapshots[i].clientReceiveTime;
      const t1 = this.snapshots[i + 1].clientReceiveTime;
      if (t0 <= renderTime && renderTime <= t1) {
        s0 = this.snapshots[i];
        s1 = this.snapshots[i + 1];
        break;
      }
    }

    if (!s0 || !s1) {
      const latest = this.snapshots[this.snapshots.length - 1];
      if (renderTime > latest.clientReceiveTime && this.snapshots.length >= 2) {
        const prev = this.snapshots[this.snapshots.length - 2];
        const span = latest.clientReceiveTime - prev.clientReceiveTime;
        if (span > 0) {
          const extra = Math.min(renderTime - latest.clientReceiveTime, 50);
          const alphaExtrap = Math.min(extra / span, 1.0);
          return this.interpolateTwoSnapshots(prev, latest, 1.0 + alphaExtrap * 0.5);
        }
      }
      return latest;
    }

    const duration = s1.clientReceiveTime - s0.clientReceiveTime;
    const alpha = duration > 0 ? (renderTime - s0.clientReceiveTime) / duration : 1.0;

    return this.interpolateTwoSnapshots(s0, s1, alpha);
  }
}

if (typeof window !== "undefined") {
  window.NetworkClient = NetworkClient;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = NetworkClient;
}
