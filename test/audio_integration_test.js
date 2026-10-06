// test/audio_integration_test.js
// Tests the newly integrated BGM audio assets and AudioManagerEngine logic

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");
const AudioManagerEngine = require("../client/js/audio");

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

(async () => {
  console.log("=================================================================");
  console.log("   PICO PARK WEB - AUDIO INTEGRATION TEST SUITE                  ");
  console.log("=================================================================\n");

  // Test 1: Audio assets exist in proper assets directory
  it("Assets - Both bgm.mp3 and bgm.ogg exist in client/assets/audio/", () => {
    const mp3Path = path.join(__dirname, "../client/assets/audio/bgm.mp3");
    const oggPath = path.join(__dirname, "../client/assets/audio/bgm.ogg");

    assert(fs.existsSync(mp3Path), "client/assets/audio/bgm.mp3 must exist");
    assert(fs.existsSync(oggPath), "client/assets/audio/bgm.ogg must exist");

    const mp3Stat = fs.statSync(mp3Path);
    const oggStat = fs.statSync(oggPath);

    assert(mp3Stat.size > 1000000, `bgm.mp3 size unexpectedly small: ${mp3Stat.size}`);
    assert(oggStat.size > 1000000, `bgm.ogg size unexpectedly small: ${oggStat.size}`);
  });

  // Test 2: HTTP server serves bgm.mp3 with proper audio headers
  await asyncIt("Server HTTP - bgm.mp3 served with correct Content-Type and caching", async () => {
    const res = await new Promise((resolve, reject) => {
      http.get("http://localhost:3001/assets/audio/bgm.mp3", resolve).on("error", reject);
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers["content-type"], "audio/mpeg");
    assert(res.headers["cache-control"], "Expected Cache-Control header");
    assert(res.headers["etag"], "Expected ETag header");
    assert.strictEqual(res.headers["accept-ranges"], "bytes");
  });

  // Test 3: HTTP server serves bgm.ogg with proper audio headers
  await asyncIt("Server HTTP - bgm.ogg served with correct Content-Type and caching", async () => {
    const res = await new Promise((resolve, reject) => {
      http.get("http://localhost:3001/assets/audio/bgm.ogg", resolve).on("error", reject);
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers["content-type"], "audio/ogg");
    assert(res.headers["cache-control"], "Expected Cache-Control header");
    assert(res.headers["etag"], "Expected ETag header");
  });

  // Test 4: Mock Web Audio context to test AudioManagerEngine BGM lifecycle & deduplication
  it("AudioManager - Prevents duplicate BGM instances and duplicate play calls", () => {
    const audio = new AudioManagerEngine();

    let mockSourceCount = 0;
    let activeMockSources = [];

    const mockCtx = {
      currentTime: 0,
      state: "running",
      destination: {},
      createGain: () => ({
        gain: {
          value: 1,
          setValueAtTime: function(v) { this.value = v; }
        },
        connect: () => {}
      }),
      createBufferSource: () => {
        mockSourceCount++;
        const src = {
          id: mockSourceCount,
          buffer: null,
          loop: false,
          started: false,
          stopped: false,
          connect: () => {},
          start: () => { src.started = true; activeMockSources.push(src); },
          stop: () => { src.stopped = true; activeMockSources = activeMockSources.filter(s => s !== src); },
          disconnect: () => {}
        };
        return src;
      }
    };

    audio.ctx = mockCtx;
    audio.isUnlocked = true;
    audio.musicGain = mockCtx.createGain();
    audio.masterGain = mockCtx.createGain();
    audio.sfxGain = mockCtx.createGain();

    // Provide mock preloaded buffer
    const mockBuffer = { duration: 154.7 };
    audio.buffers.set("bgm", mockBuffer);

    // First call to playBGM
    audio.playBGM("bgm");
    assert.strictEqual(audio.currentBgmName, "bgm");
    assert(audio.currentBgmSource !== null);
    assert.strictEqual(mockSourceCount, 1);
    assert.strictEqual(activeMockSources.length, 1);

    // Second immediate call to playBGM with same name (simulating frame updates / level reload)
    audio.playBGM("bgm");
    // MUST NOT spawn a second source
    assert.strictEqual(mockSourceCount, 1, "Duplicate playBGM call must not create new source");
    assert.strictEqual(activeMockSources.length, 1);

    // Switching BGM stops previous source before starting new one
    audio.buffers.set("title_bgm", mockBuffer);
    audio.playBGM("title_bgm");
    assert.strictEqual(audio.currentBgmName, "title_bgm");
    assert.strictEqual(mockSourceCount, 2);
    assert.strictEqual(activeMockSources.length, 1, "Only 1 active BGM source should be playing at any time");

    // Stopping BGM disconnects cleanly
    audio.stopBGM();
    assert.strictEqual(audio.currentBgmSource, null);
    assert.strictEqual(audio.currentBgmName, null);
    assert.strictEqual(activeMockSources.length, 0);
  });

  // Test 5: Volume and Mute control integrity
  it("AudioManager - Volume sliders and mute toggle update gain nodes properly", () => {
    const audio = new AudioManagerEngine();
    let masterGainVal = 0.8;
    let musicGainVal = 0.6;
    let sfxGainVal = 0.8;

    audio.ctx = { currentTime: 0, state: "running" };
    audio.masterGain = {
      gain: { setValueAtTime: (v) => { masterGainVal = v; } }
    };
    audio.musicGain = {
      gain: { setValueAtTime: (v) => { musicGainVal = v; } }
    };
    audio.sfxGain = {
      gain: { setValueAtTime: (v) => { sfxGainVal = v; } }
    };

    // Adjust volume
    audio.setMusicVolume(0.35);
    assert.strictEqual(audio.musicVolume, 0.35);
    assert.strictEqual(musicGainVal, 0.35);

    audio.setMasterVolume(0.5);
    assert.strictEqual(audio.masterVolume, 0.5);
    assert.strictEqual(masterGainVal, 0.5);

    // Mute
    audio.setMuted(true);
    assert.strictEqual(audio.isMuted, true);
    assert.strictEqual(masterGainVal, 0); // Muted zeroes master gain

    // Unmute
    audio.setMuted(false);
    assert.strictEqual(audio.isMuted, false);
    assert.strictEqual(masterGainVal, 0.5); // Restores master volume
  });

  // Test 6: In-flight deduplication of sound decoding
  it("AudioManager - Prevents duplicate network downloads or decoding for same sound", () => {
    const audio = new AudioManagerEngine();
    let fetchCount = 0;

    global.fetch = async (url) => {
      fetchCount++;
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8)
      };
    };

    audio.ctx = {
      currentTime: 0,
      decodeAudioData: async (buf) => ({ duration: 154.7 })
    };

    // Trigger two concurrent loads for the same sound name
    const p1 = audio.loadSound("bgm", "assets/audio/bgm.mp3");
    const p2 = audio.loadSound("bgm", "assets/audio/bgm.mp3");

    assert.strictEqual(p1, p2, "loadSound must reuse in-flight loading promise");
  });

  console.log("\n=================================================================");
  console.log(`     RESULTS: ${passed} / ${total} AUDIO INTEGRATION TESTS PASSED`);
  console.log("=================================================================\n");
  process.exit(0);
})();
