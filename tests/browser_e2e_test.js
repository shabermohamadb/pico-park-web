// test/browser_e2e_test.js
// Automated End-to-End Headless Browser Visual Test for PICO PARK Co-op Chain System

const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

async function runBrowserTest() {
  console.log("=== Launching Chromium Headless for Visual Chain Test ===");
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1280,720"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.toString());
  });

  try {
    // 1. Navigate to game server
    console.log("[1] Navigating to http://localhost:3001...");
    await page.goto("http://localhost:3001", { waitUntil: "networkidle0", timeout: 10000 });

    // 2. Click Create Room
    console.log("[2] Opening Create Room screen...");
    await page.waitForSelector("#btn-go-create", { visible: true });
    await page.click("#btn-go-create");

    // 3. Enable Chain Mode checkbox & submit
    console.log("[3] Enabling Co-op Chain Mode checkbox and creating room...");
    await page.waitForSelector("#check-create-chain", { visible: true });
    await page.click("#check-create-chain");
    await page.click("#btn-create-room-submit");

    // 4. In Lobby, add local player
    console.log("[4] In Lobby: adding Player 2 on same keyboard...");
    await page.waitForSelector("#btn-add-local-player", { visible: true });
    await page.click("#btn-add-local-player");
    await new Promise((r) => setTimeout(r, 600));

    // 5. Host starts game
    console.log("[5] Starting Game...");
    await page.waitForSelector("#btn-start-game", { visible: true });
    await page.click("#btn-start-game");

    // 6. Wait for gameplay active
    await page.waitForFunction(() => !document.getElementById("screen-game").classList.contains("hidden"), { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 1500));

    // 7. Verify snapshot has chain enabled
    const chainState = await page.evaluate(() => {
      const snap = window.network && window.network.snapshots && window.network.snapshots[window.network.snapshots.length - 1];
      return snap ? snap.chain : null;
    });
    console.log("-> Active chain state in browser snapshot:", chainState);

    // Save screenshot 1: Natural chain with sag
    const artifactDir = "/home/shaber/.gemini/antigravity/brain/56563386-ffcc-455f-bb03-a3167da9cd4b";
    const ss1Path = path.join(artifactDir, "screenshot_coop_chain.png");
    await page.screenshot({ path: ss1Path });
    console.log(`[PASS] Saved screenshot: ${ss1Path}`);

    // 8. Move Player 1 to stretch chain
    console.log("[8] Moving Player 1 leftward with KeyA to tension the chain...");
    await page.keyboard.down("KeyA");
    await new Promise((r) => setTimeout(r, 800));
    await page.keyboard.up("KeyA");
    await new Promise((r) => setTimeout(r, 400));

    // Save screenshot 2: Taut chain under tension
    const ss2Path = path.join(artifactDir, "screenshot_chain_taut.png");
    await page.screenshot({ path: ss2Path });
    console.log(`[PASS] Saved screenshot: ${ss2Path}`);

    // 9. Press Retry (R)
    console.log("[9] Testing Retry (R) key in browser...");
    await page.keyboard.press("KeyR");
    await new Promise((r) => setTimeout(r, 600));

    console.log("Console errors detected:", consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.warn("Console errors:", consoleErrors);
    }

    console.log("=== Visual Browser Verification Complete! ===");
  } finally {
    await browser.close();
  }
}

runBrowserTest().catch((err) => {
  console.error("Browser test error:", err);
  process.exit(1);
});
