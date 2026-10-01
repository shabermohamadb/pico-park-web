// PICO PARK Browser Input Handler

class InputHandler {
  constructor(onInputChanged, onEmote) {
    this.onInputChanged = onInputChanged;
    this.onEmote = onEmote;

    this.state = {
      left: false,
      right: false,
      jump: false,
      action: false
    };

    this.activeKeys = new Set();
    this.enabled = true;

    this.bindEvents();
  }

  bindEvents() {
    window.addEventListener("keydown", (e) => {
      // Don't capture inputs if user is typing in an input field
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      const key = e.key.toLowerCase();
      this.activeKeys.add(key);

      // Prevent page scrolling on Space and Arrow keys
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "space"].includes(key)) {
        e.preventDefault();
      }

      // Check quick emotes (keys 1 to 6)
      if (["1", "2", "3", "4", "5", "6"].includes(key)) {
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
      const key = e.key.toLowerCase();
      this.activeKeys.delete(key);
      this.updateState();
    });

    // Window blur: reset all inputs so keys don't get stuck
    window.addEventListener("blur", () => {
      this.activeKeys.clear();
      this.updateState();
    });
  }

  updateState() {
    if (!this.enabled) return;

    const left = this.activeKeys.has("arrowleft") || this.activeKeys.has("a");
    const right = this.activeKeys.has("arrowright") || this.activeKeys.has("d");
    const jump = this.activeKeys.has("arrowup") || this.activeKeys.has("w") || this.activeKeys.has(" ") || this.activeKeys.has("space");
    const action = this.activeKeys.has("e") || this.activeKeys.has("enter");

    const changed =
      this.state.left !== left ||
      this.state.right !== right ||
      this.state.jump !== jump ||
      this.state.action !== action;

    if (changed) {
      this.state = { left, right, jump, action };
      if (this.onInputChanged) {
        this.onInputChanged(this.state);
      }
    }
  }

  reset() {
    this.activeKeys.clear();
    this.state = { left: false, right: false, jump: false, action: false };
    if (this.onInputChanged) {
      this.onInputChanged(this.state);
    }
  }
}

window.InputHandler = InputHandler;
