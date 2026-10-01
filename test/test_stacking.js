// Unit test for PICO PARK Stack Carrying Mechanics (Reference 1 adaptation)
const assert = require("assert");
const PhysicsWorld = require("../shared/physics");
const CONSTANTS = require("../shared/constants");

console.log("=== Testing Stack Carrying & Rider Momentum Transfer ===");

// Create a flat test level
const testLevel = {
  width: 30,
  height: 20,
  chipSize: 32,
  scale: 1,
  grid: Array.from({ length: 20 }, (_, y) =>
    Array.from({ length: 30 }, (_, x) => (y >= 15 ? 1 : 0))
  ),
  actors: {
    doors: [],
    keys: [],
    switches: [],
    bridges: [],
    boxes: []
  }
};

const world = new PhysicsWorld(testLevel);

// 1. Spawn Player 1 and settle on ground
const p1 = world.addPlayer("player1", "Carrier", 1);
p1.x = 200;
p1.y = 15 * 32 - p1.h / 2; // on ground (480 - 14 = 466)
p1.onGround = true;
p1.vy = 0;

// 2. Spawn Player 2 and place directly on Player 1's head
const p2 = world.addPlayer("player2", "Rider", 2);
p2.x = 200;
p2.y = p1.y - p1.h; // directly on head
p2.onGround = true;
p2.ridingOn = p1.id;
p2.vy = 0;

console.log("[Test 1] Initial Setup:");
console.log(`  Carrier P1: X=${p1.x}, Y=${p1.y}, onGround=${p1.onGround}`);
console.log(`  Rider P2: X=${p2.x}, Y=${p2.y}, onGround=${p2.onGround}, ridingOn=${p2.ridingOn}`);

// 3. Move Player 1 to the right with inputs
p1.inputs.right = true;

// Step physics for 20 ticks (1/60s each)
for (let i = 0; i < 20; i++) {
  world.step(1 / 60);
}

console.log("[Test 2] After 20 ticks of Carrier moving right:");
console.log(`  Carrier P1: X=${p1.x.toFixed(1)}, Y=${p1.y.toFixed(1)}, onGround=${p1.onGround}`);
console.log(`  Rider P2: X=${p2.x.toFixed(1)}, Y=${p2.y.toFixed(1)}, onGround=${p2.onGround}, ridingOn=${p2.ridingOn}`);

assert(p1.x > 200, "Carrier should have moved right");
assert(Math.abs(p2.x - p1.x) < 0.01, `Rider should match Carrier X position exactly! p1=${p1.x}, p2=${p2.x}`);
assert(p2.onGround, "Rider should remain on ground while being carried");
assert.strictEqual(p2.ridingOn, p1.id, "Rider should remain riding on carrier");
console.log("  -> SUCCESS: Rider moved synchronously with carrier!");

// 4. Test 3-Player Tower: Player 3 stacked on Player 2 stacked on Player 1
const p3 = world.addPlayer("player3", "TopRider", 3);
p3.x = p2.x;
p3.y = p2.y - p2.h;
p3.onGround = true;
p3.ridingOn = p2.id;
p3.vy = 0;

console.log("[Test 3] 3-Player Tower Stacking:");
for (let i = 0; i < 20; i++) {
  world.step(1 / 60);
}

console.log(`  Carrier P1: X=${p1.x.toFixed(1)}`);
console.log(`  Mid Rider P2: X=${p2.x.toFixed(1)}`);
console.log(`  Top Rider P3: X=${p3.x.toFixed(1)}`);

assert(Math.abs(p3.x - p1.x) < 0.01, `Top Rider p3 should match Carrier p1! p1=${p1.x}, p3=${p3.x}`);
assert(p3.onGround, "Top rider should remain on ground");
console.log("  -> SUCCESS: 3-Player stack momentum propagation verified!");

// 5. Test Rider Jump: Rider jumping off should disconnect ridingOn
p2.inputs.jump = true;
world.step(1 / 60);
console.log("[Test 4] Rider Jump Disconnect:");
console.log(`  Rider P2 vy=${p2.vy}, ridingOn=${p2.ridingOn}`);
assert(p2.vy < 0, "Rider should jump upwards");
assert.strictEqual(p2.ridingOn, null, "Rider should no longer be riding on carrier after jumping");
console.log("  -> SUCCESS: Jumping cleanly detaches rider!");

console.log("\n=======================================================");
console.log("  ALL STACK CARRYING TESTS PASSED SUCCESSFULLY!        ");
console.log("=======================================================\n");
