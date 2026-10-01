// PICO PARK Web Game Client Entry Point

document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game-canvas");
  const renderer = new GameRenderer(canvas);

  let currentStage = null;
  let localPlayerId = null;
  let isGameActive = false;
  let isLevelClearing = false;
  let lastFrameTime = performance.now();

  // Initialize Network Client
  const network = new NetworkClient({
    onConnected: () => {
      console.log("[Network] Connected to PICO PARK server");
    },
    onRoomJoined: (room, playerId) => {
      localPlayerId = playerId;
      UIManager.showScreen("lobby");
      UIManager.updateLobby(room, localPlayerId);
      AudioManager.playBGM("title_bgm");
    },

    onRoomState: (room) => {
      UIManager.updateLobby(room, localPlayerId);
    },

    onGameStarted: (stage, players) => {
      currentStage = stage;
      isGameActive = true;
      isLevelClearing = false;
      UIManager.showScreen("game");
      UIManager.hideLevelClear();
      renderer.particles = [];
      AudioManager.playBGM("bgm");
    },

    onLevelClear: (stageName) => {
      if (isLevelClearing) return; // Prevent duplicate win calls
      isLevelClearing = true;
      UIManager.showLevelClear(stageName);
      renderer.spawnConfetti(canvas.width / 2, canvas.height / 2 - 50);
      AudioManager.playSFX("win");
    },

    onNextLevel: (stage) => {
      currentStage = stage;
      isLevelClearing = false;
      UIManager.hideLevelClear();
      renderer.particles = [];
      AudioManager.playBGM("bgm");
    },

    onEmote: (playerId, emoteText) => {
      renderer.addEmote(playerId, emoteText);
      AudioManager.playSFX("blip");
    },

    onError: (errMsg) => {
      UIManager.showToast(errMsg, "error");
    },

    onDisconnect: () => {
      isGameActive = false;
      UIManager.showToast("Disconnected from game server", "error");
      UIManager.showScreen("home");
      AudioManager.stopBGM();
    }
  });

  // Connect WebSocket
  network.connect();
  window.network = network;

  // Initialize Input Handler
  const input = new InputHandler(
    (inputs) => {
      if (isGameActive) {
        network.sendInput(inputs);
      }
    },
    (emoteText) => {
      if (isGameActive) {
        network.sendEmote(emoteText);
      }
    }
  );

  // Audio Unlock on first user interaction
  window.addEventListener("pointerdown", () => {
    AudioManager.unlock();
  }, { once: true });

  // UI Event Bindings
  const btnGoCreate = document.getElementById("btn-go-create");
  if (btnGoCreate) {
    btnGoCreate.addEventListener("click", () => {
      AudioManager.unlock();
      AudioManager.playSFX("select");
      UIManager.showScreen("create");
    });
  }

  const btnGoJoin = document.getElementById("btn-go-join");
  if (btnGoJoin) {
    btnGoJoin.addEventListener("click", () => {
      AudioManager.unlock();
      AudioManager.playSFX("select");
      UIManager.showScreen("join");
    });
  }

  const btnOpenSettings = document.getElementById("btn-open-settings");
  if (btnOpenSettings) {
    btnOpenSettings.addEventListener("click", () => {
      AudioManager.playSFX("select");
      UIManager.openSettings();
    });
  }

  const btnInGameSettings = document.getElementById("btn-ingame-settings");
  if (btnInGameSettings) {
    btnInGameSettings.addEventListener("click", () => {
      AudioManager.playSFX("select");
      UIManager.openSettings();
    });
  }

  const btnCreateBack = document.getElementById("btn-create-back");
  if (btnCreateBack) {
    btnCreateBack.addEventListener("click", () => {
      AudioManager.playSFX("select");
      UIManager.showScreen("home");
    });
  }

  const btnJoinBack = document.getElementById("btn-join-back");
  if (btnJoinBack) {
    btnJoinBack.addEventListener("click", () => {
      AudioManager.playSFX("select");
      UIManager.showScreen("home");
    });
  }

  const btnCreateRoomSubmit = document.getElementById("btn-create-room-submit");
  if (btnCreateRoomSubmit) {
    btnCreateRoomSubmit.addEventListener("click", () => {
      const nameInput = document.getElementById("input-create-name");
      const name = (nameInput?.value || "").trim();
      if (!name) {
        UIManager.showToast("Please enter a player name", "warning");
        return;
      }
      AudioManager.playSFX("select");
      network.createRoom(name, { maxPlayers: 8 });
    });
  }

  const inputCreateName = document.getElementById("input-create-name");
  if (inputCreateName) {
    inputCreateName.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        btnCreateRoomSubmit?.click();
      }
    });
  }

  const btnJoinRoomSubmit = document.getElementById("btn-join-room-submit");
  if (btnJoinRoomSubmit) {
    btnJoinRoomSubmit.addEventListener("click", () => {
      const codeInput = document.getElementById("input-join-code");
      const nameInput = document.getElementById("input-join-name");
      const code = (codeInput?.value || "").trim();
      const name = (nameInput?.value || "").trim() || "Player";

      if (!code) {
        UIManager.showToast("Please enter a room code", "warning");
        return;
      }

      AudioManager.playSFX("select");
      network.joinRoom(code, name);
    });
  }

  const inputJoinCode = document.getElementById("input-join-code");
  const inputJoinName = document.getElementById("input-join-name");
  [inputJoinCode, inputJoinName].forEach((inp) => {
    if (inp) {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          btnJoinRoomSubmit?.click();
        }
      });
    }
  });

  const btnToggleReady = document.getElementById("btn-toggle-ready");
  if (btnToggleReady) {
    btnToggleReady.addEventListener("click", () => {
      if (!UIManager.currentRoom) return;
      const me = UIManager.currentRoom.players.find((p) => p.id === localPlayerId);
      const nextReady = me ? !me.isReady : true;
      AudioManager.playSFX("select");
      network.setReady(nextReady);
    });
  }

  const btnStartGame = document.getElementById("btn-start-game");
  if (btnStartGame) {
    btnStartGame.addEventListener("click", () => {
      AudioManager.playSFX("start");
      network.startGame();
    });
  }

  const btnLeaveRoom = document.getElementById("btn-leave-room");
  if (btnLeaveRoom) {
    btnLeaveRoom.addEventListener("click", () => {
      AudioManager.playSFX("select");
      network.send(CONSTANTS.MSG.LEAVE_ROOM);
      UIManager.showScreen("home");
      AudioManager.playBGM("title_bgm");
    });
  }

  const btnInGameRestart = document.getElementById("btn-ingame-restart");
  if (btnInGameRestart) {
    btnInGameRestart.addEventListener("click", () => {
      AudioManager.playSFX("select");
      network.restartLevel();
    });

    // Keyboard shortcut (R)
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key.toLowerCase() === "r" && isGameActive && !e.repeat) {
        btnInGameRestart.click();
      }
    });
  }

  // Quick Emote bar clicks
  document.querySelectorAll(".emote-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const emote = e.currentTarget.getAttribute("data-emote");
      if (emote && isGameActive) {
        network.sendEmote(emote);
      }
    });
  });

  // Render & Game Loop
  function gameLoop(now) {
    const dt = Math.min((now - lastFrameTime) / 1000.0, 0.1);
    lastFrameTime = now;

    if (isGameActive && currentStage) {
      const snapshot = network.getInterpolatedState();
      renderer.render(currentStage, snapshot, localPlayerId, dt);
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
});
