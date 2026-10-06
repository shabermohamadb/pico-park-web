const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
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
        // Create Room
        await new Promise(r => setTimeout(r, 600));
        send("Runtime.evaluate", {
          expression: `
            document.getElementById("btn-go-create")?.click();
            setTimeout(() => document.getElementById("btn-create-room-submit")?.click(), 200);
          `
        });

        // Start Game
        await new Promise(r => setTimeout(r, 1000));
        send("Runtime.evaluate", {
          expression: `document.getElementById("btn-start-game")?.click();`
        });

        // Move player right and jump onto stairs
        await new Promise(r => setTimeout(r, 1000));
        send("Runtime.evaluate", {
          expression: `
            window.inputHandler.keysDown.add("ArrowRight");
            window.inputHandler.sendInputs();
            setTimeout(() => {
              window.inputHandler.keysDown.add("Space");
              window.inputHandler.sendInputs();
            }, 600);
          `
        });

        await new Promise(r => setTimeout(r, 1500));
        send("Page.captureScreenshot", { format: "png" });
      }

      if (m.result && m.result.data) {
        const buf = Buffer.from(m.result.data, "base64");
        const outPath = "/home/shaber/.gemini/antigravity/brain/56563386-ffcc-455f-bb03-a3167da9cd4b/screenshot_jump02_climbing.png";
        fs.writeFileSync(outPath, buf);
        console.log("[SCREENSHOT SAVED]", outPath);
        ws.close();
        chrome.kill();
        process.exit(0);
      }
    });

  } catch (err) {
    console.error(err);
    chrome.kill();
    process.exit(1);
  }
}

main();
