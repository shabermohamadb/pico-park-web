// test/stage_push01_test.js
// Verification suite for Stage PUSH01 (Level 4) mechanics

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CONSTANTS = require("../shared/constants");
const LevelLoader = require("../shared/levelLoader");
const PhysicsWorld = require("../shared/physics");

console.log("=================================================================");
console.log("     PICO PARK WEB - STAGE PUSH01 / LEVEL 4 TEST SUITE          ");
console.log("=================================================================\n");

let passedCount = 0;
let totalCount = 0;

function test(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`[PASS] Test ${totalCount}: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`[FAIL] Test ${totalCount}: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const levelLoader = new LevelLoader();
const stagePush01Data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../shared/levels/stage_push01.json"), "utf8")
);

// Test 1: Data parsing & ColorBox verification
test("Stage PUSH01 data parsing - 8 ColorBoxes, 5 Platforms, Key & Goal", () => {
  const stage = levelLoader.loadLevelSync(stagePush01Data);
  assert.strictEqual(stage.actors.boxes.length, 8, "Must load 8 ColorBoxes");
  assert.strictEqual(stage.actors.platforms.length, 5, "Must load 5 Rect platforms");
  assert.ok(stage.actors.key, "Must load key");
  assert.ok(stage.actors.goal, "Must load goal");

  // Check each ColorBox's authentic dimension and matching player color
  const expectedColors = [
    CONSTANTS.PLAYER_COLORS[0].hex, // Peach
    CONSTANTS.PLAYER_COLORS[1].hex, // Periwinkle
    CONSTANTS.PLAYER_COLORS[2].hex, // Cyan
    CONSTANTS.PLAYER_COLORS[3].hex, // Pastel Green
    CONSTANTS.PLAYER_COLORS[4].hex, // Sky Blue
    CONSTANTS.PLAYER_COLORS[5].hex, // Pink
    CONSTANTS.PLAYER_COLORS[6].hex, // Rose
    CONSTANTS.PLAYER_COLORS[7].hex  // Light Gray
  ];

  stage.actors.boxes.forEach((b, i) => {
    assert.strictEqual(b.type, "ColorBox", `Box ${i} must be ColorBox`);
    assert.strictEqual(b.colorIndex, i, `Box ${i} colorIndex must be ${i}`);
    assert.strictEqual(b.color, expectedColors[i], `Box ${i} color must match player ${i + 1}`);
    assert.ok(b.w > 0 && b.h > 0, `Box ${i} dimensions must be positive numbers`);
  });

  // Verify specific evaluated dimensions
  assert.strictEqual(stage.actors.boxes[0].w, 48);
  assert.strictEqual(stage.actors.boxes[0].h, 48);
  assert.strictEqual(stage.actors.boxes[1].w, 40);
  assert.strictEqual(stage.actors.boxes[1].h, 40);
  assert.strictEqual(stage.actors.boxes[2].w, 48);
  assert.strictEqual(stage.actors.boxes[2].h, 48);
  assert.strictEqual(stage.actors.boxes[3].w, 36);
  assert.strictEqual(stage.actors.boxes[3].h, 44);
  assert.strictEqual(stage.actors.boxes[4].w, 42);
  assert.strictEqual(stage.actors.boxes[4].h, 46);
  assert.strictEqual(stage.actors.boxes[5].w, 24);
  assert.strictEqual(stage.actors.boxes[5].h, 40);
  assert.strictEqual(stage.actors.boxes[6].w, 30);
  assert.strictEqual(stage.actors.boxes[6].h, 42);
  assert.strictEqual(stage.actors.boxes[7].w, 18);
  assert.strictEqual(stage.actors.boxes[7].h, 38);
});

