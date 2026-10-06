// PICO PARK Web Game Client Entry Point

document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game-canvas");
  const renderer = new GameRenderer(canvas);

  let currentStage = null;
  let localPlayerId = null;
  let isGameActive = false;
  let isLevelClearing = false;
  let lastLobbyPlayerCount = 0;
  let lastFrameTime = performance.now();

  // Initialize Client-side Prediction Engine (0ms local movement latency)
  const predictor = new ClientPredictor();
  window.predictor = predictor;

  // Initialize Network Client
  const network = new NetworkClient({
    onConnected: () => {
      console.log("[Network] Connected to PICO PARK server");
    },
    onRoomJoined: (room, playerId) => {
      localPlayerId = playerId;
      lastLobbyPlayerCount = room.players ? room.players.length : 1;
      if (window.inputHandler) {
        window.inputHandler.clearLocalPlayers();
        const me = room.players.find((p) => p.id === playerId);
        window.inputHandler.registerLocalPlayer(me ? me.slot : 1, playerId);
      }
      predictor.reset();
      UIManager.showScreen("lobby");
      UIManager.updateLobby(room, localPlayerId);
      AudioManager.playBGM("title_bgm");
    },

    onLocalPlayerAdded: (subPlayerId, slot) => {
      if (window.inputHandler) {
        window.inputHandler.registerLocalPlayer(slot, subPlayerId);
      }
      AudioManager.playSFX("join");
      UIManager.showToast(`Player ${slot} joined on this keyboard!`, "success");
    },

    onRoomState: (room) => {
      const currentCount = room.players ? room.players.length : 0;
      if (lastLobbyPlayerCount > 0 && currentCount > lastLobbyPlayerCount) {
        AudioManager.playSFX("join");
      } else if (lastLobbyPlayerCount > 0 && currentCount < lastLobbyPlayerCount) {
        AudioManager.playSFX("leave");
      }
      lastLobbyPlayerCount = currentCount;
      UIManager.updateLobby(room, localPlayerId);
    },

    onGameStarted: (stage, players) => {
      currentStage = stage;
      isGameActive = true;
      isLevelClearing = false;
      predictor.reset();
      if (window.inputHandler && stage.actors && stage.actors.spawns) {
        for (const [slot, id] of window.inputHandler.localPlayers.entries()) {
          const spawn = stage.actors.spawns[slot - 1] || stage.actors.spawns[0] || { x: 100, y: 400 };
          predictor.registerPlayer(id, slot, spawn.x, spawn.y);
        }
      }
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
      predictor.reset();
      if (window.inputHandler && stage.actors && stage.actors.spawns) {
        for (const [slot, id] of window.inputHandler.localPlayers.entries()) {
          const spawn = stage.actors.spawns[slot - 1] || stage.actors.spawns[0] || { x: 100, y: 400 };
          predictor.registerPlayer(id, slot, spawn.x, spawn.y);
        }
      }
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
      predictor.reset();
      if (window.inputHandler) {
        window.inputHandler.clearLocalPlayers();
      }
      UIManager.showToast("Disconnected from game server", "error");
      UIManager.showScreen("home");
      AudioManager.stopBGM();
    }
  });

  // Connect WebSocket
  network.connect();
  window.network = network;

  // Initialize Supabase Google & Guest Auth
  if (window.SupabaseAuth) {
    window.SupabaseAuth.onAuthChange((payload) => {
      window.uiManager?.updateAuthUI(payload);
    });
    window.SupabaseAuth.init().then(() => {
      window.uiManager?.updateAuthUI({
        isGuest: window.SupabaseAuth.isGuest,
        displayName: window.SupabaseAuth.getDisplayName(),
        avatarUrl: window.SupabaseAuth.getAvatarUrl()
      });
    });
  }

  // Initialize Input Handler
  const input = new InputHandler(
    (inputs, targetPlayerId) => {
      if (isGameActive) {
        network.sendInput(inputs, targetPlayerId);
      }
    },
    (emoteText) => {
      if (isGameActive) {
        network.sendEmote(emoteText);
      }
    }
  );
  window.inputHandler = input;

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
      const urlStage = new URLSearchParams(window.location.search).get("stage");
      network.createRoom(name, { maxPlayers: 8, stage: urlStage || undefined });
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

  const btnAddLocalPlayer = document.getElementById("btn-add-local-player");
  if (btnAddLocalPlayer) {
    btnAddLocalPlayer.addEventListener("click", () => {
      AudioManager.playSFX("select");
      network.addLocalPlayer();
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
      AudioManager.playSFX("retry");
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

  // F3 shortcut for Performance Monitor HUD toggle
  window.addEventListener("keydown", (e) => {
    if (e.key === "F3" || e.code === "F3") {
      e.preventDefault();
      renderer.showDebugOverlay = !renderer.showDebugOverlay;
    }
  });

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
  let frameCount = 0;
  let lastFpsCalc = performance.now();
  let currentFps = 60;

  function gameLoop(now) {
    const dt = Math.min((now - lastFrameTime) / 1000.0, 0.1);
    lastFrameTime = now;

    frameCount++;
    if (now - lastFpsCalc >= 1000) {
      currentFps = Math.round((frameCount * 1000) / (now - lastFpsCalc));
      frameCount = 0;
      lastFpsCalc = now;
    }

    if (isGameActive && currentStage) {
      const snapshot = network.getInterpolatedState();

      if (snapshot) {
        // Reconcile predictor with authoritative snapshot
        if (snapshot.players && snapshot.players.length > 0) {
          if (window.inputHandler) {
            for (const [slot, id] of window.inputHandler.localPlayers.entries()) {
              if (!predictor.localPlayers.has(id)) {
                const authP = snapshot.players.find((p) => p.id === id);
                if (authP) {
                  predictor.registerPlayer(id, slot, authP.x, authP.y);
                }
              }
            }
          }
          predictor.reconcile(snapshot.players);
        }

        // Run local prediction simulation step
        const inputStates = window.inputHandler ? window.inputHandler.getInputStatesMap() : new Map();
        predictor.update(currentStage, snapshot.boxes, inputStates, dt);

        // Replace local player(s) in snapshot with client predicted positions
        const renderPlayers = (snapshot.players || []).map((p) => {
          if (predictor.localPlayers.has(p.id)) {
            const pred = predictor.getRenderPlayer(p.id);
            if (pred) {
              return {
                ...p,
                x: pred.x,
                y: pred.y,
                vx: pred.vx,
                vy: pred.vy,
                facing: pred.facing,
                anim: pred.animState
              };
            }
          }
          return p;
        });

        const renderSnapshot = {
          ...snapshot,
          players: renderPlayers
        };

        const perfMetrics = {
          fps: currentFps,
          ping: network.ping,
          serverTickDuration: network.serverTickDuration,
          updatesPerSecond: network.updatesPerSecond,
          predictionActive: predictor.localPlayers.size > 0
        };

        renderer.render(currentStage, renderSnapshot, localPlayerId, dt, perfMetrics);
      }
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
});
