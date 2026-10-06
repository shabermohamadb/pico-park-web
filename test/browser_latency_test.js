// test/browser_latency_test.js
// Launches headless Chromium to verify client prediction, ping tracking, and Performance HUD (F3)

const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocket } = require("ws");

async function main() {
  console.log("[Browser Test] Launching Chromium...");
  const chrome = spawn("chromium", [
    "--headless=new",
    "--remote-debugging-port=9222",
    "--no-sandbox",
    "--disable-gpu",
    "--window-size=1280,720",
    "http://localhost:3001/?stage=stage_jump01"
  ]);

  await new Promise(r => setTimeout(r, 1500));

  try {
    const targets = await new Promise((res, rej) => {
      http.get("http://localhost:9222/json", (r) => {
        let d = "";
        r.on("data", c => d += c);
        r.on("end", () => res(JSON.parse(d)));
      }).on("error", rej);
    });

    const page = targets.find(t => t.type === "page" && t.url.includes("3001"));
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
        console.log("[Browser Test] Page loaded. Creating room...");
        await new Promise(r => setTimeout(r, 600));

        // Create Room
        await send("Runtime.evaluate", {
          expression: `
            document.getElementById("btn-go-create")?.click();
            setTimeout(() => document.getElementById("btn-create-room-submit")?.click(), 200);
          `
        });

        // Start Game
        await new Promise(r => setTimeout(r, 1000));
        console.log("[Browser Test] Starting game...");
        await send("Runtime.evaluate", {
          expression: `document.getElementById("btn-start-game")?.click();`
        });

        // Wait for game loop to receive snapshots
        await new Promise(r => setTimeout(r, 1500));

        // Evaluate prediction and telemetry in the browser context
        const evalRes = await send("Runtime.evaluate", {
          expression: `
            JSON.stringify({
              hasPredictor: !!window.predictor,
              localPlayersCount: window.predictor ? window.predictor.localPlayers.size : 0,
              ping: window.network ? window.network.ping : -1,
              serverTick: window.network ? window.network.serverTickDuration : -1,
              updatesPerSec: window.network ? window.network.updatesPerSecond : -1,
              hasRenderer: !!window.network
            });
          `
        });

        console.log("[Browser Test] Browser State:", evalRes.result ? evalRes.result.value : "null");

        // Toggle F3 Performance HUD
        await send("Runtime.evaluate", {
          expression: `
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', code: 'F3' }));
          `
        });

        // Let the HUD render for 2 frames
        await new Promise(r => setTimeout(r, 400));

        // Capture screenshot
        console.log("[Browser Test] Capturing screenshot of game with F3 Performance HUD...");
        const shot = await send("Page.captureScreenshot", { format: "png" });

        const outPath = "/home/shaber/.gemini/antigravity/brain/56563386-ffcc-455f-bb03-a3167da9cd4b/screenshot_performance_hud.png";
        fs.writeFileSync(outPath, Buffer.from(shot.data, "base64"));
        console.log(`[Browser Test] Screenshot saved to ${outPath}`);

        ws.close();
        chrome.kill();
        process.exit(0);
      }
    });

  } catch (err) {
    console.error("[Browser Test Error]:", err);
    chrome.kill();
    process.exit(1);
  }
}

main();
