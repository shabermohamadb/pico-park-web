const puppeteer = require("puppeteer-core");
const path = require("path");

async function verifyJump02Visuals() {
  console.log("=== Launching Chromium Headless for Stage JUMP02 Visual Verification ===");
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
    console.log("[1] Navigating to http://localhost:3001/?stage=stage_jump02...");
    await page.goto("http://localhost:3001/?stage=stage_jump02", { waitUntil: "domcontentloaded", timeout: 15000 });

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
    await new Promise((r) => setTimeout(r, 1500));

    // Capture screenshot 1: Gameplay with fixed staircase and top mission banner
    const ss1Path = path.join(artifactDir, "screenshot_jump02_fixed_stairs.png");
    await page.screenshot({ path: ss1Path });
    console.log(`[PASS] Saved gameplay screenshot: ${ss1Path}`);

    // Press 'H' to open the in-game Guide modal
    console.log("[6] Pressing 'H' to open instructions guide modal...");
    await page.keyboard.press("KeyH");
    await new Promise((r) => setTimeout(r, 600));

    const isModalOpen = await page.evaluate(() => {
      const modal = document.getElementById("modal-instructions");
      return modal && !modal.classList.contains("hidden");
    });
    console.log("Guide modal open state:", isModalOpen);

    // Capture screenshot 2: Instructions guide modal
    const ss2Path = path.join(artifactDir, "screenshot_jump02_guide_modal.png");
    await page.screenshot({ path: ss2Path });
    console.log(`[PASS] Saved guide modal screenshot: ${ss2Path}`);

    console.log("Console errors detected:", consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.warn("Errors:", consoleErrors);
    }
  } finally {
    await browser.close();
  }
}

verifyJump02Visuals().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
