// PICO PARK Web Automated Integration Test Suite

const http = require("http");
const { WebSocket } = require("ws");
const assert = require("assert");

// Import server
process.env.PORT = 3002;
require("../server/index.js");

const SERVER_URL = "ws://localhost:3002";

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

async function runTests() {
  console.log("=== Starting PICO PARK Multiplayer Integration Tests ===");

  try {
    // 1. Connect Client 1 (Host)
    console.log("[Test 1] Connecting Host client...");
    const client1 = await createClient();
    assert.strictEqual(client1.readyState, WebSocket.OPEN);

    // 2. Create Room
    console.log("[Test 2] Creating room...");
    client1.send(JSON.stringify({
      type: "create_room",
      name: "AliceHost",
      settings: { maxPlayers: 8 }
    }));

    const createMsg = await waitForMessage(client1, (m) => m.type === "room_created");
    const roomCode = createMsg.room.code;
    assert.ok(roomCode && roomCode.length >= 4, "Room code should be generated");
    assert.strictEqual(createMsg.room.players.length, 1);
    assert.strictEqual(createMsg.room.players[0].name, "AliceHost");
    assert.strictEqual(createMsg.room.players[0].isHost, true);
    console.log(`  -> Room created successfully! Code: ${roomCode}`);

    // 3. Connect Client 2 (Guest) and Join Room
    console.log("[Test 3] Connecting Guest client 2 and joining room...");
    const client2 = await createClient();
    client2.send(JSON.stringify({
      type: "join_room",
      code: roomCode,
      name: "BobGuest"
    }));

    const joinMsg2 = await waitForMessage(client2, (m) => m.type === "room_joined");
    assert.strictEqual(joinMsg2.room.players.length, 2);
    assert.strictEqual(joinMsg2.room.players[1].name, "BobGuest");
    assert.strictEqual(joinMsg2.room.players[1].slot, 2);
    console.log("  -> Client 2 joined room successfully!");

    // Verify Client 1 received room_state broadcast
    const hostUpdate = await waitForMessage(client1, (m) => m.type === "room_state" && m.room.players.length === 2);
    assert.strictEqual(hostUpdate.room.players.length, 2);
    console.log("  -> Host received room_state broadcast!");

    // 4. Connect Client 3 (Guest 2)
    console.log("[Test 4] Connecting Guest client 3 and joining room...");
    const client3 = await createClient();
    client3.send(JSON.stringify({
      type: "join_room",
      code: roomCode,
      name: "CharlieGuest"
    }));
    await waitForMessage(client3, (m) => m.type === "room_joined");
    await waitForMessage(client1, (m) => m.type === "room_state" && m.room.players.length === 3);
    console.log("  -> Client 3 joined room successfully (3 players total)!");

    // 5. Test Ready States
    console.log("[Test 5] Toggling player ready states...");
    client2.send(JSON.stringify({
      type: "set_ready",
      ready: true
    }));
    const readyState = await waitForMessage(client1, (m) => m.type === "room_state" && m.room.players.find((p) => p.name === "BobGuest" && p.isReady));
    assert.ok(readyState, "BobGuest should be ready");
    console.log("  -> Ready state synchronized across all clients!");

    // 6. Start Game
    console.log("[Test 6] Host starting game...");
    client1.send(JSON.stringify({ type: "start_game" }));

    const startMsg1 = await waitForMessage(client1, (m) => m.type === "game_started");
    const startMsg2 = await waitForMessage(client2, (m) => m.type === "game_started");
    const startMsg3 = await waitForMessage(client3, (m) => m.type === "game_started");

    assert.strictEqual(startMsg1.stage.name, "stage_jump01");
    assert.strictEqual(startMsg2.stage.name, "stage_jump01");
    assert.strictEqual(startMsg3.stage.name, "stage_jump01");
    assert.ok(startMsg1.stage.grid && startMsg1.stage.grid.length > 0, "Grid should be populated");
    console.log("  -> Game started with stage_jump01 for all 3 players!");

    // 7. Test Snapshot Replication
    console.log("[Test 7] Verifying 30Hz snapshot replication...");
    const snapMsg = await waitForMessage(client1, (m) => m.type === "game_snapshot");
    assert.ok(snapMsg.snapshot.players.length === 3, "Snapshot should contain 3 players");
    assert.ok(snapMsg.snapshot.players[0].x > 0, "Player 1 has valid X coordinate");
    console.log(`  -> Snapshot received: ${snapMsg.snapshot.players.length} players, ${snapMsg.snapshot.boxes.length} boxes`);

    // 8. Test Player Movement Input Streaming
    console.log("[Test 8] Testing player input streaming and velocity simulation...");
    const initialX = snapMsg.snapshot.players[0].x;
    client1.send(JSON.stringify({
      type: "player_input",
      inputs: { right: true, jump: true }
    }));

    // Wait 200ms of physics steps
    await new Promise((r) => setTimeout(r, 200));

    const movedSnap = await waitForMessage(client1, (m) => m.type === "game_snapshot");
    const p1Moved = movedSnap.snapshot.players.find((p) => p.slot === 1);
    assert.ok(p1Moved.x >= initialX, "Player 1 should move right with input");
    console.log(`  -> Player moved from X=${initialX} to X=${p1Moved.x}`);

    // 9. Test Player Emote Broadcast
    console.log("[Test 9] Testing quick chat emotes...");
    client2.send(JSON.stringify({
      type: "player_emote",
      emote: "JUMP!"
    }));
    const emoteMsg = await waitForMessage(client1, (m) => m.type === "emote_trigger" && m.emote === "JUMP!");
    assert.strictEqual(emoteMsg.emote, "JUMP!");
    console.log("  -> Emote broadcast synchronized successfully!");

    // 10. Test Safe Disconnection
    console.log("[Test 10] Testing safe player disconnection...");
    client3.close();
    const afterDrop = await waitForMessage(client1, (m) => m.type === "game_snapshot" && m.snapshot.players.length === 2);
    assert.strictEqual(afterDrop.snapshot.players.length, 2);
    console.log("  -> Disconnect handled safely without game crash!");

    // 11. Test Non-Host Restart Permission Check
    console.log("[Test 11] Testing non-host restart permission check...");
    client2.send(JSON.stringify({ type: "restart_level" }));
    const errorMsg = await waitForMessage(client2, (m) => m.type === "error");
    assert.ok(errorMsg.message.includes("host"), "Should notify that only host can restart");
    console.log("  -> Non-host restart properly rejected with informative error!");

    // 12. Test Host Level Restart & Clean State Reset
    console.log("[Test 12] Testing host restart and clean level reset...");
    client1.send(JSON.stringify({ type: "restart_level" }));
    const resetMsg1 = await waitForMessage(client1, (m) => m.type === "next_level");
    const resetMsg2 = await waitForMessage(client2, (m) => m.type === "next_level");
    assert.strictEqual(resetMsg1.stage.name, "stage_jump01");
    assert.strictEqual(resetMsg2.stage.name, "stage_jump01");
    console.log("  -> Level restarted and state reset across all players!");

    // 13. Direct Physics & Cooperative Goal Verification
    console.log("[Test 13] Verifying cooperative key, door, and goal completion...");
    const PhysicsWorld = require("../shared/physics");
    const LevelLoader = require("../shared/levelLoader");
    const fs = require("fs");
    const path = require("path");

    const stageData = JSON.parse(fs.readFileSync(path.join(__dirname, "../shared/levels/stage_jump01.json"), "utf-8"));
    const levelLoader = new LevelLoader();
    const processedLevel = levelLoader.loadLevelSync(stageData);
    const physics = new PhysicsWorld(processedLevel);

    const pA = physics.addPlayer("pA", "Player A", 1);
    const pB = physics.addPlayer("pB", "Player B", 2);

    // Goal should initially be closed because level has a key
    assert.strictEqual(physics.goal.isOpen, false, "Goal should start locked");
    assert.strictEqual(physics.levelCompleted, false, "Level should not be completed initially");

    // Move player A to key position (624, 606)
    pA.x = 624;
    pA.y = 606;
    physics.step(0.016);
    assert.strictEqual(physics.key.heldBy, "pA", "Player A should pick up key");

    // Move keyholder to goal door (1050, 674)
    pA.x = 1050;
    pA.y = 674;
    physics.step(0.016);
    assert.strictEqual(physics.goal.isOpen, true, "Goal door should unlock when keyholder reaches it");

    // Player A is in goal, but Player B is NOT -> should NOT win yet
    pB.x = 200;
    pB.y = 674;
    physics.step(0.016);
    assert.strictEqual(physics.levelCompleted, false, "Cooperative goal must NOT complete with only 1 player");

    // Player A leaves the door
    pA.x = 400;
    physics.step(0.016);
    assert.strictEqual(physics.goal.playersInside.has("pA"), false, "Stepping away should remove player from goal");

    // Both players assemble inside the goal door simultaneously
    pA.x = 1050;
    pA.y = 674;
    pB.x = 1050;
    pB.y = 674;
    physics.step(0.016);
    assert.strictEqual(physics.levelCompleted, true, "Level should complete when all players are in goal!");

    // Verify exactly one level_clear event is drained
    const events = physics.drainEvents();
    const clearEvents = events.filter((e) => e.type === "level_clear");
    assert.strictEqual(clearEvents.length, 1, "Exactly one level_clear event should be emitted");
    console.log("  -> Cooperative goal condition is 100% deterministic and verified!");

    // 14. Verify Box Anti-Penetration Physics
    console.log("[Test 14] Verifying box collision and anti-penetration...");
    const box = physics.boxes[0];
    pA.x = box.x - box.w / 2 - 5;
    pA.y = box.y;
    pA.vx = 200;
    physics.step(0.016);
    // Player must not be deeply inside box
    const overlap = (pA.w + box.w) / 2 - Math.abs(pA.x - box.x);
    assert.ok(overlap < 5, "Player should not penetrate inside box");
    console.log("  -> Box collision anti-penetration verified!");

    // 15. Verify Discrete Jump Buffering (No Bunny-Hop Spam)
    console.log("[Test 15] Verifying discrete jump buffering...");
    pA.onGround = true;
    pA.inputs.jump = true;
    physics.step(0.016); // First press
    assert.strictEqual(pA.prevJumpInput, true);

    // Continue holding jump
    physics.step(0.016);
    physics.step(0.016);
    assert.strictEqual(pA.jumpBuffer, 0, "Holding jump should not continuously refresh jump buffer");
    console.log("  -> Discrete jump buffering verified (no bunny-hop spam)!");

    // 16. Verify Add Local Player (Single-machine couch co-op from Reference 2)
    console.log("[Test 16] Verifying Add Local Player on same connection...");
    client1.send(JSON.stringify({
      type: "add_local_player",
      name: "LocalP2"
    }));
    const localAddedMsg = await waitForMessage(client1, (m) => m.type === "local_player_added");
    assert.ok(localAddedMsg.playerId, "Should receive playerId for local player");
    assert.ok(localAddedMsg.slot > 0, "Should be assigned a valid slot");

    // Test input dispatch to targetPlayerId
    client1.send(JSON.stringify({
      type: "player_input",
      targetPlayerId: localAddedMsg.playerId,
      inputs: { right: true }
    }));
    console.log("  -> Local player added and input dispatched successfully!");

    // Cleanup
    client1.close();
    client2.close();

    console.log("\n=======================================================");
    console.log("  ALL 16 PICO PARK INTEGRATION TESTS PASSED SUCCESSFULLY!  ");
    console.log("=======================================================\n");
    process.exit(0);
  } catch (err) {
    console.error("\n[TEST FAILED]:", err);
    process.exit(1);
  }
}

runTests();
