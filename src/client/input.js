// PICO PARK Browser Input Handler
// Inspired by Reference 2 (pico-park-classic-controls 6-player layouts)

const DEFAULT_KEY_CONFIGS = {
  1: {
    name: "Player 1",
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["KeyW", "Space", "ArrowUp"],
    action: ["KeyS", "ArrowDown"]
  },
  2: {
    name: "Player 2",
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    jump: ["ArrowUp"],
    action: ["ArrowDown"]
  },
  3: {
    name: "Player 3",
    left: ["KeyF"],
    right: ["KeyH"],
    jump: ["KeyT"],
    action: ["KeyG"]
  },
  4: {
    name: "Player 4",
    left: ["KeyJ"],
    right: ["KeyL"],
    jump: ["KeyI"],
    action: ["KeyK"]
  },
  5: {
    name: "Player 5",
    left: ["Numpad1", "KeyV"],
    right: ["Numpad3", "KeyN"],
    jump: ["Numpad5", "KeyB"],
    action: ["Numpad2", "KeyC"]
  },
  6: {
    name: "Player 6",
    left: ["Numpad7", "BracketLeft"],
    right: ["Numpad9", "BracketRight"],
    jump: ["Numpad8", "NumpadDivide", "Backslash"],
    action: ["Numpad5", "Quote"]
  }
};

class InputHandler {
  constructor(onInputChanged, onEmote) {
    this.onInputChanged = onInputChanged;
    this.onEmote = onEmote;

    this.configs = this.loadConfigs();
    this.activeKeys = new Set();
    this.enabled = true;
    this.rebinding = null; // { playerNum, action, onDone }

    // Map: slot (1 to 6) -> playerId
    this.localPlayers = new Map();
    this.playerStates = new Map(); // slot -> { left, right, jump, action }
    this.virtualButtons = new Map(); // slot -> { left, right, jump, action }

    this.bindEvents();
  }

  loadConfigs() {
    try {
      const stored = localStorage.getItem("pico_park_controls_v2");
      if (stored) {
        const parsed = JSON.parse(stored);
        const merged = JSON.parse(JSON.stringify(DEFAULT_KEY_CONFIGS));
        for (const slot of [1, 2, 3, 4, 5, 6]) {
          if (parsed[slot]) {
            merged[slot] = { ...merged[slot], ...parsed[slot] };
          }
        }
        return merged;
      }
    } catch (e) {
      console.warn("[Input] Failed to load controls from localStorage", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_KEY_CONFIGS));
  }

  saveConfigs() {
    try {
      localStorage.setItem("pico_park_controls_v2", JSON.stringify(this.configs));
    } catch (e) {
      console.warn("[Input] Failed to save controls to localStorage", e);
    }
  }

  resetToDefaults() {
    this.configs = JSON.parse(JSON.stringify(DEFAULT_KEY_CONFIGS));
    this.saveConfigs();
  }

  getBindings(playerNum) {
    return this.configs[playerNum] || DEFAULT_KEY_CONFIGS[1];
  }

  setBinding(playerNum, action, code) {
    if (!this.configs[playerNum]) return;
    this.configs[playerNum][action] = [code];
    this.saveConfigs();
  }

  startRebind(playerNum, action, onDone) {
    this.rebinding = { playerNum, action, onDone };
  }

  cancelRebind() {
    this.rebinding = null;
  }

  static formatKeyName(code) {
    if (!code) return "NONE";
    if (code.startsWith("Key")) return code.slice(3).toUpperCase();
    if (code.startsWith("Digit")) return code.slice(5);
    if (code.startsWith("Numpad")) return `NUM ${code.slice(6)}`;
    const map = {
      Space: "SPACE",
      ArrowLeft: "LEFT",
      ArrowRight: "RIGHT",
      ArrowUp: "UP",
      ArrowDown: "DOWN",
      BracketLeft: "[",
      BracketRight: "]",
      Backslash: "\\",
      Slash: "/",
      Comma: ",",
      Period: ".",
      Quote: "'",
      Semicolon: ";",
      Enter: "ENTER"
    };
    return map[code] || code.toUpperCase();
  }

  registerLocalPlayer(slot, playerId) {
    this.localPlayers.set(slot, playerId);
    this.playerStates.set(slot, { left: false, right: false, jump: false, action: false });
  }

  unregisterLocalPlayer(playerId) {
    for (const [slot, id] of this.localPlayers.entries()) {
      if (id === playerId) {
        this.localPlayers.delete(slot);
        this.playerStates.delete(slot);
        break;
      }
    }
  }

  clearLocalPlayers() {
    this.localPlayers.clear();
    this.playerStates.clear();
  }

  getInputForPlayer(playerId) {
    for (const [slot, id] of this.localPlayers.entries()) {
      if (id === playerId) {
        return this.playerStates.get(slot) || { left: false, right: false, jump: false, action: false };
      }
    }
    return { left: false, right: false, jump: false, action: false };
  }

  getInputStatesMap() {
    const map = new Map();
    for (const [slot, id] of this.localPlayers.entries()) {
      const state = this.playerStates.get(slot);
      if (state) {
        map.set(id, { ...state });
      }
    }
    return map;
  }