// Test 2: Player Spawn Safety
test("Player spawn safety - Players stand cleanly on floor without box clipping", () => {
  const stage = levelLoader.loadLevelSync(stagePush01Data);
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);
  const p2 = physics.addPlayer("p2", "Player 2", 2);

  assert.strictEqual(p1.x, 100);
  assert.strictEqual(p2.x, 150);
  assert.ok(p1.onGround, "P1 must stand on ground");
  assert.ok(p2.onGround, "P2 must stand on ground");

  // Verify no players overlap with any boxes at spawn
  physics.boxes.forEach((b) => {
    assert.ok(!physics.checkAABB(p1, b), "P1 must not overlap box at spawn");
    assert.ok(!physics.checkAABB(p2, b), "P2 must not overlap box at spawn");
  });
});

// Test 3: Box Settling & Solidity
test("Box physics settling - All boxes rest solidly on surfaces", () => {
  const stage = levelLoader.loadLevelSync(stagePush01Data);
  const physics = new PhysicsWorld(stage);
  physics.addPlayer("p1", "Player 1", 1);

  // Run 60 ticks of physics to allow suspended boxes to settle
  for (let i = 0; i < 60; i++) {
    physics.step(1 / 60);
  }

  physics.boxes.forEach((b) => {
    assert.ok(b.onGround, `Box ${b.id} must be onGround after falling`);
    assert.strictEqual(b.vy, 0, `Box ${b.id} vertical velocity must be 0`);
  });
});

// Test 4: Player Pushes ColorBox
test("Box push behavior - Player pushing ColorBox moves it with anti-penetration", () => {
  const stage = levelLoader.loadLevelSync(stagePush01Data);
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);

  // Position player right next to Box 0 (x: 576, w: 48, left edge at 552)
  p1.x = 552 - p1.w / 2 - 2;
  p1.y = 432 - p1.h / 2;
  p1.onGround = true;

  const box0 = physics.boxes[0];
  const initialBoxX = box0.x;

  // Move player right into the box
  p1.inputs.right = true;
  for (let i = 0; i < 30; i++) {
    physics.step(1 / 60);
  }

  assert.ok(box0.x > initialBoxX, "Box 0 must be pushed to the right");
  assert.ok(p1.x + p1.w / 2 <= box0.x - box0.w / 2 + 0.1, "Player must not penetrate inside box");
});

// Test 5: Jumping onto ColorBox
test("Jumping onto ColorBox - Player lands on top of Box 0 and stands stably", () => {
  const stage = levelLoader.loadLevelSync(stagePush01Data);
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);
  const box0 = physics.boxes[0];

  // Drop player above Box 0
  p1.x = box0.x;
  p1.y = box0.y - box0.h / 2 - 50;
  p1.vy = 0;
  p1.onGround = false;

  for (let i = 0; i < 60; i++) {
    physics.step(1 / 60);
  }

  assert.ok(p1.onGround, "Player must be on ground when on top of box");
  const expectedY = box0.y - box0.h / 2 - p1.h / 2;
  assert.ok(Math.abs(p1.y - expectedY) < 1.0, `Player Y (${p1.y}) must rest on top of box (${expectedY})`);
});

// Test 6: Platform Landing & Climbing
test("Platform landing - Player can jump and land on Platform 3", () => {
  const stage = levelLoader.loadLevelSync(stagePush01Data);
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);

  // Platform 3 is at x: 1608, y: 256, w: 288, h: 48. Top edge is y = 256 - 24 = 232.
  // Drop player above Platform 3
  p1.x = 1608;
  p1.y = 150;
  p1.vy = 0;
  p1.onGround = false;

  for (let i = 0; i < 60; i++) {
    physics.step(1 / 60);
  }

  assert.ok(p1.onGround, "Player must land on Platform 3");
  const expectedY = 232 - p1.h / 2;
  assert.ok(Math.abs(p1.y - expectedY) < 1.0, `Player Y (${p1.y}) must rest on platform top (${expectedY})`);
});

