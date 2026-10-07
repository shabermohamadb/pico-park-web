const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocket } = require("ws");

async function main() {
  const chrome = spawn("chromium", [
    "--headless=new",
    "--remote-debugging-port=9222",
    "--no-sandbox",
    "--disable-gpu",
    "--window-size=1280,720",
    "http://localhost:3001/?stage=stage_jump02"
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
    if (!page) {
      console.error("No 3001 page found in targets:", targets);
      chrome.kill();
      process.exit(1);
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 1;
    const send = (method, params = {}) => ws.send(JSON.stringify({ id: id++, method, params }));

    ws.on("open", () => {
      send("Runtime.enable");
      send("Page.enable");
      send("Page.reload");
    });

    ws.on("message", async (raw) => {
      const m = JSON.parse(raw);
      if (m.method === "Page.loadEventFired") {
        console.log("[PAGE LOADED]");
        
        // 1. Create Room
        await new Promise(r => setTimeout(r, 600));
        send("Runtime.evaluate", {
          expression: `
            (function() {
              document.getElementById("btn-go-create")?.click();
              setTimeout(() => {
                document.getElementById("btn-create-room-submit")?.click();
              }, 200);
            })()
          `
        });

        // 2. Start Game from Lobby
        await new Promise(r => setTimeout(r, 1000));
        send("Runtime.evaluate", {
          expression: `
            (function() {
              const startBtn = document.getElementById("btn-start-game");
              if (startBtn) {
                startBtn.click();
                console.log("Clicked START GAME button");
              }
            })()
          `
        });

        // 3. Wait for game to render frames, then capture screenshot
        await new Promise(r => setTimeout(r, 2000));
        send("Page.captureScreenshot", { format: "png" });
      }

      // Handle screenshot result
      if (m.result && m.result.data) {
        const buf = Buffer.from(m.result.data, "base64");
        const outPath = "/home/shaber/.gemini/antigravity/brain/56563386-ffcc-455f-bb03-a3167da9cd4b/screenshot_jump02_fixed.png";
        fs.writeFileSync(outPath, buf);
        console.log("[SCREENSHOT SAVED]", outPath);
        ws.close();
        chrome.kill();
        process.exit(0);
      }
    });

  } catch (err) {
    console.error("Browser test error:", err);
    chrome.kill();
    process.exit(1);
  }
}

main();
