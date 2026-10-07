// tests/stage_time_trampoline_test.js
// Unit & Integration Test Suite for Stage Time Trampoline

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const CONSTANTS = require("../src/game/game-state/GameState");
const LevelLoader = require("../src/game/levels/LevelManager");
const PhysicsWorld = require("../src/game/physics/PhysicsManager");

async function runTests() {
  console.log("=================================================================");
  console.log("     TESTING STAGE: TIME TRAMPOLINE (SPRING TOWER & LIFTS)");
  console.log("=================================================================\n");

  let passed = 0;
  let total = 0;

  function pass(testNum, desc) {
    passed++;
    total++;
    console.log(`[PASS] Test ${testNum}: ${desc}`);
  }

  const levelPath = path.join(__dirname, "../assets/maps/level-data/stage_time_trampoline.json");
  assert.ok(fs.existsSync(levelPath), "stage_time_trampoline.json must exist");
  const rawData = JSON.parse(fs.readFileSync(levelPath, "utf8"));

  const loader = new LevelLoader();
  const stageData = loader.loadLevelSync(rawData);

  // Test 1: Level Loading & Configuration
  try {
    assert.strictEqual(stageData.name, "stage_time_trampoline");
    assert.strictEqual(stageData.width, 40);
    assert.strictEqual(stageData.height, 23);
    assert.strictEqual(stageData.timeLimit, 25);
    pass(1, "Stage configuration - 40x23 grid, timeLimit: 25s correctly loaded");
  } catch (e) {
    console.error("[FAIL] Test 1:", e.message);
    total++;
  }

  // Test 2: JumpStands (Trampolines) Actor Parsing
  try {
    assert.strictEqual(stageData.actors.jumpStands.length, 2, "Must have exactly 2 JumpStands");
    const [jsL, jsR] = stageData.actors.jumpStands;
    assert.strictEqual(jsL.id, "jump_left");
    assert.strictEqual(jsL.x, 168);
    assert.strictEqual(jsR.id, "jump_right");
    assert.strictEqual(jsR.x, 1112);
    pass(2, "JumpStands parsing - Left and Right spring trampolines parsed with coordinates");
  } catch (e) {
    console.error("[FAIL] Test 2:", e.message);
    total++;
  }

  // Test 3: Cyan Platforms & Green Bridges
  try {
    const platforms = stageData.actors.platforms;
    const cyanPlats = platforms.filter(p => p.color === "cyan");
    const greenBridges = platforms.filter(p => p.color === "green");
    assert.strictEqual(cyanPlats.length, 5, "Must have exactly 5 cyan platforms");
    assert.strictEqual(greenBridges.length, 2, "Must have exactly 2 green bridges");
    pass(3, "Platforms - 5 cyan platforms and 2 green bridges configured");
  } catch (e) {
    console.error("[FAIL] Test 3:", e.message);
    total++;
  }

  // Test 4: Left JumpStand Spring Bounce
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const jsL = physics.jumpStands.find(j => j.id === "jump_left");

    // Position player directly touching left JumpStand and drop down
    p1.x = jsL.x;
    p1.y = jsL.y - 30;
    p1.vy = 200; // falling down onto trampoline

    physics.step(0.016);

    assert.ok(p1.vy < -400, `Player must be launched upward with high velocity (got ${p1.vy})`);
    assert.ok(jsL.compressed > 0, "Trampoline spring must be compressed for animation");
    const events = physics.drainEvents();
    assert.ok(events.some(ev => ev.name === "bound"), "Bounce sound event must be emitted");
    pass(4, "Left JumpStand bounce - Stepping on spring trampoline propels player upward");
  } catch (e) {
    console.error("[FAIL] Test 4:", e.message);
    total++;
  }

  // Test 5: Right JumpStand Spring Bounce
  try {
    const physics = new PhysicsWorld(stageData);
    const p2 = physics.addPlayer("p2", "Player 2", 2);
    const jsR = physics.jumpStands.find(j => j.id === "jump_right");

    p2.x = jsR.x;
    p2.y = jsR.y - 30;
    p2.vy = 200;

    physics.step(0.016);

    assert.ok(p2.vy < -400, "Right trampoline must propel player upward");
    pass(5, "Right JumpStand bounce - Right trampoline launches player upward");
  } catch (e) {
    console.error("[FAIL] Test 5:", e.message);
    total++;
  }

  // Test 6: Cyan Platform Landing
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const platCenter = physics.platforms.find(p => p.id === "cyan_plat_center");

    // Place player above center cyan platform and step
    p1.x = platCenter.x;
    p1.y = platCenter.y - platCenter.h / 2 - p1.h / 2 - 10;
    p1.vy = 100;

    for (let i = 0; i < 20; i++) physics.step(0.016);

    assert.strictEqual(p1.onGround, true, "Player must land solidly on cyan platform");
    assert.strictEqual(p1.vy, 0, "Vertical velocity becomes 0 upon landing");
    pass(6, "Cyan platform collision - Solid footing on center cyan platform");
  } catch (e) {
    console.error("[FAIL] Test 6:", e.message);
    total++;
  }

  // Test 7: Green Bridge Traversal
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const bridgeL = physics.platforms.find(p => p.id === "green_bridge_l");

    p1.x = bridgeL.x;
    p1.y = bridgeL.y - bridgeL.h / 2 - p1.h / 2;
    p1.vy = 0;

    physics.step(0.016);
    assert.strictEqual(p1.onGround, true, "Player can walk across green bridge");
    pass(7, "Green bridge support - Green bridge supports player movement between platforms");
  } catch (e) {
    console.error("[FAIL] Test 7:", e.message);
    total++;
  }

  // Test 8: Key Pickup
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const key = physics.key;
    assert.ok(key, "Key must exist");

    p1.x = key.x;
    p1.y = key.y;
    physics.step(0.016);

    assert.strictEqual(key.heldBy, "p1", "Player 1 collects Key");
    assert.strictEqual(key.state, CONSTANTS.KEY_STATE.KEY_CARRIED);
    pass(8, "Key collection - Player collects and carries golden key");
  } catch (e) {
    console.error("[FAIL] Test 8:", e.message);
    total++;
  }

  // Test 9: Goal Door Unlock
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const p2 = physics.addPlayer("p2", "Player 2", 2); // p2 stays outside

    // Pick up key
    p1.x = physics.key.x; p1.y = physics.key.y;
    physics.step(0.016);

    // Approach goal door
    p1.x = physics.goal.x; p1.y = physics.goal.y;
    physics.step(0.016);

    assert.strictEqual(physics.goal.isOpen, true, "Goal Door must unlock with Key");
    assert.strictEqual(physics.stageState, CONSTANTS.STAGE_STATE.GOAL_UNLOCKED);
    pass(9, "Goal Door unlocking - Bringing key to door unlocks it");
  } catch (e) {
    console.error("[FAIL] Test 9:", e.message);
    total++;
  }

  // Test 10: Cooperative Clearance
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const p2 = physics.addPlayer("p2", "Player 2", 2);

    // Pick up key
    p1.x = physics.key.x; p1.y = physics.key.y;
    physics.step(0.016);

    // Both players enter door
    p1.x = physics.goal.x; p1.y = physics.goal.y;
    p2.x = physics.goal.x; p2.y = physics.goal.y;
    physics.step(0.016);

    assert.strictEqual(physics.levelCompleted, true, "Stage must be cleared");
    assert.strictEqual(physics.stageState, CONSTANTS.STAGE_STATE.COMPLETE);
    pass(10, "Cooperative victory - All players entering unlocked door clears level");
  } catch (e) {
    console.error("[FAIL] Test 10:", e.message);
    total++;
  }

  // Test 11: Countdown Timer Ticking
  try {
    const physics = new PhysicsWorld(stageData);
    physics.stageState = CONSTANTS.STAGE_STATE.PLAYING;
    assert.strictEqual(physics.timeRemaining, 25, "Initial time is 25s");

    physics.step(1.0);
    assert.ok(Math.abs(physics.timeRemaining - 24.0) < 0.05, `Time counts down (got ${physics.timeRemaining})`);
    pass(11, "Countdown timer - Timer decrements smoothly during gameplay");
  } catch (e) {
    console.error("[FAIL] Test 11:", e.message);
    total++;
  }

  // Test 12: Stage Timeout Reset
  try {
    const physics = new PhysicsWorld(stageData);
    physics.stageState = CONSTANTS.STAGE_STATE.PLAYING;
    physics.timeRemaining = 0.01; // almost expired

    physics.step(0.016);

    // Timeout triggers reset
    assert.strictEqual(physics.timeRemaining, 25, "Timer resets to 25s on timeout");
    assert.strictEqual(physics.levelCompleted, false);
    pass(12, "Timeout reset - Reaching 00:00 resets the stage cleanly");
  } catch (e) {
    console.error("[FAIL] Test 12:", e.message);
    total++;
  }

  // Test 13: Vertical Shaft Wrap
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);

    // Moving up through left ceiling opening (x ~ 280)
    p1.x = 280;
    p1.y = -15;
    p1.vy = -300;

    physics.step(0.016);

    assert.ok(p1.y > 600, `Player wrapping through top emerges at bottom floor (got y=${p1.y})`);
    pass(13, "Vertical shaft wrap - Moving through ceiling opening wraps to floor shaft");
  } catch (e) {
    console.error("[FAIL] Test 13:", e.message);
    total++;
  }

  // Test 14: Stage Reset (Retry R)
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);

    // Collect key and advance timer
    p1.x = physics.key.x; p1.y = physics.key.y;
    physics.step(0.016);
    physics.step(5.0);

    assert.strictEqual(physics.key.heldBy, "p1");
    assert.ok(physics.timeRemaining < 25);

    physics.resetStage();

    assert.strictEqual(physics.key.heldBy, null, "Key is unheld after reset");
    assert.strictEqual(physics.timeRemaining, 25, "Timer restored to full");
    assert.strictEqual(physics.goal.isOpen, false, "Door locked again");
    assert.strictEqual(physics.levelCompleted, false);
    pass(14, "Stage reset (Retry R) - Restores key, door, players, and full countdown timer");
  } catch (e) {
    console.error("[FAIL] Test 14:", e.message);
    total++;
  }

  console.log("\n=================================================================");
  console.log(`     RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log("=================================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
