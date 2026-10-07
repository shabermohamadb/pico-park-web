const puppeteer = require("puppeteer-core");
const path = require("path");

async function verifyTimeTrampolineVisuals() {
  console.log("=== Launching Chromium Headless for Stage TIME TRAMPOLINE Visual Verification ===");
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1280,720"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.toString()));

  const artifactDir = "/home/shaber/.gemini/antigravity/brain/56563386-ffcc-455f-bb03-a3167da9cd4b";

  try {
    console.log("[1] Navigating to http://localhost:3001/?stage=stage_time_trampoline...");
    await page.goto("http://localhost:3001/?stage=stage_time_trampoline", { waitUntil: "domcontentloaded", timeout: 15000 });

    console.log("[2] Opening Create Room...");
    await page.waitForSelector("#btn-go-create", { visible: true, timeout: 5000 });
    await page.click("#btn-go-create");

    console.log("[3] Submitting Create Room...");
    await page.waitForSelector("#btn-create-room-submit", { visible: true, timeout: 5000 });
    await page.click("#btn-create-room-submit");

    console.log("[4] Starting Game in Lobby...");
    await page.waitForSelector("#btn-start-game", { visible: true, timeout: 5000 });
    await page.click("#btn-start-game");

    console.log("[5] Waiting for Game Screen...");
    await page.waitForFunction(() => !document.getElementById("screen-game").classList.contains("hidden"), { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 2000));

    // Capture screenshot 1: Full Level Gameplay (Green border, Trampolines, 5 Cyan platforms, 2 Green bridges, Key, Door, Timer)
    const ss1Path = path.join(artifactDir, "screenshot_time_trampoline_gameplay.png");
    await page.screenshot({ path: ss1Path });
    console.log("[PASS] Saved gameplay screenshot: " + ss1Path);

    // Bounce on trampoline by moving left toward left JumpStand (x: 168)
    console.log("[6] Moving player left toward trampoline...");
    await page.keyboard.down("ArrowLeft");
    await new Promise((r) => setTimeout(r, 1200));
    await page.keyboard.up("ArrowLeft");
    await new Promise((r) => setTimeout(r, 300));

    // Capture screenshot 2: Trampoline Bounce & Aerial Flight
    const ss2Path = path.join(artifactDir, "screenshot_time_trampoline_bounce.png");
    await page.screenshot({ path: ss2Path });
    console.log("[PASS] Saved trampoline bounce screenshot: " + ss2Path);

    // Press H to open the in-game Guide modal
    console.log("[7] Pressing H to open instructions guide modal...");
    await page.keyboard.press("KeyH");
    await new Promise((r) => setTimeout(r, 800));

    const isModalOpen = await page.evaluate(() => {
      const modal = document.getElementById("modal-instructions");
      return modal && !modal.classList.contains("hidden");
    });
    console.log("Guide modal open state:", isModalOpen);

    // Capture screenshot 3: Instructions guide modal
    const ss3Path = path.join(artifactDir, "screenshot_time_trampoline_guide_modal.png");
    await page.screenshot({ path: ss3Path });
    console.log("[PASS] Saved guide modal screenshot: " + ss3Path);

    console.log("Console errors detected:", consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.warn("Errors:", consoleErrors);
    }
    console.log("=== Visual Verification Completed Successfully ===");
  } finally {
    await browser.close();
  }
}

verifyTimeTrampolineVisuals().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
