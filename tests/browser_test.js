const { spawn } = require("child_process");
const http = require("http");
const { WebSocket } = require("ws");

async function main() {
  const chrome = spawn("chromium", [
    "--headless=new",
    "--remote-debugging-port=9222",
    "--no-sandbox",
    "--disable-gpu",
    "http://localhost:3001"
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
      return;
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 1;
    const send = (method, params = {}) => ws.send(JSON.stringify({ id: id++, method, params }));

    ws.on("open", () => {
      send("Runtime.enable");
      send("Console.enable");
      send("Page.enable");
      send("Page.reload");
    });

    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.method === "Runtime.consoleAPICalled") {
        console.log("[CONSOLE]", m.params.type, m.params.args.map(a => a.value || a.description));
      }
      if (m.method === "Runtime.exceptionThrown") {
        console.error("[EXCEPTION]", m.params.exceptionDetails);
      }
      if (m.method === "Page.loadEventFired") {
        console.log("[PAGE LOADED]");
        setTimeout(() => {
          send("Runtime.evaluate", {
            expression: `
              (function() {
                const btn = document.getElementById("btn-go-create");
                console.log("btn-go-create present:", !!btn);
                if (btn) btn.click();
                console.log("After clicking btn-go-create:");
                console.log("  home classes:", document.getElementById("screen-home").className);
                console.log("  create classes:", document.getElementById("screen-create").className);
                
                const submitBtn = document.getElementById("btn-create-room-submit");
                console.log("btn-create-room-submit present:", !!submitBtn);
                if (submitBtn) {
                  submitBtn.click();
                  console.log("Clicked btn-create-room-submit");
                }
              })()
            `
          });
        }, 500);

        setTimeout(() => {
          send("Runtime.evaluate", {
            expression: `
              (function() {
                console.log("Lobby classes:", document.getElementById("screen-lobby").className);
                console.log("Room code in lobby:", document.getElementById("lobby-room-code")?.textContent);
                console.log("Player list in lobby:", document.getElementById("lobby-player-list")?.innerHTML);
              })()
            `
          });
        }, 1500);

        setTimeout(() => {
          ws.close();
          chrome.kill();
          process.exit(0);
        }, 2500);
      }
    });

  } catch (err) {
    console.error("Test error:", err);
    chrome.kill();
    process.exit(1);
  }
}

main();
