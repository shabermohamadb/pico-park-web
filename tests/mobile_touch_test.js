// PICO PARK Web - Mobile Touch Controls & Virtual Input Test Suite

const assert = require("assert");
const { InputHandler } = require("../src/client/input");

console.log("=================================================================");
console.log("       PICO PARK WEB - MOBILE TOUCH CONTROLS UNIT TESTS          ");
console.log("=================================================================");

let testsPassed = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] Test ${totalTests}: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`[FAIL] Test ${totalTests}: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// Mock window, document, and localStorage for node environment
global.window = {
  innerWidth: 1024,
  innerHeight: 768,
  location: { search: "" },
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false })
};
global.document = {
  getElementById: (id) => ({
    id,
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: () => {},
    style: {}
  }),
  documentElement: {
    requestFullscreen: async () => {}
  },
  body: {
    classList: {
      add: () => {},
      remove: () => {}
    }
  },
  addEventListener: () => {},
  removeEventListener: () => {}
};
global.navigator = { maxTouchPoints: 0 };
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] !== undefined ? this._store[k] : null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
};

const { TouchController } = require("../src/client/touchControls");

// 1. Initial State
runTest("InputHandler initializes with empty virtualButtons", () => {
  const handler = new InputHandler();
  assert.ok(handler.virtualButtons instanceof Map, "virtualButtons must be a Map");
  assert.strictEqual(handler.isActionActive(1, "left"), false);
  assert.strictEqual(handler.isActionActive(1, "jump"), false);
});

// 2. Single Virtual Button Press
runTest("setVirtualButton triggers onInputChanged and updates state", () => {
  let changedState = null;
  const handler = new InputHandler((state) => {
    changedState = state;
  });

  handler.setVirtualButton("left", true, 1);
  assert.ok(changedState, "onInputChanged must be called");
  assert.strictEqual(changedState.left, true);
  assert.strictEqual(changedState.jump, false);
  assert.strictEqual(handler.isActionActive(1, "left"), true);
});

// 3. Multi-Touch (Simultaneous Run Left + Jump with both thumbs)
runTest("Simultaneous multi-touch: Running left while jumping", () => {
  let lastState = null;
  const handler = new InputHandler((state) => {
    lastState = state;
  });

  // Left thumb presses LEFT
  handler.setVirtualButton("left", true, 1);
  assert.strictEqual(lastState.left, true);
  assert.strictEqual(lastState.jump, false);

  // Right thumb presses JUMP simultaneously
  handler.setVirtualButton("jump", true, 1);
  assert.strictEqual(lastState.left, true, "Left must remain active while jumping");
  assert.strictEqual(lastState.jump, true, "Jump must become active");
  assert.strictEqual(handler.isActionActive(1, "left"), true);
  assert.strictEqual(handler.isActionActive(1, "jump"), true);

  // Right thumb releases JUMP while still holding LEFT
  handler.setVirtualButton("jump", false, 1);
  assert.strictEqual(lastState.left, true, "Left must still be held");
  assert.strictEqual(lastState.jump, false, "Jump must be released");
});

// 4. Action button (Down / Pull / Switch)
runTest("Action button virtual press dispatches correctly", () => {
  let lastState = null;
  const handler = new InputHandler((state) => {
    lastState = state;
  });

  handler.setVirtualButton("action", true, 1);
  assert.strictEqual(lastState.action, true);
  assert.strictEqual(handler.isActionActive(1, "action"), true);

  handler.setVirtualButton("action", false, 1);
  assert.strictEqual(lastState.action, false);
  assert.strictEqual(handler.isActionActive(1, "action"), false);
});

// 5. Clear Virtual Buttons for slot
runTest("clearVirtualButtons clears all touch inputs for slot", () => {
  let lastState = null;
  const handler = new InputHandler((state) => {
    lastState = state;
  });

  handler.setVirtualButton("right", true, 1);
  handler.setVirtualButton("jump", true, 1);
  assert.strictEqual(lastState.right, true);
  assert.strictEqual(lastState.jump, true);

  handler.clearVirtualButtons(1);
  assert.strictEqual(lastState.right, false);
  assert.strictEqual(lastState.jump, false);
  assert.strictEqual(handler.isActionActive(1, "right"), false);
});

// 6. Multi-Player Slot Isolation
runTest("Virtual buttons respect player slots independently", () => {
  const handler = new InputHandler();
  handler.registerLocalPlayer(1, "p1-uuid");
  handler.registerLocalPlayer(2, "p2-uuid");

  handler.setVirtualButton("left", true, 1);
  handler.setVirtualButton("right", true, 2);

  assert.strictEqual(handler.isActionActive(1, "left"), true);
  assert.strictEqual(handler.isActionActive(1, "right"), false);
  assert.strictEqual(handler.isActionActive(2, "left"), false);
  assert.strictEqual(handler.isActionActive(2, "right"), true);
});

// 7. InputHandler.reset clears virtual buttons
runTest("InputHandler.reset() clears virtual buttons and active keys", () => {
  let lastState = null;
  const handler = new InputHandler((state) => {
    lastState = state;
  });

  handler.setVirtualButton("jump", true, 1);
  assert.strictEqual(handler.isActionActive(1, "jump"), true);

  handler.reset();
  assert.strictEqual(handler.isActionActive(1, "jump"), false);
  assert.strictEqual(lastState.jump, false);
  assert.strictEqual(handler.virtualButtons.size, 0);
});

// 8. Hybrid Input: Keyboard + Virtual Touch buttons seamlessly merge
runTest("Hybrid input: Virtual touch and keyboard work simultaneously without conflicts", () => {
  const handler = new InputHandler();
  
  // Physical key 'KeyA' pressed
  handler.activeKeys.add("KeyA");
  assert.strictEqual(handler.isActionActive(1, "left"), true);

  // Virtual JUMP pressed on screen
  handler.setVirtualButton("jump", true, 1);
  assert.strictEqual(handler.isActionActive(1, "jump"), true);
  assert.strictEqual(handler.isActionActive(1, "left"), true);

  // Physical key released, virtual jump still pressed
  handler.activeKeys.delete("KeyA");
  assert.strictEqual(handler.isActionActive(1, "left"), false);
  assert.strictEqual(handler.isActionActive(1, "jump"), true);
});

// 9. Auto Fullscreen: Option loading and persistence
runTest("Auto Fullscreen loads preference and persists changes to localStorage", () => {
  localStorage.clear();
  const inputHandler = new InputHandler();
  const controller = new TouchController(inputHandler);

  assert.strictEqual(controller.autoFullscreen, false, "Default on non-touch desktop is false");
  
  controller.setAutoFullscreen(true);
  assert.strictEqual(controller.autoFullscreen, true);
  assert.strictEqual(localStorage.getItem("pico_auto_fullscreen"), "true");

  controller.setAutoFullscreen(false);
  assert.strictEqual(controller.autoFullscreen, false);
  assert.strictEqual(localStorage.getItem("pico_auto_fullscreen"), "false");
});

// 10. Auto Fullscreen: tryAutoFullscreen invocation
runTest("tryAutoFullscreen invokes requestFullscreen when enabled", () => {
  const inputHandler = new InputHandler();
  const controller = new TouchController(inputHandler);

  let requested = false;
  controller.requestFullscreen = () => {
    requested = true;
    return Promise.resolve();
  };

  controller.autoFullscreen = false;
  controller.tryAutoFullscreen();
  assert.strictEqual(requested, false, "Must not request fullscreen when disabled");

  controller.autoFullscreen = true;
  controller.tryAutoFullscreen();
  assert.strictEqual(requested, true, "Must request fullscreen when enabled");
});

console.log("\n=================================================================");
console.log(` RESULTS: ${testsPassed} / ${totalTests} MOBILE TOUCH TESTS PASSED`);
console.log("=================================================================\n");
