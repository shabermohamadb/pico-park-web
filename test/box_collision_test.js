/**
 * Comprehensive Box Physics & Collision Test Suite
 * Covers all 12 critical collision edge cases:
 *  1. Push box right
 *  2. Push box left
 *  3. Push box against solid wall
 *  4. Jump onto box and stand on top
 *  5. Walk into box while falling (diagonal slide)
 *  6. Push box while jumping
 *  7. Two players pushing same box together
 *  8. Box into box (Chain pushing)
 *  9. Box-to-box blocked by wall
 * 10. Downstream player between box and wall
 * 11. Head bonk underneath overhead box
 * 12. Spawn clearance outside boxes
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const PhysicsWorld = require("../shared/physics");
const CONSTANTS = require("../shared/constants");
const LevelLoader = require("../shared/levelLoader");

function loadStage(stageName) {
  const filePath = path.join(__dirname, `../shared/levels/${stageName}.json`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const loader = new LevelLoader();
  return loader.loadLevelSync(raw);
}

let passedCount = 0;
let totalCount = 0;

function runTest(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`[PASS] Case ${totalCount}: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`[FAIL] Case ${totalCount}: ${name}`);
    console.error(err);
  }
}

console.log("=================================================================");
console.log("   PICO PARK WEB - BOX PHYSICS & COLLISION EDGE CASE TESTS       ");
console.log("=================================================================\n");

// Test 1: Push box right
runTest("Push box right - Player stays strictly outside box", () => {
  const stage = loadStage("stage_push00");
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);
  const box = physics.boxes[0];

  p1.x = box.x - box.w / 2 - p1.w / 2 - 2;
  p1.y = box.y;
  const initialBoxX = box.x;

  p1.inputs.right = true;
  for (let i = 0; i < 30; i++) {
    physics.step(0.016);
    // Overlap assertion on EVERY frame
    const overlapX = (p1.w + box.w) / 2 - Math.abs(p1.x - box.x);
    const overlapY = (p1.h + box.h) / 2 - Math.abs(p1.y - box.y);
    if (overlapY > 0) {
      assert.ok(overlapX <= 0.001, `Player must never penetrate box along X (overlapX=${overlapX})`);
    }
  }

  assert.ok(box.x > initialBoxX, "Box must advance right when pushed");
  assert.ok(p1.x <= box.x - (p1.w + box.w) / 2 + 0.01, "Player center must remain strictly to the left of box");
});

// Test 2: Push box left
runTest("Push box left - Player stays strictly outside box", () => {
  const stage = loadStage("stage_push00");
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);
  const box = physics.boxes[0];

  p1.x = box.x + box.w / 2 + p1.w / 2 + 2;
  p1.y = box.y;
  const initialBoxX = box.x;

  p1.inputs.left = true;
  for (let i = 0; i < 30; i++) {
    physics.step(0.016);
    const overlapX = (p1.w + box.w) / 2 - Math.abs(p1.x - box.x);
    const overlapY = (p1.h + box.h) / 2 - Math.abs(p1.y - box.y);
    if (overlapY > 0) {
      assert.ok(overlapX <= 0.001, `Player must never penetrate box along X (overlapX=${overlapX})`);
    }
  }

  assert.ok(box.x < initialBoxX, "Box must advance left when pushed");
  assert.ok(p1.x >= box.x + (p1.w + box.w) / 2 - 0.01, "Player center must remain strictly to the right of box");
});

// Test 3: Push box against solid wall
runTest("Push box against solid wall - Box stops, zero penetration", () => {
  const stage = loadStage("stage_push00");
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);
  const box = physics.boxes[0];

  // Move box right near the left edge wall (x = 32 boundary)
  box.x = 32 + box.w / 2;
  box.vx = 0;
  p1.x = box.x + box.w / 2 + p1.w / 2 + 5;
  p1.y = box.y;

  // Settle box onto floor
  for (let i = 0; i < 10; i++) physics.step(0.016);

  const blockedBoxX = box.x;
  p1.inputs.left = true;

  for (let i = 0; i < 40; i++) {
    physics.step(0.016);
    const overlapX = (p1.w + box.w) / 2 - Math.abs(p1.x - box.x);
    const overlapY = (p1.h + box.h) / 2 - Math.abs(p1.y - box.y);
    if (overlapY > 0) {
      assert.ok(overlapX <= 0.001, `No penetration when box is blocked (overlapX=${overlapX})`);
    }
  }

  // Box should not have moved into or through the wall
  assert.ok(Math.abs(box.x - blockedBoxX) < 1.0, "Box blocked against wall must not move through wall");
  assert.ok(p1.x >= box.x + (p1.w + box.w) / 2 - 0.01, "Player must stay outside box");
});

// Test 4: Jump onto box and stand on top
runTest("Jump onto box - Lands on top, can stand and walk across", () => {
  const stage = loadStage("stage_push00");
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);
  const box = physics.boxes[0];

  // Position player directly above box
  p1.x = box.x;
  p1.y = box.y - box.h / 2 - p1.h - 40;
  p1.vy = 200;

  let landed = false;
  for (let i = 0; i < 30; i++) {
    physics.step(0.016);
    if (p1.onGround && p1.ridingOn === box.id) {
      landed = true;
      break;
    }
  }

  assert.ok(landed, "Player must land on top of box");
  assert.strictEqual(p1.vy, 0, "Vertical velocity must be zero upon landing on box");
  const expectedY = box.y - box.h / 2 - p1.h / 2;
  assert.ok(Math.abs(p1.y - expectedY) < 1.0, `Player Y (${p1.y}) must be exactly on box top (${expectedY})`);

  // Walk slightly right across box top
  p1.inputs.right = true;
  for (let i = 0; i < 5; i++) {
    physics.step(0.016);
    assert.strictEqual(p1.onGround, true, "Player should remain on top of box while walking on it");
  }
});

// Test 5: Walk into box while falling (diagonal slide)
runTest("Walk into box while falling - Slides smoothly outside without penetration", () => {
  const stage = loadStage("stage_push00");
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);
  const box = physics.boxes[0];

  // Start player slightly to left and above the box
  p1.x = box.x - box.w / 2 - p1.w / 2 - 10;
  p1.y = box.y - box.h / 2 - 20;
  p1.vy = 100;
  p1.inputs.right = true; // Pressing right into box while falling

  for (let i = 0; i < 25; i++) {
    physics.step(0.016);
    const overlapX = (p1.w + box.w) / 2 - Math.abs(p1.x - box.x);
    const overlapY = (p1.h + box.h) / 2 - Math.abs(p1.y - box.y);
    if (overlapY > 0) {
      assert.ok(overlapX <= 0.001, `Diagonal fall must never penetrate box (overlapX=${overlapX}, overlapY=${overlapY})`);
    }
  }
});

// Test 6: Push box while jumping
runTest("Push box while jumping - Zero penetration in mid-air", () => {
  const stage = loadStage("stage_push00");
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);
  const box = physics.boxes[0];

  // Position player to left of box on floor
  p1.x = box.x - box.w / 2 - p1.w / 2 - 2;
  p1.y = box.y;

  // Jump and hold right
  p1.inputs.jump = true;
  p1.inputs.right = true;

  for (let i = 0; i < 30; i++) {
    physics.step(0.016);
    const overlapX = (p1.w + box.w) / 2 - Math.abs(p1.x - box.x);
    const overlapY = (p1.h + box.h) / 2 - Math.abs(p1.y - box.y);
    if (overlapY > 0) {
      assert.ok(overlapX <= 0.001, `Jumping push must not penetrate box (overlapX=${overlapX})`);
    }
  }
});

// Test 7: Two players pushing same box together
runTest("Two players pushing same box - Both players stay outside box", () => {
  const stage = loadStage("stage_push00");
  const physics = new PhysicsWorld(stage);
  const box = physics.boxes[0];

  const p1 = physics.addPlayer("p1", "Player 1", 1);
  const p2 = physics.addPlayer("p2", "Player 2", 2);

  // Player 1 contacts box, Player 2 is directly behind Player 1
  p1.x = box.x - box.w / 2 - p1.w / 2;
  p1.y = box.y;
  p2.x = p1.x - p1.w / 2 - p2.w / 2;
  p2.y = box.y;

  p1.inputs.right = true;
  p2.inputs.right = true;

  const initialBoxX = box.x;
  for (let i = 0; i < 30; i++) {
    physics.step(0.016);
    const overlap1 = (p1.w + box.w) / 2 - Math.abs(p1.x - box.x);
    const overlap2 = (p2.w + box.w) / 2 - Math.abs(p2.x - box.x);
    const overlapY1 = (p1.h + box.h) / 2 - Math.abs(p1.y - box.y);
    const overlapY2 = (p2.h + box.h) / 2 - Math.abs(p2.y - box.y);

    if (overlapY1 > 0) assert.ok(overlap1 <= 0.001, "P1 must not penetrate box");
    if (overlapY2 > 0) assert.ok(overlap2 <= 0.001, "P2 must not penetrate box");
  }

  assert.ok(box.x > initialBoxX, "Box must move right with 2 players pushing");
});

// Test 8: Box into box (Chain pushing)
runTest("Box into box - Box 1 chain pushes Box 2 without overlap", () => {
  const stage = loadStage("stage_push00");
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);

  // Add a second box 30px to the right of box 1
  const b1 = physics.boxes[0];
  const b2 = {
    id: "box_1",
    type: "PushBox",
    x: b1.x + b1.w + 30,
    y: b1.y,
    w: b1.w,
    h: b1.h,
    weight: 20,
    color: "#f59e0b",
    vx: 0,
    vy: 0,
    onGround: true
  };
  physics.boxes.push(b2);

  p1.x = b1.x - b1.w / 2 - p1.w / 2 - 2;
  p1.y = b1.y;
  p1.inputs.right = true;

  const initialB2X = b2.x;

  for (let i = 0; i < 50; i++) {
    physics.step(0.016);

    // Box 1 vs Box 2 overlap check
    const boxOverlapX = (b1.w + b2.w) / 2 - Math.abs(b1.x - b2.x);
    const boxOverlapY = (b1.h + b2.h) / 2 - Math.abs(b1.y - b2.y);
    if (boxOverlapY > 0) {
      assert.ok(boxOverlapX <= 0.001, `Box 1 must never penetrate Box 2 (boxOverlapX=${boxOverlapX})`);
    }

    // Player vs Box 1 overlap check
    const pOverlapX = (p1.w + b1.w) / 2 - Math.abs(p1.x - b1.x);
    assert.ok(pOverlapX <= 0.001, `Player must never penetrate Box 1 (pOverlapX=${pOverlapX})`);
  }

  assert.ok(b2.x > initialB2X, "Box 2 should have been chain-pushed forward by Box 1");
});

// Test 9: Box-to-box blocked by wall
runTest("Box-to-box blocked by wall - Chain halts cleanly, zero penetration", () => {
  const stage = loadStage("stage_push00");
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);

  const b1 = physics.boxes[0];
  // Place b2 against solid wall on left side
  const b2 = {
    id: "box_1",
    type: "PushBox",
    x: 32 + b1.w / 2,
    y: b1.y,
    w: b1.w,
    h: b1.h,
    weight: 20,
    color: "#f59e0b",
    vx: 0,
    vy: 0,
    onGround: true
  };
  physics.boxes.push(b2);

  // Position b1 adjacent to b2
  b1.x = b2.x + (b1.w + b2.w) / 2;
  p1.x = b1.x + (p1.w + b1.w) / 2 + 5;
  p1.y = b1.y;

  // Settle on ground
  for (let i = 0; i < 15; i++) physics.step(0.016);

  p1.inputs.left = true;

  for (let i = 0; i < 40; i++) {
    physics.step(0.016);
    const bOverlap = (b1.w + b2.w) / 2 - Math.abs(b1.x - b2.x);
    const pOverlap = (p1.w + b1.w) / 2 - Math.abs(p1.x - b1.x);
    assert.ok(bOverlap <= 0.001, `Boxes must not penetrate each other when blocked (bOverlap=${bOverlap})`);
    assert.ok(pOverlap <= 0.001, `Player must not penetrate Box 1 when blocked (pOverlap=${pOverlap})`);
  }
});

// Test 10: Downstream player between box and wall
runTest("Downstream player between box and wall - Box halts, player not crushed", () => {
  const stage = loadStage("stage_push00");
  const physics = new PhysicsWorld(stage);
  const pPusher = physics.addPlayer("pusher", "Pusher", 1);
  const pBlocked = physics.addPlayer("blocked", "Blocked", 2);
  const box = physics.boxes[0];

  // Put pBlocked against left wall
  pBlocked.x = 32 + pBlocked.w / 2;
  pBlocked.y = box.y;

  // Put box right next to pBlocked
  box.x = pBlocked.x + pBlocked.w / 2 + box.w / 2;
  box.vx = 0;

  // Put pusher to right of box, pushing left towards pBlocked
  pPusher.x = box.x + box.w / 2 + pPusher.w / 2 + 5;
  pPusher.y = box.y;
  pPusher.inputs.left = true;

  for (let i = 0; i < 40; i++) {
    physics.step(0.016);
    const overlapBoxPlayer = (box.w + pBlocked.w) / 2 - Math.abs(box.x - pBlocked.x);
    assert.ok(overlapBoxPlayer <= 0.001, `Box must not penetrate downstream blocked player (overlap=${overlapBoxPlayer})`);
    assert.ok(pBlocked.x >= 32 + pBlocked.w / 2 - 0.01, "Blocked player must not be pushed into wall");
  }
});

// Test 11: Head bonk underneath overhead box
runTest("Head bonk underneath overhead box - Upward velocity cancels, head sound emitted", () => {
  const stage = loadStage("stage_push00");
  const physics = new PhysicsWorld(stage);
  const p1 = physics.addPlayer("p1", "Player 1", 1);

  // Position a static/floating box above player
  const box = {
    id: "box_overhead",
    type: "PushBox",
    x: 400,
    y: 200,
    w: 64,
    h: 32,
    weight: 9999,
    color: "#f59e0b",
    vx: 0,
    vy: 0,
    onGround: true
  };
  physics.boxes.push(box);

  // Position player directly underneath box, moving upwards fast
  p1.x = 400;
  p1.y = box.y + box.h / 2 + p1.h / 2 + 10;
  p1.vy = -400; // moving up

  physics.drainEvents();

  let headBonked = false;
  for (let i = 0; i < 20; i++) {
    physics.step(0.016);
    if (p1.vy === 0 && p1.y >= box.y + box.h / 2 + p1.h / 2 - 0.5) {
      headBonked = true;
      break;
    }
  }

  assert.ok(headBonked, "Player must bonk head on bottom of box and cancel upward velocity");
  assert.ok(p1.y >= box.y + box.h / 2 + p1.h / 2 - 0.01, "Player head must not penetrate inside box bottom");
  const headSounds = physics.drainEvents().filter((e) => e.name === "head");
  assert.ok(headSounds.length > 0, "Head bonk sound event must be emitted");
});

// Test 12: Spawn clearance outside boxes
runTest("Spawn clearance - Player never spawns embedded inside a box", () => {
  const stage = loadStage("stage_push00");
  const physics = new PhysicsWorld(stage);

  // Move box right on top of player spawn point
  const box = physics.boxes[0];
  box.x = 250.0;
  box.y = 400.0;

  const player = physics.addPlayer("p_spawn", "Spawned", 1);

  const overlapX = (player.w + box.w) / 2 - Math.abs(player.x - box.x);
  const overlapY = (player.h + box.h) / 2 - Math.abs(player.y - box.y);

  if (overlapY > 0) {
    assert.ok(overlapX <= 0.001, `Player must not overlap box at spawn (overlapX=${overlapX}, overlapY=${overlapY})`);
  }
});

console.log("\n=================================================================");
console.log(` RESULTS: ${passedCount} / ${totalCount} EDGE CASE TESTS PASSED`);
console.log("=================================================================");

if (passedCount < totalCount) {
  process.exit(1);
}
