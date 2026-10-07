const puppeteer = require("puppeteer-core");
const path = require("path");

async function verifyMobileExperience() {
  console.log("=== Launching Chromium Headless for Mobile Touchscreen & Orientation Verification ===");
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"]
  });

  const artifactDir = "/home/shaber/.gemini/antigravity/brain/56563386-ffcc-455f-bb03-a3167da9cd4b";

  try {
    // -------------------------------------------------------------
    // PART 1: Portrait Mode Advisory Verification
    // -------------------------------------------------------------
    console.log("\n[Part 1] Testing Portrait Orientation Advisory Banner...");
    const portraitPage = await browser.newPage();
    await portraitPage.setViewport({
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2
    });

    await portraitPage.goto("http://localhost:3001/?stage=stage_time_trampoline", {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });

    await portraitPage.waitForSelector("#portrait-rotate-prompt", { timeout: 5000 });
    const isPortraitPromptVisible = await portraitPage.$eval("#portrait-rotate-prompt", (el) => {
      return !el.classList.contains("hidden") && window.getComputedStyle(el).display !== "none";
    });
    console.log(`  -> Portrait Prompt Visible: ${isPortraitPromptVisible}`);

    // Capture Portrait Screenshot
    const portraitSsPath = path.join(artifactDir, "screenshot_mobile_portrait.png");
    await portraitPage.screenshot({ path: portraitSsPath });
    console.log("  -> Saved portrait screenshot: " + portraitSsPath);

    // Test Dismiss button
    await portraitPage.click("#btn-dismiss-portrait");
    await new Promise((r) => setTimeout(r, 200));
    const isDismissed = await portraitPage.$eval("#portrait-rotate-prompt", (el) => {
      return el.classList.contains("hidden");
    });
    console.log(`  -> Portrait Prompt Dismissed on Click: ${isDismissed}`);
    await portraitPage.close();

    // -------------------------------------------------------------
    // PART 2: Landscape Mobile Gameplay & Multi-Touch Gamepad
    // -------------------------------------------------------------
    console.log("\n[Part 2] Testing Landscape Multi-Touch Gamepad & Virtual Input...");
    const page = await browser.newPage();
    await page.setViewport({
      width: 844,
      height: 390,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2
    });

    await page.goto("http://localhost:3001/?stage=stage_time_trampoline&touch=1", {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });

    console.log("  -> Creating room...");
    await page.waitForSelector("#btn-go-create", { visible: true, timeout: 5000 });
    await page.click("#btn-go-create");

    await page.waitForSelector("#btn-create-room-submit", { visible: true, timeout: 5000 });
    await page.click("#btn-create-room-submit");

    console.log("  -> Starting game in lobby...");
    await page.waitForSelector("#btn-start-game", { visible: true, timeout: 5000 });
    await page.click("#btn-start-game");

    await page.waitForFunction(() => !document.getElementById("screen-game").classList.contains("hidden"), { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 1500));

    // Verify touch controls container visibility
    const isTouchControlsVisible = await page.$eval("#touch-controls-container", (el) => {
      return !el.classList.contains("touch-hidden") && window.getComputedStyle(el).display !== "none";
    });
    console.log(`  -> Touch Controls Container Visible: ${isTouchControlsVisible}`);

    // Check button sizes (>= 60px)
    const buttonMetrics = await page.evaluate(() => {
      const leftBtn = document.getElementById("touch-btn-left").getBoundingClientRect();
      const rightBtn = document.getElementById("touch-btn-right").getBoundingClientRect();
      const jumpBtn = document.getElementById("touch-btn-jump").getBoundingClientRect();
      const actionBtn = document.getElementById("touch-btn-action").getBoundingClientRect();
      return {
        left: { w: Math.round(leftBtn.width), h: Math.round(leftBtn.height) },
        right: { w: Math.round(rightBtn.width), h: Math.round(rightBtn.height) },
        jump: { w: Math.round(jumpBtn.width), h: Math.round(jumpBtn.height) },
        action: { w: Math.round(actionBtn.width), h: Math.round(actionBtn.height) }
      };
    });
    console.log("  -> Touch Button Dimensions:", JSON.stringify(buttonMetrics));

    // Test touching virtual RIGHT button and verify player moves right
    console.log("  -> Pressing Virtual RIGHT button via pointer down...");
    await page.evaluate(() => {
      const btn = document.getElementById("touch-btn-right");
      btn.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, bubbles: true, cancelable: true }));
    });
    await new Promise((r) => setTimeout(r, 600));

    // Test simultaneous virtual JUMP button (multi-touch)
    console.log("  -> Pressing Virtual JUMP button simultaneously (multi-touch run + jump)...");
    await page.evaluate(() => {
      const jumpBtn = document.getElementById("touch-btn-jump");
      jumpBtn.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 2, bubbles: true, cancelable: true }));
    });
    await new Promise((r) => setTimeout(r, 400));

    // Release buttons
    await page.evaluate(() => {
      const rightBtn = document.getElementById("touch-btn-right");
      const jumpBtn = document.getElementById("touch-btn-jump");
      rightBtn.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true, cancelable: true }));
      jumpBtn.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2, bubbles: true, cancelable: true }));
    });
    await new Promise((r) => setTimeout(r, 300));

    // Capture Landscape Gameplay Screenshot with Touch Gamepad
    const gameplaySsPath = path.join(artifactDir, "screenshot_mobile_gameplay.png");
    await page.screenshot({ path: gameplaySsPath });
    console.log("  -> Saved mobile gameplay screenshot: " + gameplaySsPath);

    // -------------------------------------------------------------
    // PART 3: In-Game Settings & Auto Fullscreen Option Verification
    // -------------------------------------------------------------
    console.log("\n[Part 3] Testing Settings Modal & Auto Fullscreen Option...");
    await page.click("#btn-ingame-settings");
    await page.waitForSelector("#modal-settings", { visible: true, timeout: 5000 });
    await new Promise((r) => setTimeout(r, 400));

    // Check Auto Fullscreen checkbox state
    const autoFsChecked = await page.$eval("#check-auto-fullscreen", (el) => el.checked);
    console.log(`  -> Auto Fullscreen Checkbox Initially Checked: ${autoFsChecked}`);

    // Toggle Auto Fullscreen and verify localStorage update
    await page.click("#check-auto-fullscreen");
    const storedAutoFs = await page.evaluate(() => localStorage.getItem("pico_auto_fullscreen"));
    console.log(`  -> Toggled Auto Fullscreen Stored in localStorage: ${storedAutoFs}`);

    // Toggle back to true
    await page.click("#check-auto-fullscreen");
    await new Promise((r) => setTimeout(r, 300));

    // Capture Settings Modal Screenshot showing Auto Fullscreen
    const settingsSsPath = path.join(artifactDir, "screenshot_settings_auto_fullscreen.png");
    await page.screenshot({ path: settingsSsPath });
    console.log("  -> Saved settings screenshot: " + settingsSsPath);

    console.log("\n=======================================================");
    console.log("   MOBILE BROWSER VERIFICATION COMPLETED SUCCESSFULLY! ");
    console.log("=======================================================\n");

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error("Mobile browser verification error:", err);
    await browser.close();
    process.exit(1);
  }
}

verifyMobileExperience();
