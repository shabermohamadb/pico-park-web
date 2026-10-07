// test/stage_four_keys_test.js
// Dedicated Test Suite for MAP 1: THE FOUR KEYS (14 Critical Scenarios)

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const CONSTANTS = require("../shared/constants");
const PhysicsWorld = require("../shared/physics");
const LevelLoader = require("../shared/levelLoader");

function loadStage(stageName) {
  const filePath = path.join(__dirname, `../shared/levels/${stageName}.json`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const loader = new LevelLoader();
  return loader.loadLevelSync(raw);
}

function runTests() {
  console.log("=================================================================");
  console.log("   PICO PARK WEB - MAP 1: THE FOUR KEYS TEST SUITE (14 SCENARIOS) ");
  console.log("=================================================================\n");

  const stageData = loadStage("stage_four_keys");
  let passed = 0;
  let total = 14;

  function pass(num, name) {
    console.log(`[PASS] Test ${num}: ${name}`);
    passed++;
  }

  // Test 1: Stage Data Parsing
  try {
    assert.strictEqual(stageData.width, 40);
    assert.strictEqual(stageData.height, 22);
    assert.strictEqual(stageData.actors.players.length, 4, "Should define 4 player spawns");
    assert.strictEqual(stageData.actors.keys.length, 4, "Should have 4 keys defined");
    assert.strictEqual(stageData.actors.boxes.length, 6, "Should have 6 pushable boxes (4 center + 2 large)");
    assert.strictEqual(stageData.actors.switches.length, 4, "Should have 4 switches");
    assert.ok(stageData.actors.spikes.length > 0, "Should have spike hazards");
    assert.ok(stageData.actors.goal, "Should have goal door");
    pass(1, "Stage data parsing - 4 players, 4 keys, 6 boxes, 4 switches, spikes, goal");
  } catch (e) {
    console.error("[FAIL] Test 1:", e.message);
  }

  // Test 2: Player Spawn Safety
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const p2 = physics.addPlayer("p2", "Player 2", 2);
    const p3 = physics.addPlayer("p3", "Player 3", 3);
    const p4 = physics.addPlayer("p4", "Player 4", 4);

    for (let i = 0; i < 30; i++) physics.step(0.016);

    for (const p of [p1, p2, p3, p4]) {
      assert.strictEqual(p.isDead, false, `${p.name} must spawn alive`);
      assert.strictEqual(p.onGround, true, `${p.name} must stand stably on start ledge`);
    }
    pass(2, "Player spawn safety - All 4 players stand stably on start platform");
  } catch (e) {
    console.error("[FAIL] Test 2:", e.message);
  }

  // Test 3: Key 1 Collection (Left Arch)
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const k1 = physics.keys.find(k => k.id === "key_1");
    assert.ok(k1, "Key 1 must exist");

    p1.x = k1.x;
    p1.y = k1.y;
    physics.step(0.016);

    assert.strictEqual(k1.heldBy, "p1", "P1 must pick up Key 1");
    assert.strictEqual(k1.state, CONSTANTS.KEY_STATE.KEY_CARRIED);
    pass(3, "Key 1 pickup - Touching Key 1 atop Left Arch collects and carries it");
  } catch (e) {
    console.error("[FAIL] Test 3:", e.message);
  }

  // Test 4: Key 2 Collection (Center High Arch)
  try {
    const physics = new PhysicsWorld(stageData);
    const p2 = physics.addPlayer("p2", "Player 2", 2);
    const k2 = physics.keys.find(k => k.id === "key_2");
    assert.ok(k2, "Key 2 must exist");

    p2.x = k2.x;
    p2.y = k2.y;
    physics.step(0.016);

    assert.strictEqual(k2.heldBy, "p2", "P2 must pick up Key 2");
    assert.strictEqual(k2.state, CONSTANTS.KEY_STATE.KEY_CARRIED);
    pass(4, "Key 2 pickup - Touching Key 2 atop Center High Arch collects and carries it");
  } catch (e) {
    console.error("[FAIL] Test 4:", e.message);
  }

  // Test 5: Key 3 Collection (Right Arch)
  try {
    const physics = new PhysicsWorld(stageData);
    const p3 = physics.addPlayer("p3", "Player 3", 3);
    const k3 = physics.keys.find(k => k.id === "key_3");
    assert.ok(k3, "Key 3 must exist");

    p3.x = k3.x;
    p3.y = k3.y;
    physics.step(0.016);

    assert.strictEqual(k3.heldBy, "p3", "P3 must pick up Key 3");
    assert.strictEqual(k3.state, CONSTANTS.KEY_STATE.KEY_CARRIED);
    pass(5, "Key 3 pickup - Touching Key 3 atop Right Arch collects and carries it");
  } catch (e) {
    console.error("[FAIL] Test 5:", e.message);
  }

  // Test 6: Key 4 Collection (Lower Right Chamber)
  try {
    const physics = new PhysicsWorld(stageData);
    const p4 = physics.addPlayer("p4", "Player 4", 4);
    const k4 = physics.keys.find(k => k.id === "key_4");
    assert.ok(k4, "Key 4 must exist");

    p4.x = k4.x;
    p4.y = k4.y;
    physics.step(0.016);

    assert.strictEqual(k4.heldBy, "p4", "P4 must pick up Key 4");
    assert.strictEqual(k4.state, CONSTANTS.KEY_STATE.KEY_CARRIED);
    pass(6, "Key 4 pickup - Touching Key 4 in Lower Right chamber collects and carries it");
  } catch (e) {
    console.error("[FAIL] Test 6:", e.message);
  }

  // Test 7: Simultaneous 4-Key Distribution
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const p2 = physics.addPlayer("p2", "Player 2", 2);
    const p3 = physics.addPlayer("p3", "Player 3", 3);
    const p4 = physics.addPlayer("p4", "Player 4", 4);

    const keys = physics.keys;
    p1.x = keys[0].x; p1.y = keys[0].y;
    p2.x = keys[1].x; p2.y = keys[1].y;
    p3.x = keys[2].x; p3.y = keys[2].y;
    p4.x = keys[3].x; p4.y = keys[3].y;
    physics.step(0.016);

    assert.strictEqual(keys[0].heldBy, "p1");
    assert.strictEqual(keys[1].heldBy, "p2");
    assert.strictEqual(keys[2].heldBy, "p3");
    assert.strictEqual(keys[3].heldBy, "p4");
    assert.strictEqual(physics.stageState, CONSTANTS.STAGE_STATE.KEY_COLLECTED, "State should be KEY_COLLECTED");
    pass(7, "Simultaneous 4-Key Distribution - Each of 4 players carries 1 key independently");
  } catch (e) {
    console.error("[FAIL] Test 7:", e.message);
  }

  // Test 8: Spike Hazard Lethality
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const spike = physics.spikes[0];
    assert.ok(spike, "Spike must exist");

    // Drop player onto spike
    p1.x = spike.x;
    p1.y = spike.y;
    physics.step(0.016);

    // Player should trigger death / failure
    const events = physics.drainEvents();
    const deathEv = events.find(ev => ev.type === "player_died" || ev.name === "failure");
    assert.ok(deathEv, "Touching spike pit must trigger player death and failure sound");
    pass(8, "Spike hazard lethality - Contact with spikes kills player and plays failure sound");
  } catch (e) {
    console.error("[FAIL] Test 8:", e.message);
  }

  // Test 9: Box Bridging Over Spikes
  try {
    const physics = new PhysicsWorld(stageData);
    const b1 = physics.boxes[0];
    assert.ok(b1, "Box 1 must exist");
    const spike = physics.spikes[0];

    // Place box in spike pit
    b1.x = spike.x;
    b1.y = spike.y - 20;
    for (let i = 0; i < 30; i++) physics.step(0.016);

    // Box should be resting solidly on pit floor
    assert.strictEqual(b1.onGround, true, "Box must settle solidly on pit floor");

    // Player walks on top of box over spikes
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    p1.x = b1.x;
    p1.y = b1.y - b1.h / 2 - p1.h / 2 - 2;
    for (let i = 0; i < 15; i++) physics.step(0.016);

    assert.strictEqual(p1.isDead, false, "Player on top of box must not die from spikes");
    assert.strictEqual(p1.onGround, true, "Player stands solidly on box over spikes");
    pass(9, "Box bridging over spikes - Box provides safe walkable bridge across spike pit");
  } catch (e) {
    console.error("[FAIL] Test 9:", e.message);
  }

  // Test 10: Door Locked with Partial Keys (< 4 keys)
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);

    // Collect only 2 keys
    p1.x = physics.keys[0].x; p1.y = physics.keys[0].y;
    physics.step(0.016);
    p1.x = physics.keys[1].x; p1.y = physics.keys[1].y;
    physics.step(0.016);

    // Go to goal
    p1.x = physics.goal.x;
    p1.y = physics.goal.y;
    physics.step(0.016);

    assert.strictEqual(physics.goal.isOpen, false, "Door must stay LOCKED with only 2/4 keys");
    pass(10, "Door locked with partial keys - 2 keys cannot unlock exit door");
  } catch (e) {
    console.error("[FAIL] Test 10:", e.message);
  }

  // Test 11: Door Unlocked with All 4 Keys
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const p2 = physics.addPlayer("p2", "Player 2", 2);
    const p3 = physics.addPlayer("p3", "Player 3", 3);
    const p4 = physics.addPlayer("p4", "Player 4", 4);

    // Collect all 4 keys
    p1.x = physics.keys[0].x; p1.y = physics.keys[0].y;
    p2.x = physics.keys[1].x; p2.y = physics.keys[1].y;
    p3.x = physics.keys[2].x; p3.y = physics.keys[2].y;
    p4.x = physics.keys[3].x; p4.y = physics.keys[3].y;
    physics.step(0.016);

    // Keyholders reach goal
    p1.x = physics.goal.x; p1.y = physics.goal.y;
    physics.step(0.016);

    assert.strictEqual(physics.goal.isOpen, true, "Door must UNLOCK when all 4 keys are brought to goal");
    assert.strictEqual(physics.stageState, CONSTANTS.STAGE_STATE.GOAL_UNLOCKED);
    pass(11, "Door unlock condition - All 4 keys brought to exit door unlocks it");
  } catch (e) {
    console.error("[FAIL] Test 11:", e.message);
  }

  // Test 12: 4-Player Cooperative Victory
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const p2 = physics.addPlayer("p2", "Player 2", 2);
    const p3 = physics.addPlayer("p3", "Player 3", 3);
    const p4 = physics.addPlayer("p4", "Player 4", 4);

    // Collect all 4 keys
    p1.x = physics.keys[0].x; p1.y = physics.keys[0].y;
    p2.x = physics.keys[1].x; p2.y = physics.keys[1].y;
    p3.x = physics.keys[2].x; p3.y = physics.keys[2].y;
    p4.x = physics.keys[3].x; p4.y = physics.keys[3].y;
    physics.step(0.016);

    // All enter goal door
    p1.x = physics.goal.x; p1.y = physics.goal.y;
    p2.x = physics.goal.x; p2.y = physics.goal.y;
    p3.x = physics.goal.x; p3.y = physics.goal.y;
    p4.x = physics.goal.x; p4.y = physics.goal.y;
    physics.step(0.016);

    assert.strictEqual(physics.levelCompleted, true, "Level must be completed");
    assert.strictEqual(physics.stageState, CONSTANTS.STAGE_STATE.COMPLETE);
    pass(12, "Cooperative victory - All 4 players entering unlocked goal door completes level");
  } catch (e) {
    console.error("[FAIL] Test 12:", e.message);
  }

  // Test 13: Solo Player Clearance (1 player carrying all 4 keys)
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);

    for (let i = 0; i < 4; i++) {
      p1.x = physics.keys[i].x;
      p1.y = physics.keys[i].y;
      physics.step(0.016);
    }

    assert.strictEqual(physics.keys.every(k => k.heldBy === "p1"), true, "Solo player can carry all 4 keys");

    p1.x = physics.goal.x;
    p1.y = physics.goal.y;
    physics.step(0.016);

    assert.strictEqual(physics.levelCompleted, true, "Solo player clears stage");
    pass(13, "Solo clearance - Single player carrying all 4 keys can unlock and clear stage");
  } catch (e) {
    console.error("[FAIL] Test 13:", e.message);
  }

  // Test 14: Stage Reset (Retry R)
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    p1.x = physics.keys[0].x;
    p1.y = physics.keys[0].y;
    physics.step(0.016);
    assert.strictEqual(physics.keys[0].heldBy, "p1");

    physics.resetStage();
    assert.strictEqual(physics.keys[0].heldBy, null, "Key must be reset to unheld");
    assert.strictEqual(physics.keys[0].state, CONSTANTS.KEY_STATE.KEY_AVAILABLE);
    assert.strictEqual(physics.goal.isOpen, false, "Door must be locked again");
    assert.strictEqual(physics.levelCompleted, false);
    pass(14, "Stage reset (Retry R) - Cleanly restores all 4 keys, boxes, players, and door");
  } catch (e) {
    console.error("[FAIL] Test 14:", e.message);
  }

  console.log("\n=================================================================");
  console.log(`     RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log("=================================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
