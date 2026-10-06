// Stage JUMP02 Automated Test Suite
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CONSTANTS = require("../shared/constants");
const LevelLoader = require("../shared/levelLoader");
const PhysicsWorld = require("../shared/physics");

console.log("=================================================================");
console.log("     PICO PARK WEB - STAGE JUMP02 / LEVEL 3 TEST SUITE          ");
console.log("=================================================================\n");

let passedCount = 0;
let totalCount = 0;

function runTest(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`[PASS] Test ${totalCount}: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`[FAIL] Test ${totalCount}: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

const levelData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../shared/levels/stage_jump02.json"), "utf8")
);
const levelLoader = new LevelLoader();

// Test 1: Actor and Platform Parsing
runTest("Stage JUMP02 data parsing - Platforms, bridges, switches, and boxes", () => {
  const level = levelLoader.loadLevelSync(levelData);
  assert.strictEqual(level.name, "stage_jump02");
  assert.ok(level.actors.platforms.length >= 8, `Expected at least 8 platforms, got ${level.actors.platforms.length}`);

  // Exactly 2 pushable boxes for solo/standard play
  assert.strictEqual(level.actors.boxes.length, 2, `Expected 2 pushable boxes, got ${level.actors.boxes.length}`);
  assert.strictEqual(level.actors.boxes[0].x, 960);
  assert.strictEqual(level.actors.boxes[1].x, 1200);

  // Bridges and gates parsed
  assert.ok(level.actors.bridges.length >= 2, `Expected bridges, got ${level.actors.bridges.length}`);
  for (const br of level.actors.bridges) {
    assert.ok(!isNaN(br.targetX), `Bridge ${br.id} targetX is NaN`);
    assert.ok(!isNaN(br.targetY), `Bridge ${br.id} targetY is NaN`);
  }

  // Key and Goal exist
  assert.ok(level.actors.key, "Key actor must exist");
  assert.ok(level.actors.goal, "Goal door must exist");

  // 8 floor switches
  const floorSwitches = level.actors.switches.filter((s) => s.isFloorSwitch);
  assert.strictEqual(floorSwitches.length, 8, `Expected 8 floor switches, got ${floorSwitches.length}`);
});

// Test 2: Spawn safety - No box dropped on player at spawn
runTest("Spawn safety - Player 1 stands freely on floor without overlapping boxes", () => {
  const level = levelLoader.loadLevelSync(levelData);
  const world = new PhysicsWorld(level);
  const p1 = world.addPlayer("p1", "Player 1", 1);

  // Tick physics for 0.5s
  for (let i = 0; i < 30; i++) world.step(1 / 60);

  for (const b of world.boxes) {
    assert.ok(!world.checkAABB(p1, b), `Player must not overlap box ${b.id} at spawn`);
  }
  assert.strictEqual(p1.onGround, true, "Player 1 must be on ground");
});

// Test 3: Platform Solidity - Standing on stairs
runTest("Platform solidity - Player lands on Rect stairs platform", () => {
  const level = levelLoader.loadLevelSync(levelData);
  const world = new PhysicsWorld(level);
  const p1 = world.addPlayer("p1", "Player 1", 1);

  // Place player above first staircase platform (x: 560, y: 336, w: 48, h: 48)
  p1.x = 560;
  p1.y = 250;
  p1.vx = 0;
  p1.vy = 0;
  p1.onGround = false;

  // Simulate falling onto the platform
  for (let i = 0; i < 30; i++) {
    world.step(1 / 60);
    if (p1.onGround) break;
  }

  assert.strictEqual(p1.onGround, true, "Player must land on the platform");
  // Platform top is at y = 336 - 24 = 312. Player feet at y + h/2 = 312 -> p1.y = 312 - 23 = 289
  assert.ok(Math.abs(p1.y - 289) < 2.0, `Player Y should be ~289 on platform, got ${p1.y}`);
});

