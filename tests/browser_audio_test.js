// test/browser_audio_test.js
// Launches headless Chromium to verify browser-side BGM audio playback,
// unlock on user interaction, volume controls, and restart deduplication.

const { spawn } = require("child_process");
const http = require("http");
const { WebSocket } = require("ws");

async function main() {
  console.log("[Browser Audio Test] Launching Chromium...");
  const chrome = spawn("chromium", [
    "--headless=new",
    "--remote-debugging-port=9222",
    "--no-sandbox",
    "--disable-gpu",
    "--window-size=1280,720",
    "http://localhost:3001/?stage=stage_jump01"
  ]);

  await new Promise((r) => setTimeout(r, 1500));

  try {
    const targets = await new Promise((res, rej) => {
      http
        .get("http://localhost:9222/json", (r) => {
          let d = "";
          r.on("data", (c) => (d += c));
          r.on("end", () => res(JSON.parse(d)));
        })
        .on("error", rej);
    });

    const page = targets.find((t) => t.type === "page" && t.url.includes("3001"));
    if (!page) throw new Error("Could not find page target on port 3001");

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 1;
    const pendingCalls = new Map();

    const send = (method, params = {}) => {
      const callId = id++;
      return new Promise((resolve) => {
        pendingCalls.set(callId, resolve);
        ws.send(JSON.stringify({ id: callId, method, params }));
      });
    };

    ws.on("open", async () => {
      send("Runtime.enable");
      send("Page.enable");
      send("Page.reload");
    });

    ws.on("message", async (raw) => {
      const m = JSON.parse(raw);
      if (m.id && pendingCalls.has(m.id)) {
        const resolve = pendingCalls.get(m.id);
        pendingCalls.delete(m.id);
        resolve(m.result);
      }

      if (m.method === "Page.loadEventFired") {
        console.log("[Browser Audio Test] Page loaded. Simulating user click to unlock AudioContext...");
        await new Promise((r) => setTimeout(r, 600));

        // Create Room (User Interaction)
        await send("Runtime.evaluate", {
          expression: `
            window.AudioManager?.unlock();
            document.getElementById("btn-go-create")?.click();
            setTimeout(() => document.getElementById("btn-create-room-submit")?.click(), 200);
          `
        });

        // Wait for room creation and lobby state
        await new Promise((r) => setTimeout(r, 1200));

        // Evaluate Lobby BGM state
        const evalLobbyAudio = await send("Runtime.evaluate", {
          expression: `
            JSON.stringify({
              isUnlocked: window.AudioManager?.isUnlocked,
              currentBgmName: window.AudioManager?.currentBgmName,
              hasCurrentBgmSource: !!window.AudioManager?.currentBgmSource,
              hasBuffer: window.AudioManager?.buffers.has("title_bgm")
            });
          `
        });
        console.log("[Browser Audio Test] Lobby BGM State:", evalLobbyAudio.result.value);
        const lobbyState = JSON.parse(evalLobbyAudio.result.value);
        if (lobbyState.currentBgmName !== "title_bgm") {
          throw new Error(`Expected lobby BGM to be 'title_bgm', got '${lobbyState.currentBgmName}'`);
        }
        if (!lobbyState.hasCurrentBgmSource) {
          throw new Error("Lobby BGM audio source is not active");
        }

        // Start Game
        console.log("[Browser Audio Test] Starting game...");
        await send("Runtime.evaluate", {
          expression: `document.getElementById("btn-start-game")?.click();`
        });

        // Wait for BGM audio decoding and playback
        await new Promise((r) => setTimeout(r, 2000));

        // Evaluate BGM state in browser
        const evalAudio = await send("Runtime.evaluate", {
          expression: `
            JSON.stringify({
              isUnlocked: window.AudioManager?.isUnlocked,
              currentBgmName: window.AudioManager?.currentBgmName,
              hasCurrentBgmSource: !!window.AudioManager?.currentBgmSource,
              hasBuffer: window.AudioManager?.buffers.has("bgm"),
              musicVolume: window.AudioManager?.musicVolume,
              isMuted: window.AudioManager?.isMuted
            });
          `
        });

        console.log("[Browser Audio Test] Initial BGM State:", evalAudio.result.value);
        const state1 = JSON.parse(evalAudio.result.value);

        if (!state1.isUnlocked) throw new Error("AudioManager was not unlocked");
        if (state1.currentBgmName !== "bgm") throw new Error(`Expected currentBgmName to be 'bgm', got '${state1.currentBgmName}'`);
        if (!state1.hasCurrentBgmSource) throw new Error("BGM audio source is not active");
        if (!state1.hasBuffer) throw new Error("BGM audio buffer was not decoded");

        // Test volume control and mute
        await send("Runtime.evaluate", {
          expression: `
            window.AudioManager.setMusicVolume(0.35);
            window.AudioManager.setMuted(true);
          `
        });

        const evalSettings = await send("Runtime.evaluate", {
          expression: `
            JSON.stringify({
              musicVolume: window.AudioManager?.musicVolume,
              isMuted: window.AudioManager?.isMuted
            });
          `
        });

        console.log("[Browser Audio Test] Settings state:", evalSettings.result.value);
        const state2 = JSON.parse(evalSettings.result.value);
        if (state2.musicVolume !== 0.35) throw new Error("Music volume change failed");
        if (!state2.isMuted) throw new Error("Mute toggle failed");

        // Test level restart deduplication
        console.log("[Browser Audio Test] Testing level restart deduplication (R)...");
        await send("Runtime.evaluate", {
          expression: `
            document.getElementById("btn-ingame-restart")?.click();
          `
        });

        await new Promise((r) => setTimeout(r, 1000));

        const evalRestart = await send("Runtime.evaluate", {
          expression: `
            JSON.stringify({
              currentBgmName: window.AudioManager?.currentBgmName,
              hasCurrentBgmSource: !!window.AudioManager?.currentBgmSource
            });
          `
        });

        console.log("[Browser Audio Test] Post-restart BGM state:", evalRestart.result.value);
        const state3 = JSON.parse(evalRestart.result.value);
        if (state3.currentBgmName !== "bgm") throw new Error("BGM lost after restart");
        if (!state3.hasCurrentBgmSource) throw new Error("BGM source stopped after restart");

        console.log("[Browser Audio Test] ALL BGM BROWSER TESTS PASSED SUCCESSFULLY!");
        ws.close();
        chrome.kill();
        process.exit(0);
      }
    });
  } catch (err) {
    console.error("[Browser Audio Test Error]:", err);
    chrome.kill();
    process.exit(1);
  }
}

main();