// Test 6: Key Pickup
test("Key pickup - Player touching key collects and carries it", () => {
  const stage = levelLoader.loadLevelSync(stagePush01Data);
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);

  // Key is at (1992, 48)
  p1.x = 1992;
  p1.y = 48;
  physics.step(1 / 60);

  assert.strictEqual(physics.key.state, CONSTANTS.KEY_STATE.KEY_CARRIED, "Key must be carried");
  assert.strictEqual(physics.key.heldBy, "p1", "Key heldBy must be p1");
});

// Test 7: Goal Door Unlock
test("Goal door unlock - Carrying key to goal door unlocks it", () => {
  const stage = levelLoader.loadLevelSync(stagePush01Data);
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);
  const p2 = physics.addPlayer("p2", "Player 2", 2);

  // Give key to player 1
  physics.key.state = CONSTANTS.KEY_STATE.KEY_CARRIED;
  physics.key.heldBy = "p1";

  // Goal door is at (2808, 72). P1 reaches goal, P2 stays at spawn (150, 432)
  p1.x = 2808;
  p1.y = 72;
  physics.step(1 / 60);

  assert.ok(physics.goal.isOpen, "Goal door must unlock and open");
  assert.strictEqual(physics.key.state, CONSTANTS.KEY_STATE.KEY_USED, "Key state must be KEY_USED");
  assert.strictEqual(physics.stageState, CONSTANTS.STAGE_STATE.GOAL_UNLOCKED, "Stage state must be GOAL_UNLOCKED");
  assert.strictEqual(physics.levelCompleted, false, "Must not complete until all players inside");
});

// Test 8: Level Complete
test("Level complete - All alive players entering unlocked goal door completes level", () => {
  const stage = levelLoader.loadLevelSync(stagePush01Data);
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);
  const p2 = physics.addPlayer("p2", "Player 2", 2);

  // Door is open
  physics.goal.isOpen = true;
  physics.key.state = CONSTANTS.KEY_STATE.KEY_USED;

  // Move all players into door
  p1.x = physics.goal.x;
  p1.y = physics.goal.y;
  p2.x = physics.goal.x;
  p2.y = physics.goal.y;
  physics.step(1 / 60);

  assert.ok(p1.inGoal, "P1 must be inside goal");
  assert.ok(p2.inGoal, "P2 must be inside goal");
  assert.strictEqual(physics.stageState, CONSTANTS.STAGE_STATE.COMPLETE, "Stage state must be COMPLETE");
  assert.ok(physics.levelCompleted, "levelCompleted must be true");

  const winEvents = physics.events.filter((e) => e.type === "sound" && e.name === "win");
  assert.ok(winEvents.length > 0, "Win sound event must be emitted");
});

// Test 9: Retry Reset
test("Retry (R) - Cleanly resets stage objects, boxes, key, players, and door", () => {
  const stage = levelLoader.loadLevelSync(stagePush01Data);
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);

  // Change state: collect key, open door, complete level
  physics.goal.isOpen = true;
  physics.key.state = CONSTANTS.KEY_STATE.KEY_USED;
  p1.inGoal = true;
  physics.stageState = CONSTANTS.STAGE_STATE.COMPLETE;
  physics.levelCompleted = true;

  // Execute reset
  physics.resetStage();

  assert.strictEqual(physics.stageState, CONSTANTS.STAGE_STATE.PLAYING, "Stage state must reset to PLAYING");
  assert.strictEqual(physics.levelCompleted, false, "levelCompleted must reset to false");
  assert.strictEqual(physics.goal.isOpen, false, "Goal door must reset to closed");
  assert.strictEqual(physics.key.state, CONSTANTS.KEY_STATE.KEY_AVAILABLE, "Key must reset to KEY_AVAILABLE");
  assert.strictEqual(p1.inGoal, false, "Player inGoal must reset to false");
  assert.strictEqual(physics.boxes.length, 8, "Must maintain all 8 boxes");
});

console.log("\n=================================================================");
console.log(`     RESULTS: ${passedCount} / ${totalCount} STAGE PUSH01 TESTS PASSED`);
console.log("=================================================================\n");

if (passedCount !== totalCount) {
  process.exit(1);
}
