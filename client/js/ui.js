class UIManagerEngine {
  constructor() {
    this.screens = {
      home: document.getElementById("screen-home"),
      create: document.getElementById("screen-create"),
      join: document.getElementById("screen-join"),
      lobby: document.getElementById("screen-lobby"),
      game: document.getElementById("screen-game")
    };

    this.settingsModal = document.getElementById("modal-settings");
    this.levelClearModal = document.getElementById("modal-level-clear");
    this.toastContainer = document.getElementById("toast-container");

    this.currentRoom = null;
    this.localPlayerId = null;

    this.initEventListeners();
  }

  showScreen(screenName) {
    for (const [key, el] of Object.entries(this.screens)) {
      if (el) {
        if (key === screenName) {
          el.classList.remove("hidden");
        } else {
          el.classList.add("hidden");
        }
      }
    }
  }

  showToast(message, type = "info") {
    if (!this.toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("fade-out");
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  updateLobby(room, localPlayerId) {
    this.currentRoom = room;
    this.localPlayerId = localPlayerId;

    const roomCodeEl = document.getElementById("lobby-room-code");
    if (roomCodeEl) roomCodeEl.textContent = room.code;

    const playerListEl = document.getElementById("lobby-player-list");
    if (playerListEl) {
      playerListEl.innerHTML = "";
      for (const p of room.players) {
        const isSelf = p.id === localPlayerId;
        const row = document.createElement("div");
        row.className = `player-row ${isSelf ? "player-self" : ""}`;

        const colorDot = `<span class="color-dot" style="background-color: ${p.color};"></span>`;
        const hostBadge = p.isHost ? `<span class="badge badge-host">HOST</span>` : "";
        const readyBadge = p.isReady
          ? `<span class="badge badge-ready">READY</span>`
          : `<span class="badge badge-waiting">WAITING</span>`;

        row.innerHTML = `
          <div class="player-info">
            ${colorDot}
            <span class="player-name">${p.slot}. ${this.escapeHtml(p.name)} ${isSelf ? "(You)" : ""}</span>
            ${hostBadge}
          </div>
          ${readyBadge}
        `;
        playerListEl.appendChild(row);
      }
    }

    // Host controls
    const localPlayer = room.players.find((p) => p.id === localPlayerId);
    const startBtn = document.getElementById("btn-start-game");
    const readyBtn = document.getElementById("btn-toggle-ready");

    if (startBtn) {
      if (localPlayer && localPlayer.isHost) {
        startBtn.classList.remove("hidden");
        // Enabled if all ready or host starts
        startBtn.disabled = room.players.length < 1;
      } else {
        startBtn.classList.add("hidden");
      }
    }

    if (readyBtn) {
      if (localPlayer) {
        readyBtn.textContent = localPlayer.isReady ? "CANCEL READY" : "READY UP";
        readyBtn.className = `btn ${localPlayer.isReady ? "btn-secondary" : "btn-primary"}`;
      }
    }
  }

  showLevelClear(stageName) {
    if (!this.levelClearModal) return;
    const stageTitleEl = document.getElementById("clear-stage-name");
    if (stageTitleEl) {
      stageTitleEl.textContent = stageName ? stageName.toUpperCase().replace("_", " ") : "STAGE";
    }
    this.levelClearModal.classList.remove("hidden");
  }

  hideLevelClear() {
    if (this.levelClearModal) {
      this.levelClearModal.classList.add("hidden");
    }
  }

  openSettings() {
    if (this.settingsModal) {
      this.settingsModal.classList.remove("hidden");
      this.renderControls(this.selectedPlayerTab || 1);
    }
  }

  closeSettings() {
    if (this.settingsModal) {
      if (window.inputHandler) {
        window.inputHandler.cancelRebind();
      }
      this.settingsModal.classList.add("hidden");
    }
  }

  renderControls(playerNum = 1) {
    this.selectedPlayerTab = playerNum;
    const container = document.getElementById("controls-bindings-list");
    if (!container) return;

    const handler = window.inputHandler;
    const bindings = handler ? handler.getBindings(playerNum) : null;
    if (!bindings) return;

    const actions = [
      { key: "left", label: "Move Left" },
      { key: "right", label: "Move Right" },
      { key: "jump", label: "Jump" },
      { key: "action", label: "Down / Action" }
    ];

    container.innerHTML = "";
    actions.forEach((act) => {
      const row = document.createElement("div");
      row.className = "controls-binding-row";

      const labelSpan = document.createElement("span");
      labelSpan.textContent = act.label;

      const btn = document.createElement("button");
      btn.className = "controls-binding-btn";
      btn.setAttribute("data-action", act.key);

      const currentKeys = bindings[act.key] || [];
      const formattedKeys = currentKeys.map((k) => window.InputHandler.formatKeyName(k)).join(" / ");
      btn.textContent = formattedKeys || "UNBOUND";

      btn.addEventListener("click", () => {
        if (!window.inputHandler) return;
        btn.textContent = "PRESS KEY...";
        btn.classList.add("rebinding");

        window.inputHandler.startRebind(playerNum, act.key, (newCode, cancelled) => {
          btn.classList.remove("rebinding");
          this.renderControls(playerNum);
          if (!cancelled && newCode) {
            this.showToast(`Bound ${act.label} to ${window.InputHandler.formatKeyName(newCode)}`, "success");
          }
        });
      });

      row.appendChild(labelSpan);
      row.appendChild(btn);
      container.appendChild(row);
    });
  }

  initControlsUI() {
    const tabs = document.querySelectorAll("#player-tab-bar .player-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const pNum = parseInt(tab.getAttribute("data-player"), 10) || 1;
        this.renderControls(pNum);
      });
    });

    const resetBtn = document.getElementById("btn-reset-controls");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (window.inputHandler) {
          window.inputHandler.resetToDefaults();
          this.renderControls(this.selectedPlayerTab || 1);
          this.showToast("All controls reset to defaults", "info");
        }
      });
    }
  }

  initEventListeners() {
    this.initControlsUI();

    // Copy room code
    const copyBtn = document.getElementById("btn-copy-code");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const code = document.getElementById("lobby-room-code")?.textContent;
        if (code && navigator.clipboard) {
          navigator.clipboard.writeText(code).then(() => {
            this.showToast("Room code copied to clipboard!", "success");
          });
        }
      });
    }

    // Volume sliders
    const masterSlider = document.getElementById("slider-master");
    const musicSlider = document.getElementById("slider-music");
    const sfxSlider = document.getElementById("slider-sfx");

    if (masterSlider) {
      masterSlider.value = window.AudioManager?.masterVolume || 0.8;
      masterSlider.addEventListener("input", (e) => {
        window.AudioManager?.setMasterVolume(parseFloat(e.target.value));
      });
    }

    if (musicSlider) {
      musicSlider.value = window.AudioManager?.musicVolume || 0.6;
      musicSlider.addEventListener("input", (e) => {
        window.AudioManager?.setMusicVolume(parseFloat(e.target.value));
      });
    }

    if (sfxSlider) {
      sfxSlider.value = window.AudioManager?.sfxVolume || 0.8;
      sfxSlider.addEventListener("input", (e) => {
        window.AudioManager?.setSFXVolume(parseFloat(e.target.value));
      });
    }

    // Settings modal close
    const closeSettingsBtn = document.getElementById("btn-close-settings");
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener("click", () => this.closeSettings());
    }
  }

  escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  static showScreen(name) { return window.uiManager?.showScreen(name); }
  static showToast(msg, type) { return window.uiManager?.showToast(msg, type); }
  static updateLobby(room, id) { return window.uiManager?.updateLobby(room, id); }
  static showLevelClear(name) { return window.uiManager?.showLevelClear(name); }
  static hideLevelClear() { return window.uiManager?.hideLevelClear(); }
  static openSettings() { return window.uiManager?.openSettings(); }
  static closeSettings() { return window.uiManager?.closeSettings(); }
}

const uiManagerInstance = new UIManagerEngine();
window.uiManager = uiManagerInstance;
window.UIManager = uiManagerInstance;