  bindEvents() {
    window.addEventListener("keydown", (e) => {
      // Don't capture inputs if user is typing in a text field
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      // Handle interactive rebinding
      if (this.rebinding) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          const cb = this.rebinding.onDone;
          this.rebinding = null;
          if (cb) cb(null, true);
          return;
        }
        const assignedCode = e.code || e.key;
        this.setBinding(this.rebinding.playerNum, this.rebinding.action, assignedCode);
        const cb = this.rebinding.onDone;
        this.rebinding = null;
        if (cb) cb(assignedCode, false);
        return;
      }

      const code = e.code;
      const key = e.key.toLowerCase();
      this.activeKeys.add(code);
      this.activeKeys.add(key);

      // Prevent scrolling on Space and Arrow keys during game
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "space"].includes(key)) {
        e.preventDefault();
      }

      // Check quick emotes (keys 1 to 6)
      if (["1", "2", "3", "4", "5", "6"].includes(key) && !e.repeat) {
        const emoteMap = {
          "1": "GO!",
          "2": "STOP!",
          "3": "HERE!",
          "4": "JUMP!",
          "5": "OK!",
          "6": "SORRY!"
        };
        if (this.onEmote && emoteMap[key]) {
          this.onEmote(emoteMap[key]);
        }
      }

      this.updateState();
    });

    window.addEventListener("keyup", (e) => {
      this.activeKeys.delete(e.code);
      this.activeKeys.delete(e.key.toLowerCase());
      this.updateState();
    });

    window.addEventListener("blur", () => {
      this.activeKeys.clear();
      this.updateState();
    });
  }

  setVirtualButton(action, isPressed, slot = 1) {
    if (!this.virtualButtons.has(slot)) {
      this.virtualButtons.set(slot, { left: false, right: false, jump: false, action: false });
    }
    const slotVirt = this.virtualButtons.get(slot);
    if (slotVirt[action] !== !!isPressed) {
      slotVirt[action] = !!isPressed;
      this.updateState();
    }
  }

  clearVirtualButtons(slot = 1) {
    if (slot === null || slot === undefined) {
      this.virtualButtons.clear();
    } else if (this.virtualButtons.has(slot)) {
      this.virtualButtons.set(slot, { left: false, right: false, jump: false, action: false });
    }
    this.updateState();
  }

  isActionActive(playerNum, action) {
    // Check virtual touch buttons first
    const virt = this.virtualButtons.get(playerNum);
    if (virt && virt[action]) {
      return true;
    }

    const binding = this.configs[playerNum];
    if (!binding || !binding[action]) return false;

    // If only 1 local player is active, Player 1 can use both WASD and Arrow Keys
    const isMultiLocal = this.localPlayers.size > 1;
    let allowedKeys = binding[action];

    if (isMultiLocal && playerNum === 1) {
      // Exclude arrow keys from P1 in multi-player couch mode so P1 & P2 don't collide
      allowedKeys = allowedKeys.filter((k) => !k.startsWith("Arrow") && !["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(k.toLowerCase()));
    }

    return allowedKeys.some((k) =>
      this.activeKeys.has(k) || this.activeKeys.has(k.toLowerCase())
    );
  }

  updateState() {
    if (!this.enabled) return;

    // If local multi-player slots are registered, poll each slot
    if (this.localPlayers.size > 0) {
      for (const [slot, playerId] of this.localPlayers.entries()) {
        const left = this.isActionActive(slot, "left");
        const right = this.isActionActive(slot, "right");
        const jump = this.isActionActive(slot, "jump");
        const action = this.isActionActive(slot, "action");

        const prevState = this.playerStates.get(slot) || {};
        const changed =
          prevState.left !== left ||
          prevState.right !== right ||
          prevState.jump !== jump ||
          prevState.action !== action;

        if (changed) {
          const newState = { left, right, jump, action };
          this.playerStates.set(slot, newState);
          if (this.onInputChanged) {
            this.onInputChanged(newState, playerId);
          }
        }
      }
    } else {
      // Default single player (Player 1)
      const left = this.isActionActive(1, "left");
      const right = this.isActionActive(1, "right");
      const jump = this.isActionActive(1, "jump");
      const action = this.isActionActive(1, "action");

      const prevState = this.playerStates.get(1) || {};
      const changed =
        prevState.left !== left ||
        prevState.right !== right ||
        prevState.jump !== jump ||
        prevState.action !== action;

      if (changed) {
        const newState = { left, right, jump, action };
        this.playerStates.set(1, newState);
        if (this.onInputChanged) {
          this.onInputChanged(newState, null);
        }
      }
    }
  }

  reset() {
    this.activeKeys.clear();
    this.virtualButtons.clear();
    for (const [slot, id] of this.localPlayers.entries()) {
      const resetState = { left: false, right: false, jump: false, action: false };
      this.playerStates.set(slot, resetState);
      if (this.onInputChanged) {
        this.onInputChanged(resetState, id);
      }
    }
    if (this.localPlayers.size === 0) {
      const resetState = { left: false, right: false, jump: false, action: false };
      this.playerStates.set(1, resetState);
      if (this.onInputChanged) {
        this.onInputChanged(resetState, null);
      }
    }
  }
}

if (typeof window !== "undefined") {
  window.InputHandler = InputHandler;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { InputHandler, DEFAULT_KEY_CONFIGS };
}
