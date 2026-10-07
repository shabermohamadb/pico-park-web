// PICO PARK Shared Constants

const CONSTANTS = {
  WINDOW_WIDTH: 1280,
  WINDOW_HEIGHT: 720,
  PLAYER_WIDTH: 42,
  PLAYER_HEIGHT: 46,
  
  // Physics parameters (in px and px/s)
  GRAVITY: 1400,
  WALK_SPEED: 220,
  JUMP_VELOCITY: -520,
  TERMINAL_VELOCITY: 800,
  PUSH_FORCE: 180,
  BOX_FRICTION: 0.85,
  SERVER_TICK_RATE: 60, // 60 Hz physics
  NETWORK_TICK_RATE: 30, // 30 Hz network snapshot sync

  // Co-op Chain Parameters
  CHAIN_DEFAULT_MAX_DISTANCE: 120,
  CHAIN_DEFAULT_MIN_DISTANCE: 35,
  CHAIN_DEFAULT_STRENGTH: 0.8,

  // Player Colors matching original PICO PARK RGB hexes
  PLAYER_COLORS: [
    { id: 1, name: "Peach", hex: "#ffbf7f", rgb: [255, 191, 127] },
    { id: 2, name: "Periwinkle", hex: "#8c8cff", rgb: [140, 140, 255] },
    { id: 3, name: "Cyan", hex: "#8cffff", rgb: [140, 255, 255] },
    { id: 4, name: "Pastel Green", hex: "#a8ffa8", rgb: [168, 255, 168] },
    { id: 5, name: "Sky Blue", hex: "#82b7ff", rgb: [130, 183, 255] },
    { id: 6, name: "Pink", hex: "#ffa8ff", rgb: [255, 168, 255] },
    { id: 7, name: "Rose", hex: "#ff9fcf", rgb: [255, 159, 207] },
    { id: 8, name: "Light Gray", hex: "#e0e0e0", rgb: [224, 224, 224] },
    { id: 9, name: "Slate Blue", hex: "#9fb7cf", rgb: [159, 183, 207] },
    { id: 10, name: "White", hex: "#ffffff", rgb: [255, 255, 255] }
  ],

  // Map Tile Constants from Pico Park
  TILES: {
    MC_INV: 0,
    MC_NON: 1,
    MC_BLK: 2,
    MC_FLC: 3, // Floor center
    MC_FLL: 4, // Floor left
    MC_FLR: 5, // Floor right
    MC_CEC: 6, // Ceiling center
    MC_CEL: 7, // Ceiling left
    MC_CER: 8, // Ceiling right
    MC_WAL: 9, // Wall solid
    MC_WAR: 10, // Wall right
    MC_INC: 11, // Inner solid
    MC_ILU: 12, // Inner left up
    MC_IRU: 13, // Inner right up
    MC_ILD: 14, // Inner left down
    MC_IRD: 15, // Inner right down
    MC_IUP: 16,
    MC_IDW: 17,
    MC_ILE: 18,
    MC_IRG: 19,
    MC_BHU: 20,
    MC_BHC: 21,
    MC_BHD: 22,
    MC_BWL: 23,
    MC_BWC: 24,
    MC_BWR: 25,
    MC_DLU: 26,
    MC_DLD: 27,
    MC_DRU: 28,
    MC_DRD: 29
  },

  // Network Protocol Message Types
  MSG: {
    // Client -> Server
    CREATE_ROOM: "create_room",
    JOIN_ROOM: "join_room",
    SET_READY: "set_ready",
    START_GAME: "start_game",
    PLAYER_INPUT: "player_input",
    PLAYER_EMOTE: "player_emote",
    RESTART_LEVEL: "restart_level",
    LEAVE_ROOM: "leave_room",
    ADD_LOCAL_PLAYER: "add_local_player",

    // Server -> Client
    ROOM_CREATED: "room_created",
    ROOM_JOINED: "room_joined",
    LOCAL_PLAYER_ADDED: "local_player_added",
    ROOM_STATE: "room_state",
    GAME_STARTED: "game_started",
    GAME_SNAPSHOT: "game_snapshot",
    LEVEL_CLEAR: "level_clear",
    NEXT_LEVEL: "next_level",
    PLAYER_DIED: "player_died",
    SOUND_TRIGGER: "sound_trigger",
    EMOTE_TRIGGER: "emote_trigger",
    ERROR: "error"
  },

  // Room lifecycle states
  ROOM_STATE: {
    LOBBY: "LOBBY",
    PLAYING: "PLAYING",
    LEVEL_CLEAR: "LEVEL_CLEAR",
    GAME_OVER: "GAME_OVER"
  },

  // Authoritative Stage State Machine (Section 10)
  STAGE_STATE: {
    LOADING: "LOADING",
    READY: "READY",
    PLAYING: "PLAYING",
    KEY_COLLECTED: "KEY_COLLECTED",
    GOAL_UNLOCKED: "GOAL_UNLOCKED",
    COMPLETING: "COMPLETING",
    COMPLETE: "COMPLETE",
    FAILED: "FAILED",
    RETRYING: "RETRYING"
  },

  // Authoritative Key State Machine (Section 7)
  KEY_STATE: {
    KEY_AVAILABLE: "KEY_AVAILABLE",
    KEY_CARRIED: "KEY_CARRIED",
    KEY_USED: "KEY_USED",
    LEVEL_COMPLETE: "LEVEL_COMPLETE"
  }
};

// Check if solid tile
CONSTANTS.isSolidTile = function(tileId) {
  // Non (air) = 1, Inv = 0
  if (tileId === CONSTANTS.TILES.MC_NON || tileId === CONSTANTS.TILES.MC_INV) {
    return false;
  }
  // All other tiles in original Pico Park are solid walls/floors
  return true;
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = CONSTANTS;
} else if (typeof window !== "undefined") {
  window.CONSTANTS = CONSTANTS;
}