// Test 4: Climbing stairs to top ledge
runTest("Climbing stairs - Can jump and land progressively higher on steps", () => {
  const level = levelLoader.loadLevelSync(levelData);
  const world = new PhysicsWorld(level);
  const p1 = world.addPlayer("p1", "Player 1", 1);

  // Step 1: (560, 336)
  p1.x = 560;
  p1.y = 289;
  p1.onGround = true;

  // Step 2: (608, 288) -> top is at 288 - 24 = 264
  p1.x = 608;
  p1.y = 200;
  for (let i = 0; i < 30; i++) world.step(1 / 60);
  assert.strictEqual(p1.onGround, true);
  assert.ok(p1.y < 289, "Step 2 must be higher than step 1");

  // Top step: (704, 96) -> top is at 96 - 24 = 72
  p1.x = 704;
  p1.y = 30;
  for (let i = 0; i < 30; i++) world.step(1 / 60);
  assert.strictEqual(p1.onGround, true);
  assert.ok(Math.abs(p1.y - (72 - p1.h / 2)) < 2.0, `Player should be on top step, got ${p1.y}`);
});

// Test 5: Upper switch activates Bridge 2 smoothly
runTest("Upper switch - Standing on switch activates Bridge 2 without NaN", () => {
  const level = levelLoader.loadLevelSync(levelData);
  const world = new PhysicsWorld(level);
  const p1 = world.addPlayer("p1", "Player 1", 1);

  const upperSwitch = world.switches.find((s) => s.x === 912);
  assert.ok(upperSwitch, "Upper switch must exist at x: 912");

  const bridge2 = world.bridges.find((b) => b.id === "2");
  assert.ok(bridge2, "Bridge 2 must exist");
  assert.strictEqual(bridge2.isOpen, false);

  // Player stands on upper switch
  p1.x = upperSwitch.x;
  p1.y = upperSwitch.y - p1.h / 2;
  p1.vy = 0;

  for (let i = 0; i < 20; i++) world.step(1 / 60);

  assert.strictEqual(upperSwitch.isPressed, true, "Upper switch must be pressed");
  assert.strictEqual(bridge2.isOpen, true, "Bridge 2 must be open when switch pressed");
  assert.ok(!isNaN(bridge2.x), "Bridge 2 x must not be NaN");
  assert.ok(!isNaN(bridge2.y), "Bridge 2 y must not be NaN");
});

// Test 6: Key pickup and follow
runTest("Key pickup - Player touching key collects and carries it", () => {
  const level = levelLoader.loadLevelSync(levelData);
  const world = new PhysicsWorld(level);
  const p1 = world.addPlayer("p1", "Player 1", 1);

  assert.strictEqual(world.key.state, CONSTANTS.KEY_STATE.KEY_AVAILABLE);

  // Move player to key position
  p1.x = world.key.x;
  p1.y = world.key.y;

  world.step(1 / 60);

  assert.strictEqual(world.key.state, CONSTANTS.KEY_STATE.KEY_CARRIED);
  assert.strictEqual(world.key.heldBy, p1.id);
  assert.strictEqual(world.stageState, CONSTANTS.STAGE_STATE.KEY_COLLECTED);
});

// Test 7: Floor switch pressed by player physical contact
runTest("Floor switch - Physical contact by player sets isPressed: true and plays sound", () => {
  const level = levelLoader.loadLevelSync(levelData);
  const world = new PhysicsWorld(level);
  const p1 = world.addPlayer("p1", "Player 1", 1);

  const sw1 = world.switches.find((s) => s.x === 1344);
  assert.ok(sw1, "Floor switch 1 must exist at x: 1344");
  assert.strictEqual(sw1.isPressed, false);

  // Position player standing on switch
  p1.x = sw1.x;
  p1.y = sw1.y - p1.h / 2;
  p1.vy = 0;

  world.step(1 / 60);

  assert.strictEqual(sw1.isPressed, true, "Floor switch must be pressed by player feet");
  const events = world.drainEvents();
  assert.ok(events.some((e) => e.type === "sound" && e.name === "switch"), "Must emit switch sound event");
});

