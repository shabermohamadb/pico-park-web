// PICO PARK Level Loader

const CONSTANTS = typeof require !== "undefined" ? require("./constants") : window.CONSTANTS;

class LevelLoader {
  constructor() {
    this.cachedLevels = new Map();
    this.manifest = null;
  }

  setManifest(manifest) {
    this.manifest = manifest;
  }

  loadLevelSync(levelData) {
    const { name, width, height, chipSize, scale, scrollable, actors, tiles } = levelData;

    // Build 2D grid: grid[y][x]
    // In Pico Park Lua: map.table is column-major: column index (0..width-1) * height + row index (0..height-1)
    const grid = [];
    for (let y = 0; y < height; y++) {
      grid[y] = new Array(width).fill(CONSTANTS.TILES.MC_NON);
    }

    if (tiles && tiles.length > 0) {
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          const idx = x * height + y;
          if (idx < tiles.length) {
            grid[y][x] = tiles[idx];
          }
        }
      }
    }

    // Process actors into game objects
    const processedActors = {
      players: [],
      key: null,
      goal: null,
      switches: [],
      boxes: [],
      bridges: [],
      warps: [],
      decorations: []
    };

    let boxIndex = 0;
    let switchIndex = 0;

    actors.forEach((act) => {
      const type = act.type;
      const x = act.x;
      const y = act.y;
      const id = act.id || "";
      const args = act.args || [];

      switch (type) {
        case "Player":
          processedActors.players.push({
            id: parseInt(id) || (processedActors.players.length + 1),
            x: x,
            y: y
          });
          break;

        case "Key":
          processedActors.key = {
            id: "key_main",
            x: x,
            y: y,
            w: 24,
            h: 30,
            initialX: x,
            initialY: y
          };
          break;

        case "Goal":
          processedActors.goal = {
            id: "goal_door",
            x: x,
            y: y,
            w: 52,
            h: 68,
            isOpen: false,
            cleared: false
          };
          break;

        case "Switch":
          processedActors.switches.push({
            id: `switch_${switchIndex++}`,
            targetId: id || (args[0] ? String(args[0]) : "Bridge"),
            x: x,
            y: y,
            w: 36,
            h: 16,
            isPressed: false
          });
          break;

        case "Bridge":
          // args: [length, dirX, dirY, speed, delay]
          processedActors.bridges.push({
            id: id || "Bridge",
            x: x,
            y: y,
            w: (args[0] ? Number(args[0]) : 4) * chipSize,
            h: 16,
            initialX: x,
            initialY: y,
            isOpen: false,
            speed: args[3] ? Number(args[3]) : 10
          });
          break;

        case "BigBox":
        case "PushBox":
        case "SmallBox":
        case "ColorBox":
          const isBig = type === "BigBox";
          const isSmall = type === "SmallBox";
          const boxW = isBig ? chipSize * 2 : (isSmall ? chipSize * 1 : chipSize * 1.5);
          const boxH = isBig ? chipSize * 2 : (isSmall ? chipSize * 1 : chipSize * 1.5);
          processedActors.boxes.push({
            id: `box_${boxIndex++}`,
            type: type,
            x: x,
            y: y,
            w: boxW,
            h: boxH,
            weight: args[0] ? Number(args[0]) : (isBig ? 50 : 20),
            color: type === "ColorBox" ? (args[1] || "#ffbf7f") : "#f59e0b"
          });
          break;

        case "Warp":
          processedActors.warps.push({
            id: `warp_${id}`,
            x: x,
            y: y,
            w: args[0] ? Number(args[0]) : 64,
            h: args[1] ? Number(args[1]) : 32,
            targetX: args[2] ? Number(args[2]) : x,
            targetY: args[3] ? Number(args[3]) : y
          });
          break;

        default:
          processedActors.decorations.push({
            type: type,
            x: x,
            y: y,
            args: args
          });
          break;
      }
    });

    return {
      name,
      width,
      height,
      chipSize,
      scale,
      scrollable,
      worldWidth: width * chipSize,
      worldHeight: height * chipSize,
      grid,
      actors: processedActors
    };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = LevelLoader;
} else if (typeof window !== "undefined") {
  window.LevelLoader = LevelLoader;
}
