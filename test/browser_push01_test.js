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
    "http://localhost:3001/?stage=stage_push01"
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
    let msgId = 1;
    const pendingCalls = new Map();

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id && pendingCalls.has(msg.id)) {
        const { resolve, reject } = pendingCalls.get(msg.id);
        pendingCalls.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    });

    const call = (method, params = {}) => {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        pendingCalls.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    await new Promise(r => ws.on("open", r));
    await call("Runtime.enable");
    await call("Page.enable");
    await call("Page.reload");

    // Wait for page to fully load and connect
    await new Promise(r => setTimeout(r, 2000));

    // 1. Click Create Room
    await call("Runtime.evaluate", {
      expression: `
        (function() {
          document.getElementById("btn-go-create")?.click();
          setTimeout(() => {
            document.getElementById("btn-create-room-submit")?.click();
          }, 300);
        })()
      `
    });

    await new Promise(r => setTimeout(r, 1000));

    // 2. Click Start Game
    await call("Runtime.evaluate", {
      expression: `document.getElementById("btn-start-game")?.click()`
    });

    // 3. Wait for game world to settle
    await new Promise(r => setTimeout(r, 1500));

    const outDir = "/home/shaber/.gemini/antigravity/brain/56563386-ffcc-455f-bb03-a3167da9cd4b";

    // 4. Capture Initial Screenshot
    const snap1 = await call("Page.captureScreenshot", { format: "png" });
    const snap1Path = path.join(outDir, "screenshot_push01_fixed.png");
    fs.writeFileSync(snap1Path, Buffer.from(snap1.data, "base64"));
    console.log(`[SUCCESS] Initial screenshot saved to ${snap1Path}`);

    // 5. Send inputs to move right and push box 1
    await call("Runtime.evaluate", {
      expression: `
        (function() {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd' }));
          setTimeout(() => {
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', key: 'd' }));
          }, 2500);
        })()
      `
    });

    // Wait for pushing motion
    await new Promise(r => setTimeout(r, 3000));

    // 6. Capture Pushed Screenshot
    const snap2 = await call("Page.captureScreenshot", { format: "png" });
    const snap2Path = path.join(outDir, "screenshot_push01_pushed.png");
    fs.writeFileSync(snap2Path, Buffer.from(snap2.data, "base64"));
    console.log(`[SUCCESS] Pushed screenshot saved to ${snap2Path}`);

    ws.close();
    chrome.kill();
    process.exit(0);

  } catch (err) {
    console.error("Browser test failed:", err);
    chrome.kill();
    process.exit(1);
  }
}

main();