// Test 8: Pushing box onto floor switch holds it pressed
runTest("Box on switch - Pushing box onto switch holds switch pressed", () => {
  const level = levelLoader.loadLevelSync(levelData);
  const world = new PhysicsWorld(level);
  world.addPlayer("p1", "Player 1", 1);

  const box1 = world.boxes[0];
  const sw1 = world.switches.find((s) => s.x === 1344);

  // Place box directly over switch
  box1.x = sw1.x;
  box1.y = sw1.y - box1.h / 2 + 6;
  box1.vy = 0;
  box1.onGround = true;

  world.step(1 / 60);

  assert.strictEqual(sw1.isPressed, true, "Floor switch must be pressed by box");
});

// Test 9: Goal door remains LOCKED when key carried but switches NOT active
runTest("Goal door lock condition - Key carried alone does NOT unlock door without switches", () => {
  const level = levelLoader.loadLevelSync(levelData);
  const world = new PhysicsWorld(level);
  const p1 = world.addPlayer("p1", "Player 1", 1);

  // Give player key
  world.key.state = CONSTANTS.KEY_STATE.KEY_CARRIED;
  world.key.heldBy = p1.id;

  // Move player to goal door without pressing floor switches
  p1.x = world.goal.x;
  p1.y = world.goal.y;

  world.step(1 / 60);

  assert.strictEqual(world.allRequiredSwitchesActive(), false, "Switches should not be active");
  assert.strictEqual(world.goal.isOpen, false, "Goal door must remain locked when switches are not active");
});

// Test 10: Goal door unlocks when BOTH key carried AND required switches active
runTest("Goal door unlock - Unlocks when BOTH key carried AND required switches active", () => {
  const level = levelLoader.loadLevelSync(levelData);
  const world = new PhysicsWorld(level);
  const p1 = world.addPlayer("p1", "Player 1", 1);

  // Give player key
  world.key.state = CONSTANTS.KEY_STATE.KEY_CARRIED;
  world.key.heldBy = p1.id;

  // Place 2 boxes on 2 floor switches (fulfilling solo requirement of 2 switches)
  const floorSwitches = world.switches.filter((s) => s.isFloorSwitch);
  world.boxes[0].x = floorSwitches[0].x;
  world.boxes[0].y = floorSwitches[0].y - world.boxes[0].h / 2 + 6;
  world.boxes[1].x = floorSwitches[1].x;
  world.boxes[1].y = floorSwitches[1].y - world.boxes[1].h / 2 + 6;

  world.step(1 / 60);
  assert.strictEqual(world.allRequiredSwitchesActive(), true, "2 switches active should satisfy solo requirement");

  // Now keyholder touches goal door
  p1.x = world.goal.x;
  p1.y = world.goal.y;
  world.step(1 / 60);

  assert.strictEqual(world.goal.isOpen, true, "Goal door must unlock");
  assert.ok(world.key.state === CONSTANTS.KEY_STATE.KEY_USED || world.key.state === CONSTANTS.KEY_STATE.LEVEL_COMPLETE, "Key must be used or level complete");
  assert.ok(world.stageState === CONSTANTS.STAGE_STATE.GOAL_UNLOCKED || world.stageState === CONSTANTS.STAGE_STATE.COMPLETE);
});

// Test 11: End-to-end Solo Play level completion
runTest("End-to-end Solo Play - Collect key, push boxes onto switches, enter door, clear level", () => {
  const level = levelLoader.loadLevelSync(levelData);
  const world = new PhysicsWorld(level);
  const p1 = world.addPlayer("p1", "Player 1", 1);

  // 1. Grab key
  world.key.state = CONSTANTS.KEY_STATE.KEY_CARRIED;
  world.key.heldBy = p1.id;

  // 2. Push boxes onto 2 switches
  const floorSwitches = world.switches.filter((s) => s.isFloorSwitch);
  world.boxes[0].x = floorSwitches[0].x;
  world.boxes[0].y = floorSwitches[0].y - world.boxes[0].h / 2 + 6;
  world.boxes[1].x = floorSwitches[1].x;
  world.boxes[1].y = floorSwitches[1].y - world.boxes[1].h / 2 + 6;
  world.step(1 / 60);

  // 3. Approach door to unlock
  p1.x = world.goal.x;
  p1.y = world.goal.y;
  world.step(1 / 60);
  assert.strictEqual(world.goal.isOpen, true);

  // 4. Enter goal door
  world.step(1 / 60);
  assert.strictEqual(p1.inGoal, true);
  assert.strictEqual(world.levelCompleted, true, "Stage must be completed");
  assert.strictEqual(world.stageState, CONSTANTS.STAGE_STATE.COMPLETE);

  const events = world.drainEvents();
  assert.ok(events.some((e) => e.type === "level_clear"), "Must emit level_clear event");
  assert.ok(events.some((e) => e.type === "sound" && e.name === "win"), "Must emit win SFX");
});

