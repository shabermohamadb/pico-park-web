// PICO PARK Web - Mobile Touch Controller & Orientation Management

class TouchController {
  constructor(inputHandler) {
    this.inputHandler = inputHandler;
    this.container = document.getElementById("touch-controls-container");
    this.fullscreenBtn = document.getElementById("btn-toggle-fullscreen");
    this.portraitPrompt = document.getElementById("portrait-rotate-prompt");
    this.dismissPortraitBtn = document.getElementById("btn-dismiss-portrait");

    this.isTouchDevice = this.detectTouchDevice();
    this.portraitDismissed = false;
    this.activePointers = new Map(); // pointerId -> action

    // Mode: 'auto', 'always', 'off'
    this.displayMode = this.loadDisplayMode();

    this.init();
  }

  detectTouchDevice() {
    const hasTouch = (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0 ||
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
    );
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("touch") === "1" || urlParams.get("mobile") === "1") return true;
    if (urlParams.get("touch") === "0") return false;
    return hasTouch;
  }

  loadDisplayMode() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("touch") === "1") return "always";
    if (urlParams.get("touch") === "0") return "off";
    try {
      return localStorage.getItem("pico_touch_mode") || "auto";
    } catch (e) {
      return "auto";
    }
  }

  setDisplayMode(mode) {
    this.displayMode = mode;
    try {
      localStorage.setItem("pico_touch_mode", mode);
    } catch (e) {}
    this.updateVisibility();
  }

  init() {
    this.bindTouchButtons();
    this.bindFullscreen();
    this.bindOrientation();
    this.preventAccidentalGestures();
    this.updateVisibility();
  }

  bindTouchButtons() {
    const buttonConfigs = [
      { id: "touch-btn-left", action: "left" },
      { id: "touch-btn-right", action: "right" },
      { id: "touch-btn-jump", action: "jump" },
      { id: "touch-btn-action", action: "action" }
    ];

    buttonConfigs.forEach(({ id, action }) => {
      const btn = document.getElementById(id);
      if (!btn) return;

      const handlePress = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (btn.setPointerCapture && e.pointerId !== undefined) {
          try {
            btn.setPointerCapture(e.pointerId);
          } catch (err) {}
        }

        btn.classList.add("pressed");
        this.activePointers.set(e.pointerId, action);

        if (this.inputHandler) {
          this.inputHandler.setVirtualButton(action, true, 1);
        }

        // Haptic feedback if supported
        if (navigator.vibrate) {
          try { navigator.vibrate(12); } catch (err) {}
        }
      };

      const handleRelease = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (btn.releasePointerCapture && e.pointerId !== undefined) {
          try {
            btn.releasePointerCapture(e.pointerId);
          } catch (err) {}
        }

        btn.classList.remove("pressed");
        this.activePointers.delete(e.pointerId);

        if (this.inputHandler) {
          // Check if any other pointer is still holding this action
          let stillActive = false;
          for (const act of this.activePointers.values()) {
            if (act === action) {
              stillActive = true;
              break;
            }
          }
          if (!stillActive) {
            this.inputHandler.setVirtualButton(action, false, 1);
          }
        }
      };

      btn.addEventListener("pointerdown", handlePress);
      btn.addEventListener("pointerup", handleRelease);
      btn.addEventListener("pointercancel", handleRelease);
      btn.addEventListener("lostpointercapture", handleRelease);

      // Prevent default context menu
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
    });

    // Touch Retry button in HUD
    const touchRetryBtn = document.getElementById("touch-btn-retry");
    if (touchRetryBtn) {
      touchRetryBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const mainRetryBtn = document.getElementById("btn-ingame-restart");
        if (mainRetryBtn) mainRetryBtn.click();
      });
    }

    // Touch Guide button in HUD
    const touchGuideBtn = document.getElementById("touch-btn-guide");
    if (touchGuideBtn) {
      touchGuideBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const mainGuideBtn = document.getElementById("btn-ingame-instructions");
        if (mainGuideBtn) mainGuideBtn.click();
      });
    }
  }

  bindFullscreen() {
    if (!this.fullscreenBtn) return;

    const toggleFs = () => {
      const doc = document;
      const docEl = document.documentElement;

      const isFs = !!(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
      );

      if (!isFs) {
        const req = (
          docEl.requestFullscreen ||
          docEl.webkitRequestFullscreen ||
          docEl.mozRequestFullScreen ||
          docEl.msRequestFullscreen
        );
        if (req) {
          req.call(docEl).catch((err) => {
            console.warn("[Fullscreen] Failed to enter fullscreen:", err);
          });
        }
      } else {
        const exit = (
          doc.exitFullscreen ||
          doc.webkitExitFullscreen ||
          doc.mozCancelFullScreen ||
          doc.msExitFullscreen
        );
        if (exit) {
          exit.call(doc).catch((err) => {
            console.warn("[Fullscreen] Failed to exit fullscreen:", err);
          });
        }
      }
    };

    this.fullscreenBtn.addEventListener("click", toggleFs);

    const updateFsIcon = () => {
      const isFs = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      this.fullscreenBtn.textContent = isFs ? "✕ EXIT" : "⛶ FULLSCREEN";
      this.fullscreenBtn.setAttribute("aria-label", isFs ? "Exit Fullscreen" : "Enter Fullscreen");
      if (isFs) {
        document.body.classList.add("is-fullscreen");
      } else {
        document.body.classList.remove("is-fullscreen");
      }
    };

    document.addEventListener("fullscreenchange", updateFsIcon);
    document.addEventListener("webkitfullscreenchange", updateFsIcon);
    document.addEventListener("mozfullscreenchange", updateFsIcon);
  }

  bindOrientation() {
    const checkOrientation = () => {
      const isPortrait = window.innerHeight > window.innerWidth && window.innerWidth < 1024;
      if (this.portraitPrompt) {
        if (isPortrait && !this.portraitDismissed) {
          this.portraitPrompt.classList.remove("hidden");
        } else {
          this.portraitPrompt.classList.add("hidden");
        }
      }
    };

    if (this.dismissPortraitBtn) {
      this.dismissPortraitBtn.addEventListener("click", () => {
        this.portraitDismissed = true;
        if (this.portraitPrompt) {
          this.portraitPrompt.classList.add("hidden");
        }
      });
    }

    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", () => {
      this.portraitDismissed = false; // reset dismissal on actual device rotation
      setTimeout(checkOrientation, 200);
    });

    checkOrientation();
  }

  preventAccidentalGestures() {
    // Prevent iOS Safari gesture zooming
    document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
    document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
    document.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });

    // Prevent double tap zoom on canvas and touch controls
    if (this.container) {
      this.container.addEventListener("dblclick", (e) => e.preventDefault());
    }
    const canvas = document.getElementById("game-canvas");
    if (canvas) {
      canvas.addEventListener("dblclick", (e) => e.preventDefault());
    }
  }

  updateVisibility() {
    if (!this.container) return;

    let shouldShow = false;
    if (this.displayMode === "always") {
      shouldShow = true;
    } else if (this.displayMode === "off") {
      shouldShow = false;
    } else {
      // Auto: show on touch devices or small screens
      shouldShow = this.isTouchDevice || (window.innerWidth <= 1024 && window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    }

    if (shouldShow) {
      this.container.classList.remove("touch-hidden");
      document.body.classList.add("touch-controls-active");
    } else {
      this.container.classList.add("touch-hidden");
      document.body.classList.remove("touch-controls-active");
    }
  }
}

if (typeof window !== "undefined") {
  window.TouchController = TouchController;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { TouchController };
}
