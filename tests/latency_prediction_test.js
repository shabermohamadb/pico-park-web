// PICO PARK Web - Latency & Client Prediction Test Suite
// Verifies 0ms input responsiveness, clock drift resilience, smooth error reconciliation,
// ping telemetry, and server tick performance tracking.

const assert = require("assert");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const CONSTANTS = require("../shared/constants");
const PhysicsWorld = require("../shared/physics");
const LevelLoader = require("../shared/levelLoader");
const { Room } = require("../server/roomManager");
const ClientPredictor = require("../client/js/predictor");
const NetworkClient = require("../client/js/network");

let passed = 0;
let total = 0;

function it(name, fn) {
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

async function asyncIt(name, fn) {
  total++;
  try {
    await fn();
    console.log(`[PASS] Test ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] Test ${total}: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log("=================================================================");
console.log("   PICO PARK WEB - LATENCY & CLIENT PREDICTION TEST SUITE        ");
console.log("=================================================================\n");

// Test 1: ClientPredictor 0ms instant local movement
it("ClientPredictor - Instant 0ms horizontal movement on input", () => {
  const predictor = new ClientPredictor();
  predictor.registerPlayer("p1", 1, 100, 400);

  const p = predictor.localPlayers.get("p1");
  assert.strictEqual(p.x, 100);
  assert.strictEqual(p.vx, 0);

  // Apply right movement
  const inputs = new Map([["p1", { left: false, right: true, jump: false }]]);
  predictor.update(null, [], inputs, 0.016);

  assert(p.vx > 0, `Expected vx > 0, got ${p.vx}`);
  assert(p.x > 100, `Expected x > 100, got ${p.x}`);
  assert.strictEqual(p.facing, 1);
  assert.strictEqual(p.animState, "run");

  const renderP = predictor.getRenderPlayer("p1");
  assert(renderP.x > 100, `Expected render position > 100, got ${renderP.x}`);
});

// Test 2: ClientPredictor 0ms instant jump response
it("ClientPredictor - Instant 0ms jump velocity and animState", () => {
  const predictor = new ClientPredictor();
  predictor.registerPlayer("p1", 1, 100, 400);

  const p = predictor.localPlayers.get("p1");
  assert.strictEqual(p.onGround, true);

  // Press jump
  const inputs = new Map([["p1", { left: false, right: false, jump: true }]]);
  predictor.update(null, [], inputs, 0.016);

  assert(p.vy < 0, `Expected negative vy for upward jump, got ${p.vy}`);
  assert.strictEqual(p.onGround, false);
  assert.strictEqual(p.animState, "jump");
});

// Test 3: ClientPredictor platform and tile collision
it("ClientPredictor - Prevents penetrating solid level geometry", () => {
  const filePath = path.join(__dirname, "../shared/levels/stage_jump01.json");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const loader = new LevelLoader();
  const stage = loader.loadLevelSync(raw);
  const predictor = new ClientPredictor();

  // Place player right near left wall (chipSize = 48)
  const pW = CONSTANTS.PLAYER_WIDTH;
  const initialX = pW / 2 + 1; // 22px
  predictor.registerPlayer("p1", 1, initialX, 400);

  const inputs = new Map([["p1", { left: true, right: false, jump: false }]]);
  for (let i = 0; i < 10; i++) {
    predictor.update(stage, [], inputs, 0.016);
  }

  const p = predictor.localPlayers.get("p1");
  // Boundary at 0, player half width is 21, so x cannot go below 21
  assert(p.x >= pW / 2 - 0.5, `Player penetrated left wall: x=${p.x}`);
  assert.strictEqual(p.vx, 0);
});

// Test 4: Box collision anti-penetration during client prediction
it("ClientPredictor - Solid box collision stops predicted player without penetration", () => {
  const predictor = new ClientPredictor();
  const box = { id: 1, x: 200, y: 400, w: 60, h: 60 };
  const pW = CONSTANTS.PLAYER_WIDTH;

  // Place player to the left of the box moving right
  predictor.registerPlayer("p1", 1, 150, 400);

  const inputs = new Map([["p1", { left: false, right: true, jump: false }]]);
  for (let i = 0; i < 20; i++) {
    predictor.localPlayers.get("p1").vy = 0;
    predictor.localPlayers.get("p1").y = 400;
    predictor.update(null, [box], inputs, 0.016);
  }

  const p = predictor.localPlayers.get("p1");
  const minSeparation = (pW + box.w) / 2;
  const actualSeparation = box.x - p.x;

  assert(actualSeparation >= minSeparation - 1, `Player penetrated box: sep=${actualSeparation}, min=${minSeparation}`);
});

// Test 5: Soft smooth reconciliation under latency (jitter / drift <= 35px)
it("ClientPredictor - Soft smooth reconciliation blends offsets without snapping", () => {
  const predictor = new ClientPredictor();
  predictor.registerPlayer("p1", 1, 100, 400);

  // Authoritative server arrives at X=106 (6px discrepancy)
  const authPlayers = [{ id: "p1", x: 106, y: 400, vx: 50, vy: 0, facing: 1, anim: "run", inGoal: false }];
  predictor.reconcile(authPlayers);

  const p = predictor.localPlayers.get("p1");
  // Soft blend sets offset, doesn't hard teleport local x
  assert.strictEqual(p.x, 100);
  assert.strictEqual(p.offsetX, 6);

  // Render position reflects smoothed offset
  let renderP = predictor.getRenderPlayer("p1");
  assert.strictEqual(renderP.x, 106);

  // Update ticks decay offset exponentially
  predictor.update(null, [], new Map(), 0.016);
  assert(Math.abs(p.offsetX) < 6, `Expected offsetX to decay, got ${p.offsetX}`);

  for (let i = 0; i < 25; i++) {
    predictor.update(null, [], new Map(), 0.016);
  }
  assert.strictEqual(p.offsetX, 0);
});

// Test 6: Hard snap reconciliation on major discrepancy (> 35px)
it("ClientPredictor - Hard snap reconciliation immediately synchronizes major discrepancies", () => {
  const predictor = new ClientPredictor();
  predictor.registerPlayer("p1", 1, 100, 400);

  // Severe desync (e.g. teleport, stage respawn): 60px away
  const authPlayers = [{ id: "p1", x: 160, y: 380, vx: 0, vy: 0, facing: -1, anim: "idle", inGoal: false }];
  predictor.reconcile(authPlayers);

  const p = predictor.localPlayers.get("p1");
  assert.strictEqual(p.x, 160);
  assert.strictEqual(p.y, 380);
  assert.strictEqual(p.offsetX, 0);
  assert.strictEqual(p.offsetY, 0);
});

// Test 7: Monotonic clock drift resilience in NetworkClient
it("NetworkClient - Smooth interpolation immune to server clock skew", () => {
  const net = new NetworkClient();

  // Simulate two snapshots arriving 33ms apart, but with server timestamps offset by +10 seconds
  const mockServerSkew = 10000;
  const t0 = 1000;
  const t1 = 1033;

  const snap0 = {
    t: Date.now() + mockServerSkew,
    players: [{ id: "p2", x: 100, y: 400, vx: 0, vy: 0 }],
    boxes: [],
    switches: [],
    bridges: [],
    events: []
  };
  net.addSnapshot(snap0);
  // Override clientReceiveTime for reproducible deterministic test
  snap0.clientReceiveTime = t0;

  const snap1 = {
    t: Date.now() + mockServerSkew + 33,
    players: [{ id: "p2", x: 133, y: 400, vx: 0, vy: 0 }],
    boxes: [],
    switches: [],
    bridges: [],
    events: []
  };
  net.addSnapshot(snap1);
  snap1.clientReceiveTime = t1;

  // Let interpolationDelay = 16ms, renderTime = t1 - 16 = 1017 (midway between snap0 and snap1)
  net.interpolationDelay = 16;
  const mockNow = t1;
  const origPerformance = global.performance;
  global.performance = { now: () => mockNow };

  const interpolated = net.getInterpolatedState();
  global.performance = origPerformance;

  assert(interpolated !== null);
  const p2 = interpolated.players.find((p) => p.id === "p2");
  assert(p2 !== undefined);
  // Midway between 100 and 133 is ~ 116.5
  assert(p2.x > 105 && p2.x < 130, `Expected smoothly interpolated X (~116.5), got ${p2.x}`);
});

// Test 8: Server tick duration measurement in Room.tick
it("Room - Accurately records sub-millisecond lastTickDuration", () => {
  const host = { id: "host1", name: "Host", slot: 1, isHost: true };
  const room = new Room("TEST01", host);
  room.state = CONSTANTS.ROOM_STATE.PLAYING;
  room.loadStage("stage_jump01");

  room.tick(1 / 60);

  assert(typeof room.lastTickDuration === "number", "Expected lastTickDuration to be a number");
  assert(room.lastTickDuration >= 0, `Expected positive tick duration, got ${room.lastTickDuration}`);
  assert(room.lastTickDuration < 100, `Tick took suspiciously long: ${room.lastTickDuration}ms`);

  const snap = room.physicsWorld.getSnapshot();
  assert(snap !== null);
  assert(snap.players.length >= 1);
});

// Test 9 & 10: WebSocket Ping/Pong and HTTP Compression & Caching
(async () => {
  await asyncIt("WebSocket Ping/Pong - Accurately measures round-trip latency and tick time", async () => {
    const ws = new WebSocket("ws://localhost:3001");
    await new Promise((resolve) => ws.on("open", resolve));

    const clientSendTime = Date.now();
    ws.send(JSON.stringify({ type: "ping", clientTime: clientSendTime }));

    const response = await new Promise((resolve) => {
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "pong") {
          resolve(msg);
        }
      });
    });

    assert.strictEqual(response.type, "pong");
    assert.strictEqual(response.clientTime, clientSendTime);
    assert(response.serverTime >= clientSendTime);
    ws.close();
  });

  await asyncIt("HTTP Server - Compression and cache headers enabled for production assets", async () => {
    const res = await new Promise((resolve, reject) => {
      http.get("http://localhost:3001/js/main.js", { headers: { "Accept-Encoding": "gzip" } }, (res) => {
        resolve(res);
      }).on("error", reject);
    });

    assert.strictEqual(res.statusCode, 200);
    assert(res.headers["etag"], "Expected ETag header for asset caching");
    assert(res.headers["cache-control"], "Expected Cache-Control header");
    assert(res.headers["vary"], "Expected Vary header from compression middleware");
  });

  console.log("\n=================================================================");
  console.log(`     RESULTS: ${passed} / ${total} LATENCY & PREDICTION TESTS PASSED`);
  console.log("=================================================================\n");
  process.exit(0);
})();