// Test 12: End-to-end Multiplayer cooperative completion (4 players)
runTest("End-to-end Multiplayer (4 players) - Cooperative switches, key unlock, all enter door", () => {
  const level = levelLoader.loadLevelSync(levelData);
  const world = new PhysicsWorld(level);
  const p1 = world.addPlayer("p1", "Player 1", 1);
  const p2 = world.addPlayer("p2", "Player 2", 2);
  const p3 = world.addPlayer("p3", "Player 3", 3);
  const p4 = world.addPlayer("p4", "Player 4", 4);

  const floorSwitches = world.switches.filter((s) => s.isFloorSwitch);

  // P1 carries key
  world.key.state = CONSTANTS.KEY_STATE.KEY_CARRIED;
  world.key.heldBy = p1.id;

  // For 4 players, 4 switches required: 2 boxes + 2 players (p2, p3)
  world.boxes[0].x = floorSwitches[0].x;
  world.boxes[0].y = floorSwitches[0].y - world.boxes[0].h / 2 + 6;
  world.boxes[1].x = floorSwitches[1].x;
  world.boxes[1].y = floorSwitches[1].y - world.boxes[1].h / 2 + 6;

  p2.x = floorSwitches[2].x;
  p2.y = floorSwitches[2].y - p2.h / 2;
  p3.x = floorSwitches[3].x;
  p3.y = floorSwitches[3].y - p3.h / 2;

  world.step(1 / 60);
  assert.strictEqual(world.allRequiredSwitchesActive(), true, "4 switches must be active for 4 players");

  // P1 unlocks door
  p1.x = world.goal.x;
  p1.y = world.goal.y;
  world.step(1 / 60);
  assert.strictEqual(world.goal.isOpen, true, "Door must unlock");

  // Only P1 inside door -> NOT yet complete
  assert.strictEqual(world.levelCompleted, false, "All players must be inside door to complete");

  // All 4 players enter door
  p2.x = world.goal.x;
  p2.y = world.goal.y;
  p3.x = world.goal.x;
  p3.y = world.goal.y;
  p4.x = world.goal.x;
  p4.y = world.goal.y;

  world.step(1 / 60);

  assert.strictEqual(world.levelCompleted, true, "All players in door -> stage complete");
  assert.strictEqual(world.stageState, CONSTANTS.STAGE_STATE.COMPLETE);
});

// Test 13: Clean Retry (R) restores all stage objects
runTest("Retry (R) - Cleanly resets stage objects, switches, key, door, and boxes", () => {
  const level = levelLoader.loadLevelSync(levelData);
  const world = new PhysicsWorld(level);
  const p1 = world.addPlayer("p1", "Player 1", 1);

  // Mess up world: move player, pickup key, press switches, unlock door
  p1.x = 1800;
  world.key.state = CONSTANTS.KEY_STATE.KEY_USED;
  world.goal.isOpen = true;
  world.switches[0].isPressed = true;
  world.boxes[0].x = 1500;

  // Reset
  world.resetStage();

  assert.strictEqual(world.levelCompleted, false);
  assert.strictEqual(world.stageState, CONSTANTS.STAGE_STATE.PLAYING);
  assert.strictEqual(world.key.state, CONSTANTS.KEY_STATE.KEY_AVAILABLE);
  assert.strictEqual(world.goal.isOpen, false);
  assert.strictEqual(world.switches[0].isPressed, false);
  assert.strictEqual(world.boxes[0].x, 960);
  assert.strictEqual(p1.x, 408);
});

console.log("\n=================================================================");
console.log(`     RESULTS: ${passedCount} / ${totalCount} STAGE JUMP02 TESTS PASSED`);
console.log("=================================================================\n");
