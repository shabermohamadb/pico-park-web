// test/chain_system_test.js
// PICO PARK Web - Master Co-op Chain System & Gameplay Logic Test Suite

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CONSTANTS = require("../shared/constants");
const LevelLoader = require("../shared/levelLoader");
const PhysicsWorld = require("../shared/physics");
const ChainSystem = require("../shared/chain");

console.log("=================================================================");
console.log("    PICO PARK WEB - CO-OP CHAIN SYSTEM & GAME LOGIC TEST SUITE   ");
console.log("=================================================================\n");

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`[PASS] Test ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] Test ${total}: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

const levelLoader = new LevelLoader();
function createTestWorld(stageName = "stage_jump01", chainConfig = {}) {
  const filePath = path.join(__dirname, `../shared/levels/${stageName}.json`);
  const rawData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const levelData = {
    ...rawData,
    chainEnabled: chainConfig.chainEnabled !== undefined ? chainConfig.chainEnabled : true,
    chainMaxDistance: chainConfig.chainMaxDistance || 120,
    chainMinDistance: chainConfig.chainMinDistance || 35,
    chainStrength: chainConfig.chainStrength !== undefined ? chainConfig.chainStrength : 0.8
  };
  const processed = levelLoader.loadLevelSync(levelData);
  return new PhysicsWorld(processed);
}

// -------------------------------------------------------------
// TEST 1: 2 players connected -> P1 <-> P2
// -------------------------------------------------------------
runTest("2-player chain connection - P1 <-> P2 single adjacent link", () => {
  const world = createTestWorld("stage_jump01", { chainEnabled: true });
  const p1 = world.addPlayer("p1", "Player 1", 1);
  const p2 = world.addPlayer("p2", "Player 2", 2);

  assert.strictEqual(world.chainSystem.links.length, 1, "Must have exactly 1 link for 2 players");
  const link = world.chainSystem.links[0];
  assert.strictEqual(link.p1, "p1");
  assert.strictEqual(link.p2, "p2");
  assert(link.dist > 0, "Distance must be positive");
  assert.strictEqual(link.tension, 0, "Initial spawn within slack has 0 tension");
});

// -------------------------------------------------------------
// TEST 2: 4 players connected -> P1 <-> P2 <-> P3 <-> P4
// -------------------------------------------------------------
runTest("4-player chain connection - strictly adjacent links only", () => {
  const world = createTestWorld("stage_jump01", { chainEnabled: true });
  world.addPlayer("p1", "P1", 1);
  world.addPlayer("p2", "P2", 2);
  world.addPlayer("p3", "P3", 3);
  world.addPlayer("p4", "P4", 4);

  assert.strictEqual(world.chainSystem.links.length, 3, "Must have exactly 3 links for 4 players");
  assert.strictEqual(world.chainSystem.links[0].p1, "p1");
  assert.strictEqual(world.chainSystem.links[0].p2, "p2");
  assert.strictEqual(world.chainSystem.links[1].p1, "p2");
  assert.strictEqual(world.chainSystem.links[1].p2, "p3");
  assert.strictEqual(world.chainSystem.links[2].p1, "p3");
  assert.strictEqual(world.chainSystem.links[2].p2, "p4");

  // Non-adjacent pairs must NOT be directly linked
  const hasDirectP1P3 = world.chainSystem.links.some((l) => (l.p1 === "p1" && l.p2 === "p3") || (l.p1 === "p3" && l.p2 === "p1"));
  const hasDirectP1P4 = world.chainSystem.links.some((l) => (l.p1 === "p1" && l.p2 === "p4") || (l.p1 === "p4" && l.p2 === "p1"));
  assert.strictEqual(hasDirectP1P3, false, "P1 and P3 must not be directly linked");
  assert.strictEqual(hasDirectP1P4, false, "P1 and P4 must not be directly linked");
});

// -------------------------------------------------------------
// TEST 3: Player disconnects -> P1-P2-P3-P4, P2 leaves -> P1-P3-P4
// -------------------------------------------------------------
runTest("Player disconnection - safely reconnects chain without broken references", () => {
  const world = createTestWorld("stage_jump01", { chainEnabled: true });
  world.addPlayer("p1", "P1", 1);
  world.addPlayer("p2", "P2", 2);
  world.addPlayer("p3", "P3", 3);
  world.addPlayer("p4", "P4", 4);

  // P2 disconnects
  world.removePlayer("p2");

  assert.strictEqual(world.chainSystem.links.length, 2, "Must have 2 links remaining after P2 disconnects");
  assert.strictEqual(world.chainSystem.links[0].p1, "p1");
  assert.strictEqual(world.chainSystem.links[0].p2, "p3");
  assert.strictEqual(world.chainSystem.links[1].p1, "p3");
  assert.strictEqual(world.chainSystem.links[1].p2, "p4");

  // Verify no stale references to p2 exist in links
  const staleP2 = world.chainSystem.links.some((l) => l.p1 === "p2" || l.p2 === "p2");
  assert.strictEqual(staleP2, false, "Zero stale references to p2");
});

// -------------------------------------------------------------
// TEST 4: Player jumps while another remains on ground
// -------------------------------------------------------------
runTest("Jumping with chain - Grounded player anchors partner and restrains upward velocity", () => {
  const world = createTestWorld("stage_jump01", { chainEnabled: true, chainMaxDistance: 120 });
  const p1 = world.addPlayer("p1", "P1", 1);
  const p2 = world.addPlayer("p2", "P2", 2);

  // Settle on ground
  for (let i = 0; i < 30; i++) world.step(1 / 60);
  assert(p1.onGround, "P1 must be on ground");
  assert(p2.onGround, "P2 must be on ground");

  // P2 jumps upward while P1 stays idle
  p2.inputs.jump = true;
  world.step(1 / 60);
  p2.inputs.jump = false;

  // Simulate multiple frames as P2 reaches chain maximum length
  for (let i = 0; i < 60; i++) {
    world.step(1 / 60);
  }

  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  assert(dist <= 125, `Distance (${dist.toFixed(1)}) must be constrained near maxDistance (120)`);
  assert(!isNaN(p1.x) && !isNaN(p2.x), "No NaN in player coordinates");
  assert(!isNaN(p1.vy) && !isNaN(p2.vy), "No NaN in player velocities");
});

// -------------------------------------------------------------
// TEST 5: Player tries to exceed chain distance
// -------------------------------------------------------------
runTest("Chain distance constraint - players cannot exceed max distance", () => {
  const maxDist = 100;
  const world = createTestWorld("stage_jump01", { chainEnabled: true, chainMaxDistance: maxDist });
  const p1 = world.addPlayer("p1", "P1", 1);
  const p2 = world.addPlayer("p2", "P2", 2);

  // Settle on ground
  for (let i = 0; i < 20; i++) world.step(1 / 60);

  // P1 moves left, P2 moves right for 2 seconds
  p1.inputs.left = true;
  p2.inputs.right = true;

  for (let i = 0; i < 120; i++) {
    world.step(1 / 60);
  }

  const finalDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  assert(finalDist <= maxDist + 2.0, `Separation (${finalDist.toFixed(1)}) must not exceed maxDist (${maxDist})`);
  assert(world.chainSystem.links[0].tension >= 0.95, "Tension must be near 1.0 when fully stretched");
});

// -------------------------------------------------------------
// TEST 6: Box pushed while chain is tight
// -------------------------------------------------------------
runTest("Box pushed under chain tension - Zero penetration, no launching", () => {
  const world = createTestWorld("stage_jump01", { chainEnabled: true, chainMaxDistance: 120 });
  const p1 = world.addPlayer("p1", "P1", 1);
  const p2 = world.addPlayer("p2", "P2", 2);

  // Settle world
  for (let i = 0; i < 20; i++) world.step(1 / 60);

  const box = world.boxes[0];
  assert(box, "Stage must contain at least one box");

  // Move P1 and P2 near the box, then push box rightward
  p1.x = box.x - box.w / 2 - p1.w / 2 - 2;
  p2.x = p1.x - 40;
  p1.inputs.right = true;
  p2.inputs.right = true;

  for (let i = 0; i < 60; i++) {
    world.step(1 / 60);
    // Strict anti-penetration check every single frame
    const overlapX = (p1.w + box.w) / 2 - Math.abs(p1.x - box.x);
    const overlapY = (p1.h + box.h) / 2 - Math.abs(p1.y - box.y);
    if (overlapY > 4) {
      assert(overlapX <= 0.05, `Player 1 penetrated box! OverlapX: ${overlapX}`);
    }
  }

  assert(!isNaN(box.x) && !isNaN(box.y), "Box coordinates must be valid numbers");
  assert(box.vx < 300, "Box must not launch with extreme velocity");
});

// -------------------------------------------------------------
// TEST 7: Player dies -> temporary chain update and respawn rebuild
// -------------------------------------------------------------
runTest("Player death & respawn - Chain rebuilds safely without stale constraints", () => {
  const world = createTestWorld("stage_jump01", { chainEnabled: true });
  const p1 = world.addPlayer("p1", "P1", 1);
  const p2 = world.addPlayer("p2", "P2", 2);
  const p3 = world.addPlayer("p3", "P3", 3);

  assert.strictEqual(world.chainSystem.links.length, 2, "Initially 2 links for 3 players");

  // P2 dies (falls off world)
  p2.y = world.worldHeight + 100;
  world.step(1 / 60);

  // Upon falling below world height, P2 is respawned safely at spawn and chain is rebuilt
  assert(p2.y < world.worldHeight, "P2 respawned inside world bounds");
  assert.strictEqual(world.chainSystem.links.length, 2, "Chain maintained for all 3 respawned players");
});

// -------------------------------------------------------------
// TEST 8: Retry (R) -> complete clean reset
// -------------------------------------------------------------
runTest("Retry (R) - Complete clean reset of players and chain with zero duplicate constraints", () => {
  const world = createTestWorld("stage_jump01", { chainEnabled: true });
  world.addPlayer("p1", "P1", 1);
  world.addPlayer("p2", "P2", 2);

  // Play and change states
  world.step(1 / 60);
  const initialLinkCount = world.chainSystem.links.length;

  // Trigger retry
  world.resetStage();

  assert.strictEqual(world.chainSystem.links.length, initialLinkCount, "Link count must not duplicate on retry");
  assert.strictEqual(world.chainSystem.links[0].p1, "p1");
  assert.strictEqual(world.chainSystem.links[0].p2, "p2");
  assert.strictEqual(world.stageState, CONSTANTS.STAGE_STATE.PLAYING);
});

// -------------------------------------------------------------
// TEST 9: Key collected & Door unlock logic
// -------------------------------------------------------------
runTest("Key collection & Goal door unlock in chain mode", () => {
  const world = createTestWorld("stage_jump01", { chainEnabled: true });
  const p1 = world.addPlayer("p1", "P1", 1);
  const p2 = world.addPlayer("p2", "P2", 2);

  // Settle
  for (let i = 0; i < 20; i++) world.step(1 / 60);

  // Move P1 and P2 together onto the key (within chain distance)
  if (world.key) {
    p1.x = world.key.x;
    p1.y = world.key.y;
    p2.x = world.key.x - 30;
    p2.y = world.key.y;
    world.step(1 / 60);

    assert.strictEqual(world.key.state, CONSTANTS.KEY_STATE.KEY_CARRIED, "Key must be carried by P1");
    assert.strictEqual(world.key.heldBy, "p1");

    // Move keyholder and partner to goal door
    if (world.goal) {
      p1.x = world.goal.x;
      p1.y = world.goal.y;
      p2.x = world.goal.x - 30;
      p2.y = world.goal.y;
      world.step(1 / 60);

      assert.strictEqual(world.goal.isOpen, true, "Goal door must unlock when key is delivered");
    }
  }
});

// -------------------------------------------------------------
// TEST 10: Button/Switch activation
// -------------------------------------------------------------
runTest("Switch activation reacts upon contact", () => {
  const world = createTestWorld("stage_four_keys", { chainEnabled: true });
  const p1 = world.addPlayer("p1", "P1", 1);

  assert(world.switches.length > 0, "Stage must have switches");
  const sw = world.switches[0];

  // Stand on switch
  p1.x = sw.x;
  p1.y = sw.y - p1.h / 2 - 2;
  p1.vy = 10;
  world.step(1 / 60);

  assert.strictEqual(sw.isPressed, true, "Switch must activate upon player contact");
});

// -------------------------------------------------------------
// TEST 11: All players reach goal -> Level completes
// -------------------------------------------------------------
runTest("All active players reach goal -> Triggers LEVEL COMPLETE", () => {
  const world = createTestWorld("stage_jump01", { chainEnabled: true });
  const p1 = world.addPlayer("p1", "P1", 1);
  const p2 = world.addPlayer("p2", "P2", 2);

  // Unlock goal
  if (world.key) {
    world.key.state = CONSTANTS.KEY_STATE.KEY_USED;
    world.key.heldBy = null;
  }
  if (world.goal) {
    world.goal.isOpen = true;
  }

  // Put BOTH players inside goal
  p1.x = world.goal.x;
  p1.y = world.goal.y;
  p2.x = world.goal.x;
  p2.y = world.goal.y;

  world.step(1 / 60);

  assert.strictEqual(world.levelCompleted, true, "Level must complete when all players are in goal");
  assert.strictEqual(world.stageState, CONSTANTS.STAGE_STATE.COMPLETE);
});

// -------------------------------------------------------------
// TEST 12: Only one player reaches goal -> Level does NOT complete
// -------------------------------------------------------------
runTest("Only one of two players reaches goal -> Level remains incomplete", () => {
  const world = createTestWorld("stage_jump01", { chainEnabled: true });
  const p1 = world.addPlayer("p1", "P1", 1);
  const p2 = world.addPlayer("p2", "P2", 2);

  if (world.key) {
    world.key.state = CONSTANTS.KEY_STATE.KEY_USED;
  }
  if (world.goal) {
    world.goal.isOpen = true;
  }

  // Put ONLY P1 inside goal, P2 stays far away
  p1.x = world.goal.x;
  p1.y = world.goal.y;
  p2.x = 200;
  p2.y = 600;

  world.step(1 / 60);

  assert.strictEqual(world.levelCompleted, false, "Level must NOT complete when only 1 player is in goal");
  assert.notStrictEqual(world.stageState, CONSTANTS.STAGE_STATE.COMPLETE);
});

// -------------------------------------------------------------
// TEST 13: Multiple players join/leave during gameplay
// -------------------------------------------------------------
runTest("Dynamic join/leave churn - Zero broken constraints or errors", () => {
  const world = createTestWorld("stage_jump01", { chainEnabled: true });
  world.addPlayer("p1", "P1", 1);
  world.addPlayer("p2", "P2", 2);
  world.step(1 / 60);

  // P3 joins
  world.addPlayer("p3", "P3", 3);
  world.step(1 / 60);
  assert.strictEqual(world.chainSystem.links.length, 2);

  // P1 leaves
  world.removePlayer("p1");
  world.step(1 / 60);
  assert.strictEqual(world.chainSystem.links.length, 1);
  assert.strictEqual(world.chainSystem.links[0].p1, "p2");
  assert.strictEqual(world.chainSystem.links[0].p2, "p3");

  // P4 joins
  world.addPlayer("p4", "P4", 4);
  world.step(1 / 60);
  assert.strictEqual(world.chainSystem.links.length, 2);
});

// -------------------------------------------------------------
// TEST 14: Stage TIME TRAMPOLINE with Chain Mode
// -------------------------------------------------------------
runTest("Stage TIME TRAMPOLINE full cooperative completion with chain enabled", () => {
  const world = createTestWorld("stage_time_trampoline", { chainEnabled: true, chainMaxDistance: 130 });
  const p1 = world.addPlayer("p1", "P1", 1);
  const p2 = world.addPlayer("p2", "P2", 2);

  assert.strictEqual(world.chainSystem.links.length, 1, "P1 <-> P2 chain active on TIME TRAMPOLINE");

  // 1. Settle
  for (let i = 0; i < 20; i++) world.step(1 / 60);

  // 2. Collect key together within chain distance
  p1.x = world.key.x;
  p1.y = world.key.y;
  p2.x = world.key.x - 20;
  p2.y = world.key.y;
  world.step(1 / 60);
  assert.strictEqual(world.key.state, CONSTANTS.KEY_STATE.KEY_CARRIED, "Key collected");

  // 3. Both players approach goal together within chain distance to unlock
  p1.x = world.goal.x;
  p1.y = world.goal.y;
  p2.x = world.goal.x - 30; // Within chain distance
  p2.y = world.goal.y;
  world.step(1 / 60);

  assert.strictEqual(world.goal.isOpen, true, "Goal door unlocked with key");

  // 4. Both players enter goal door
  p2.x = world.goal.x;
  world.step(1 / 60);

  assert.strictEqual(world.levelCompleted, true, "Stage TIME TRAMPOLINE completed successfully in chain mode!");
  assert.strictEqual(world.stageState, CONSTANTS.STAGE_STATE.COMPLETE);
});

console.log("\n=================================================================");
console.log(` RESULTS: ${passed} / ${total} CO-OP CHAIN TESTS PASSED`);
console.log("=================================================================\n");
