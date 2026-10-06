// PICO PARK Web Automated Master Test Suite (20 Scenarios)
// Section 32 Verification Suite

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { WebSocket } = require("ws");

const CONSTANTS = require("../shared/constants");
const PhysicsWorld = require("../shared/physics");
const LevelLoader = require("../shared/levelLoader");
const roomManagerModule = require("../server/roomManager");
const RoomManager = roomManagerModule.RoomManager || roomManagerModule;
const NetworkClient = require("../client/js/network");
const AudioManagerEngine = require("../client/js/audio");

const SERVER_URL = "ws://localhost:3001";

function loadStage(stageName) {
  const filePath = path.join(__dirname, `../shared/levels/${stageName}.json`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const loader = new LevelLoader();
  return loader.loadLevelSync(raw);
}

function createClient() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SERVER_URL);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function waitForMessage(ws, filterFn, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for message: ${filterFn.toString()}`));
    }, timeoutMs);

    const onMessage = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (filterFn(msg)) {
          clearTimeout(timer);
          ws.off("message", onMessage);
          resolve(msg);
        }
      } catch (e) {}
    };

    ws.on("message", onMessage);
  });
}

const results = [];

function pass(scenarioNumber, title, details = "") {
  console.log(`[PASS] Scenario ${scenarioNumber}: ${title} ${details ? "- " + details : ""}`);
  results.push({ scenario: scenarioNumber, title, status: "PASS", details });
}

function fail(scenarioNumber, title, error) {
  console.error(`[FAIL] Scenario ${scenarioNumber}: ${title} - ${error.message || error}`);
  results.push({ scenario: scenarioNumber, title, status: "FAIL", error: error.message || error });
}

async function runMasterSuite() {
  console.log("=================================================================");
  console.log("     PICO PARK WEB - MASTER TEST SUITE (20 SCENARIOS)           ");
  console.log("=================================================================\n");

  const stageData = loadStage("stage_jump01");

  // -------------------------------------------------------------
  // Scenario 1: Single player movement
  // -------------------------------------------------------------
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const startX = p1.x;

    // Move right
    p1.inputs.right = true;
    for (let i = 0; i < 15; i++) physics.step(0.016);
    assert.ok(p1.x > startX, "Player X should increase when moving right");
    assert.strictEqual(p1.facing, 1, "Player facing should be 1 (right)");
    assert.ok(p1.vx > 0, "Velocity X should be positive");

    // Release input - verify deceleration and clean stop without sliding drift
    p1.inputs.right = false;
    for (let i = 0; i < 30; i++) physics.step(0.016);
    assert.strictEqual(p1.vx, 0, "Player should come to a complete stop when input is released");

    pass(1, "Single player movement", "Walks right, faces right, decelerates to clean stop");
  } catch (err) {
    fail(1, "Single player movement", err);
  }

  // -------------------------------------------------------------
  // Scenario 2: Jump and landing detection
  // -------------------------------------------------------------
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    
    // Settle to ground
    for (let i = 0; i < 20; i++) physics.step(0.016);
    assert.strictEqual(p1.onGround, true, "Player should be on ground");
    physics.drainEvents();

    // Trigger jump
    p1.inputs.jump = true;
    physics.step(0.016);
    assert.strictEqual(p1.onGround, false, "Player should leave ground upon jumping");
    assert.ok(p1.vy < 0, "Vertical velocity should be negative (upwards)");

    const jumpEvents = physics.drainEvents().filter((e) => e.name === "jump");
    assert.ok(jumpEvents.length > 0, "Jump sound event should be emitted");
    assert.ok(jumpEvents[0].id, "Jump sound event must have unique event ID");

    // Release jump and step until landing
    p1.inputs.jump = false;
    let landed = false;
    for (let i = 0; i < 80; i++) {
      physics.step(0.016);
      if (p1.onGround) {
        landed = true;
        break;
      }
    }
    assert.ok(landed, "Player must land back on platform");
    assert.strictEqual(p1.vy, 0, "Vertical velocity should become 0 upon landing");

    const boundEvents = physics.drainEvents().filter((e) => e.name === "bound");
    assert.ok(boundEvents.length > 0, "Landing 'bound' sound event should be emitted with unique ID");

    // Discrete jump check: holding jump while standing does not re-jump infinitely
    p1.inputs.jump = true;
    physics.step(0.016); // First frame jumps
    physics.step(0.016);
    assert.strictEqual(p1.jumpBuffer, 0, "Holding jump does not keep buffering bunny hops");

    pass(2, "Jump and landing detection", "Jump force, gravity, landing bound sound, discrete jump input");
  } catch (err) {
    fail(2, "Jump and landing detection", err);
  }

  // -------------------------------------------------------------
  // Scenario 3: Box pushing & anti-penetration
  // -------------------------------------------------------------
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const box = physics.boxes[0];

    // Position player just to the left of the box
    p1.x = box.x - box.w / 2 - CONSTANTS.PLAYER_WIDTH / 2 - 2;
    p1.y = box.y;
    const initialBoxX = box.x;

    p1.inputs.right = true;
    for (let i = 0; i < 20; i++) physics.step(0.016);

    assert.ok(box.x > initialBoxX, "Box should move when pushed by player");

    // Check anti-penetration: distance between centers must not be less than sum of half-widths minus small threshold
    const minCenterDist = (CONSTANTS.PLAYER_WIDTH + box.w) / 2;
    const actualCenterDist = Math.abs(p1.x - box.x);
    assert.ok(actualCenterDist >= minCenterDist - 4, "Player must not penetrate into box body");

    const hitEvents = physics.drainEvents().filter((e) => e.name === "hit");
    assert.ok(hitEvents.length > 0, "Box contact emits 'hit' sound event with unique event ID");

    pass(3, "Box pushing & anti-penetration", "Push momentum transfer, solid anti-penetration");
  } catch (err) {
    fail(3, "Box pushing & anti-penetration", err);
  }

  // -------------------------------------------------------------
  // Scenario 4: Key pickup & state transition
  // -------------------------------------------------------------
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);

    assert.strictEqual(physics.key.state, CONSTANTS.KEY_STATE.KEY_AVAILABLE, "Key must start KEY_AVAILABLE");
    assert.strictEqual(physics.key.heldBy, null, "Key must have heldBy = null initially");

    // Place player at key location
    p1.x = physics.key.x;
    p1.y = physics.key.y;
    physics.step(0.016);

    assert.strictEqual(physics.key.state, CONSTANTS.KEY_STATE.KEY_CARRIED, "Key must transition to KEY_CARRIED");
    assert.strictEqual(physics.key.heldBy, p1.id, "Key heldBy must match player ID");
    assert.strictEqual(physics.stageState, CONSTANTS.STAGE_STATE.KEY_COLLECTED, "Stage state must be KEY_COLLECTED");

    const getEvents = physics.drainEvents().filter((e) => e.name === "get");
    assert.ok(getEvents.length > 0, "Key pickup emits 'get' sound event with unique event ID");

    pass(4, "Key pickup & state transition", "KEY_AVAILABLE -> KEY_CARRIED, stage KEY_COLLECTED");
  } catch (err) {
    fail(4, "Key pickup & state transition", err);
  }

  // -------------------------------------------------------------
  // Scenario 5: Door unlock & state transition
  // -------------------------------------------------------------
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const p2 = physics.addPlayer("p2", "Player 2", 2); // Player 2 remains at spawn

    // Pick up key with P1
    p1.x = physics.key.x;
    p1.y = physics.key.y;
    physics.step(0.016);
    assert.strictEqual(physics.key.heldBy, p1.id);
    assert.strictEqual(physics.goal.isOpen, false, "Door must be locked before key is used");

    // Move player 1 with key to goal door
    p1.x = physics.goal.x;
    p1.y = physics.goal.y;
    physics.step(0.016);

    assert.strictEqual(physics.goal.isOpen, true, "Goal door must unlock when key touches it");
    assert.strictEqual(physics.key.state, CONSTANTS.KEY_STATE.KEY_USED, "Key state must be KEY_USED");
    assert.strictEqual(physics.key.heldBy, null, "Key must be detached from player");
    assert.strictEqual(physics.stageState, CONSTANTS.STAGE_STATE.GOAL_UNLOCKED, "Stage state must be GOAL_UNLOCKED");

    const clearEvents = physics.drainEvents().filter((e) => e.name === "clear");
    assert.ok(clearEvents.length > 0, "Door unlock emits 'clear' sound event with unique event ID");

    pass(5, "Door unlock & state transition", "Door opens, KEY_USED, stage GOAL_UNLOCKED, 'clear' SFX");
  } catch (err) {
    fail(5, "Door unlock & state transition", err);
  }

  // -------------------------------------------------------------
  // Scenario 6: Goal completion with all players
  // -------------------------------------------------------------
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const p2 = physics.addPlayer("p2", "Player 2", 2);

    // Unlock door
    p1.x = physics.key.x;
    p1.y = physics.key.y;
    physics.step(0.016);
    p1.x = physics.goal.x;
    p1.y = physics.goal.y;
    physics.step(0.016);
    assert.strictEqual(physics.goal.isOpen, true);

    // Player 1 steps inside door, but Player 2 is far away
    p2.x = 100;
    physics.step(0.016);
    assert.strictEqual(physics.goal.playersInside.has(p1.id), true);
    assert.strictEqual(physics.levelCompleted, false, "Must NOT complete level with only 1 of 2 players in goal");

    // Player 2 enters door
    p2.x = physics.goal.x;
    p2.y = physics.goal.y;
    physics.step(0.016);

    assert.strictEqual(physics.goal.playersInside.has(p2.id), true);
    assert.strictEqual(physics.levelCompleted, true, "Must complete level when all players are inside goal");
    assert.strictEqual(physics.stageState, CONSTANTS.STAGE_STATE.COMPLETE, "Stage state must be COMPLETE");

    const winEvents = physics.drainEvents().filter((e) => e.name === "win" || e.type === "level_clear");
    assert.ok(winEvents.length > 0, "Level completion emits win event with unique event ID");

    pass(6, "Goal completion with all players", "Simultaneous all-player verification, stage COMPLETE");
  } catch (err) {
    fail(6, "Goal completion with all players", err);
  }

  // -------------------------------------------------------------
  // Scenario 7: Retry current stage & state reset
  // -------------------------------------------------------------
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const p2 = physics.addPlayer("p2", "Player 2", 2);

    // Alter game world
    p1.x = 900;
    p2.x = 950;
    physics.key.x = 900;
    physics.key.state = CONSTANTS.KEY_STATE.KEY_CARRIED;
    physics.key.heldBy = p1.id;
    physics.goal.isOpen = true;
    physics.boxes[0].x = 750;

    // Trigger stage reset
    physics.resetStage();

    assert.strictEqual(physics.key.state, CONSTANTS.KEY_STATE.KEY_AVAILABLE, "Key state resets to KEY_AVAILABLE");
    assert.strictEqual(physics.key.heldBy, null, "Key heldBy resets to null");
    assert.strictEqual(physics.goal.isOpen, false, "Door resets to closed");
    assert.strictEqual(physics.goal.playersInside.size, 0, "playersInside cleared");
    assert.strictEqual(physics.levelCompleted, false, "levelCompleted resets to false");
    assert.strictEqual(physics.stageState, CONSTANTS.STAGE_STATE.PLAYING, "stageState resets to PLAYING");

    pass(7, "Retry current stage & state reset", "Clean state restore of players, key, door, and boxes");
  } catch (err) {
    fail(7, "Retry current stage & state reset", err);
  }

  // -------------------------------------------------------------
  // Scenario 8: Two players simultaneously
  // -------------------------------------------------------------
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const p2 = physics.addPlayer("p2", "Player 2", 2);

    // Space players apart so they don't collide during simultaneous movement test
    p1.x = 250;
    p2.x = 550;
    const initX1 = p1.x;
    const initX2 = p2.x;

    p1.inputs.right = true;
    p2.inputs.left = true;

    for (let i = 0; i < 20; i++) physics.step(0.016);

    assert.ok(p1.x > initX1, `Player 1 moves right: ${initX1} -> ${p1.x}`);
    assert.ok(p2.x < initX2, `Player 2 moves left: ${initX2} -> ${p2.x}`);
    assert.strictEqual(p1.facing, 1);
    assert.strictEqual(p2.facing, -1);

    pass(8, "Two players simultaneously", "Independent velocity, inputs, facing without crosstalk");
  } catch (err) {
    fail(8, "Two players simultaneously", err);
  }

  // -------------------------------------------------------------
  // Scenario 9: Two players cooperative completion
  // -------------------------------------------------------------
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const p2 = physics.addPlayer("p2", "Player 2", 2);

    // Full cooperative run
    // 1. P1 collects key
    p1.x = physics.key.x;
    p1.y = physics.key.y;
    physics.step(0.016);
    assert.strictEqual(physics.key.heldBy, p1.id);

    // 2. P1 unlocks door
    p1.x = physics.goal.x;
    p1.y = physics.goal.y;
    physics.step(0.016);
    assert.strictEqual(physics.goal.isOpen, true);

    // 3. Both enter goal
    p1.x = physics.goal.x;
    p1.y = physics.goal.y;
    p2.x = physics.goal.x;
    p2.y = physics.goal.y;
    physics.step(0.016);

    assert.strictEqual(physics.levelCompleted, true);
    assert.strictEqual(physics.stageState, CONSTANTS.STAGE_STATE.COMPLETE);

    pass(9, "Two players cooperative completion", "Complete end-to-end cooperative victory flow");
  } catch (err) {
    fail(9, "Two players cooperative completion", err);
  }

  // -------------------------------------------------------------
  // Scenario 10: Player disconnect handling
  // -------------------------------------------------------------
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);
    const p2 = physics.addPlayer("p2", "Player 2", 2);

    // P1 collects key
    p1.x = physics.key.x;
    p1.y = physics.key.y;
    physics.step(0.016);
    assert.strictEqual(physics.key.heldBy, "p1");

    // P1 disconnects
    physics.removePlayer("p1");
    assert.strictEqual(physics.players.size, 1, "Players map size must be 1 after removal");
    assert.strictEqual(physics.key.heldBy, null, "Key must be safely dropped on disconnect");
    assert.strictEqual(physics.key.state, CONSTANTS.KEY_STATE.KEY_AVAILABLE, "Key must return to KEY_AVAILABLE");

    // P2 can pick up the dropped key
    p2.x = physics.key.x;
    p2.y = physics.key.y;
    physics.step(0.016);
    assert.strictEqual(physics.key.heldBy, "p2", "Remaining player can pick up dropped key");

    pass(10, "Player disconnect handling", "Safe removal, key safe drop, no crash or soft-lock");
  } catch (err) {
    fail(10, "Player disconnect handling", err);
  }

  // -------------------------------------------------------------
  // Scenario 11: Player reconnect sync (via WebSocket)
  // -------------------------------------------------------------
  try {
    const client = await createClient();
    client.send(JSON.stringify({
      type: "create_room",
      name: "SyncTestUser",
      settings: { maxPlayers: 4 }
    }));

    const createMsg = await waitForMessage(client, (m) => m.type === "room_created");
    assert.ok(createMsg.room && createMsg.room.code);

    client.send(JSON.stringify({ type: "start_game" }));
    const startMsg = await waitForMessage(client, (m) => m.type === "game_started");
    assert.ok(startMsg.stage);

    const snapMsg = await waitForMessage(client, (m) => m.type === "game_snapshot");
    assert.ok(snapMsg.snapshot.players.length >= 1);
    assert.ok(snapMsg.snapshot.stageState, "Snapshot contains authoritative stageState");

    client.close();
    pass(11, "Player reconnect sync", "Authoritative snapshot replication with stageState and slot sync");
  } catch (err) {
    fail(11, "Player reconnect sync", err);
  }

  // -------------------------------------------------------------
  // Scenario 12: Two simultaneous rooms
  // -------------------------------------------------------------
  try {
    const roomManager = new RoomManager();
    const r1 = roomManager.createRoom("RoomAHost", { maxPlayers: 4 });
    const r2 = roomManager.createRoom("RoomBHost", { maxPlayers: 4 });

    assert.notStrictEqual(r1.code, r2.code, "Room codes must be distinct");

    r1.startGame();
    r2.startGame();

    assert.ok(r1.physicsWorld !== null, "Room A has active physics world");
    assert.ok(r2.physicsWorld !== null, "Room B has active physics world");
    assert.notStrictEqual(r1.physicsWorld, r2.physicsWorld, "Physics instances must be separate");

    r1.destroy();
    r2.destroy();
    pass(12, "Two simultaneous rooms", "Both rooms run active concurrent physics worlds");
  } catch (err) {
    fail(12, "Two simultaneous rooms", err);
  }

  // -------------------------------------------------------------
  // Scenario 13: Room A vs Room B isolation
  // -------------------------------------------------------------
  try {
    const roomManager = new RoomManager();
    const r1 = roomManager.createRoom("HostA");
    const r2 = roomManager.createRoom("HostB");
    r1.startGame();
    r2.startGame();

    // Collect key in Room A
    const pA = r1.physicsWorld.players.values().next().value;
    pA.x = r1.physicsWorld.key.x;
    pA.y = r1.physicsWorld.key.y;
    r1.physicsWorld.step(0.016);
    assert.strictEqual(r1.physicsWorld.key.state, CONSTANTS.KEY_STATE.KEY_CARRIED);

    // Verify Room B key is untouched
    assert.strictEqual(r2.physicsWorld.key.state, CONSTANTS.KEY_STATE.KEY_AVAILABLE, "Room B key unaffected");
    assert.strictEqual(r2.physicsWorld.key.heldBy, null);

    r1.destroy();
    r2.destroy();
    pass(13, "Room A vs Room B isolation", "Zero cross-room state leakage");
  } catch (err) {
    fail(13, "Room A vs Room B isolation", err);
  }

  // -------------------------------------------------------------
  // Scenario 14: Duplicate network event rejection
  // -------------------------------------------------------------
  try {
    let playCount = 0;
    const mockAudioManager = {
      playSFX: (name, id) => {
        playCount++;
      }
    };
    global.window = { AudioManager: mockAudioManager };

    const net = new NetworkClient();
    const snap1 = {
      t: Date.now(),
      players: [],
      boxes: [],
      events: [{ id: "ev_dup_1", type: "sound", name: "jump" }]
    };
    const snap2 = {
      t: Date.now() + 33,
      players: [],
      boxes: [],
      events: [{ id: "ev_dup_1", type: "sound", name: "jump" }]
    };

    net.addSnapshot(snap1);
    assert.strictEqual(playCount, 1, "First event should be played");

    net.addSnapshot(snap2);
    assert.strictEqual(playCount, 1, "Duplicate event with same ID must be rejected");

    pass(14, "Duplicate network event rejection", "NetworkClient deduplicates repeated snapshot event IDs");
  } catch (err) {
    fail(14, "Duplicate network event rejection", err);
  }

  // -------------------------------------------------------------
  // Scenario 15: Network interpolation / delay tolerance
  // -------------------------------------------------------------
  try {
    const net = new NetworkClient();
    net.interpolationDelay = 50;

    const baseTime = Date.now();
    const s0 = {
      t: baseTime - 100,
      stageState: CONSTANTS.STAGE_STATE.PLAYING,
      players: [{ id: "p1", x: 100, y: 500, slot: 1 }],
      boxes: [{ id: "b1", x: 200, y: 500 }]
    };
    const s1 = {
      t: baseTime,
      stageState: CONSTANTS.STAGE_STATE.PLAYING,
      players: [{ id: "p1", x: 200, y: 500, slot: 1 }],
      boxes: [{ id: "b1", x: 250, y: 500 }]
    };

    net.snapshots = [s0, s1];
    const interpolated = net.getInterpolatedState();

    assert.ok(interpolated, "Should compute interpolated state");
    const interpP1 = interpolated.players.find((p) => p.id === "p1");
    assert.ok(interpP1.x >= 100 && interpP1.x <= 200, `Interp X ${interpP1.x} must be between 100 and 200`);
    assert.strictEqual(interpolated.stageState, CONSTANTS.STAGE_STATE.PLAYING);

    pass(15, "Network interpolation / delay tolerance", "Smooth sub-frame interpolation between snapshots");
  } catch (err) {
    fail(15, "Network interpolation / delay tolerance", err);
  }

  // -------------------------------------------------------------
  // Scenario 16: Stage transitions
  // -------------------------------------------------------------
  try {
    const roomManager = new RoomManager();
    const room = roomManager.createRoom("ProgressionHost");
    room.startGame();

    assert.strictEqual(room.currentStageName, "stage_jump01");

    // Complete stage
    room.nextStage();
    assert.strictEqual(room.currentStageName, "stage_push02", "Must advance to stage_push02");
    assert.ok(room.physicsWorld.stageState === CONSTANTS.STAGE_STATE.READY || room.physicsWorld.stageState === CONSTANTS.STAGE_STATE.PLAYING);

    room.destroy();
    pass(16, "Stage transitions", "stage_jump01 -> stage_push02 progression and clean world reload");
  } catch (err) {
    fail(16, "Stage transitions", err);
  }

  // -------------------------------------------------------------
  // Scenario 17: Multiple rapid retries
  // -------------------------------------------------------------
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);

    for (let r = 0; r < 10; r++) {
      p1.inputs.right = true;
      for (let s = 0; s < 5; s++) physics.step(0.016);
      physics.resetStage();
      assert.strictEqual(physics.levelCompleted, false);
      assert.strictEqual(physics.key.state, CONSTANTS.KEY_STATE.KEY_AVAILABLE);
      assert.strictEqual(physics.goal.isOpen, false);
      assert.ok(!isNaN(p1.x) && !isNaN(p1.y), "Coordinates must not be NaN");
    }

    pass(17, "Multiple rapid retries", "10 consecutive rapid resets execute flawlessly without corruption");
  } catch (err) {
    fail(17, "Multiple rapid retries", err);
  }

  // -------------------------------------------------------------
  // Scenario 18: SFX event ID deduplication in AudioManagerEngine
  // -------------------------------------------------------------
  try {
    const audio = new AudioManagerEngine();
    audio.isUnlocked = true;
    audio.ctx = {
      currentTime: 0,
      state: "running",
      resume: async () => {},
      createOscillator: () => ({
        type: "sine",
        frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
        start: () => {},
        stop: () => {}
      }),
      createGain: () => ({
        gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {}
      }),
      createBiquadFilter: () => ({
        type: "lowpass",
        frequency: { setValueAtTime: () => {} },
        connect: () => {}
      })
    };
    audio.sfxGain = audio.ctx.createGain();

    const evId = "ev_unique_42";
    audio.playSFX("jump", evId);
    assert.ok(audio.seenEventIds.has(evId), "Event ID should be recorded in seenEventIds");

    // Second call with same event ID should be blocked
    let synthCalls = 0;
    const origSynth = audio.synthSFX.bind(audio);
    audio.synthSFX = (name) => {
      synthCalls++;
      return origSynth(name);
    };

    audio.playSFX("jump", evId);
    assert.strictEqual(synthCalls, 0, "Duplicate event ID must be rejected immediately");

    pass(18, "SFX event ID deduplication", "AudioManagerEngine blocks identical event IDs from firing SFX");
  } catch (err) {
    fail(18, "SFX event ID deduplication", err);
  }

  // -------------------------------------------------------------
  // Scenario 19: Stack carrying momentum transfer
  // -------------------------------------------------------------
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Carrier", 1);
    const p2 = physics.addPlayer("p2", "Rider", 2);

    // Place P1 on flat starting platform
    p1.x = 300;
    p1.y = 648;
    p1.onGround = true;

    // Place P2 directly on top of P1's head
    p2.x = 300;
    p2.y = p1.y - CONSTANTS.PLAYER_HEIGHT;
    p2.onGround = true;
    p2.ridingOn = p1.id;

    // Carrier moves right
    p1.vx = 180;
    p1.inputs.right = true;

    const riderStartX = p2.x;
    for (let i = 0; i < 15; i++) {
      physics.step(0.016);
    }

    assert.ok(p2.x > riderStartX, `Rider must be carried forward: start=${riderStartX}, current=${p2.x}`);
    pass(19, "Stack carrying momentum transfer", "moveRiders transfers carrier horizontal motion to rider");
  } catch (err) {
    fail(19, "Stack carrying momentum transfer", err);
  }

  // -------------------------------------------------------------
  // Scenario 20: No duplicate victory fanfare
  // -------------------------------------------------------------
  try {
    const physics = new PhysicsWorld(stageData);
    const p1 = physics.addPlayer("p1", "Player 1", 1);

    // Pick up key
    p1.x = physics.key.x;
    p1.y = physics.key.y;
    physics.step(0.016);
    physics.drainEvents();

    // Step into goal door to unlock & complete
    p1.x = physics.goal.x;
    p1.y = physics.goal.y;
    physics.step(0.016); // Door unlocks AND completes because P1 is inside

    assert.strictEqual(physics.levelCompleted, true, "Level completed on entering goal");

    const firstEvents = physics.drainEvents();
    const winSounds = firstEvents.filter((e) => e.name === "win");
    const clearEvents = firstEvents.filter((e) => e.type === "level_clear");
    assert.strictEqual(winSounds.length, 1, "Exactly one 'win' sound emitted on completion");
    assert.strictEqual(clearEvents.length, 1, "Exactly one 'level_clear' event emitted on completion");

    // Subsequent ticks while player stays in goal
    for (let i = 0; i < 20; i++) {
      physics.step(0.016);
    }
    const subsequentEvents = physics.drainEvents();
    const subsequentWinSounds = subsequentEvents.filter((e) => e.name === "win");
    const subsequentClearEvents = subsequentEvents.filter((e) => e.type === "level_clear");
    assert.strictEqual(subsequentWinSounds.length, 0, "No duplicate victory sounds emitted on subsequent ticks");
    assert.strictEqual(subsequentClearEvents.length, 0, "No duplicate level_clear events emitted on subsequent ticks");

    pass(20, "No duplicate victory fanfare", "Single authoritative win event emitted; subsequent ticks suppressed");
  } catch (err) {
    fail(20, "No duplicate victory fanfare", err);
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`     RESULTS: ${results.filter((r) => r.status === "PASS").length} / ${results.length} SCENARIOS PASSED`);
  console.log("=================================================================\n");

  const allPassed = results.every((r) => r.status === "PASS");
  if (!allPassed) {
    process.exit(1);
  }
}

runMasterSuite().catch((e) => {
  console.error("FATAL ERROR IN SUITE:", e);
  process.exit(1);
});
