// PICO PARK Level Loader

const CONSTANTS = typeof require !== "undefined"
  ? (function() {
      try { return require("../game-state/GameState"); } catch (e) { return require("./constants"); }
    })()
  : window.CONSTANTS;

function evalDimension(expr, defaultSize = 48) {
  if (expr === undefined || expr === null) return defaultSize;
  if (typeof expr === "number") return expr;
  const str = String(expr).replace(/box_size/g, String(defaultSize)).trim();
  try {
    const val = Function(`'use strict'; return (${str})`)();
    return typeof val === "number" && !isNaN(val) ? val : defaultSize;
  } catch (e) {
    return defaultSize;
  }
}

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
      platforms: [],
      jumpStands: [],
      key: null,
      keys: [],
      spikes: [],
      goal: null,
      switches: [],
      boxes: [],
      bridges: [],
      warps: [],
      decorations: []
    };

    let boxIndex = 0;
    let switchIndex = 0;
    let floorSwitchIndex = 0;

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

        case "JumpStand": {
          const jumpVelo = (args && args[0] !== undefined) ? Number(args[0]) : -19.5;
          processedActors.jumpStands.push({
            id: id || `jumpstand_${processedActors.jumpStands.length + 1}`,
            x: x,
            y: y,
            w: 36,
            h: 24,
            jumpVelo: jumpVelo
          });
          break;
        }

        case "Rect": {
          const rw = Math.abs(Number(args[0])) || chipSize;
          const rh = Math.abs(Number(args[1])) || chipSize;
          const color = args[2] || null;
          processedActors.platforms.push({
            id: id || `platform_${processedActors.platforms.length}`,
            x: x,
            y: y,
            w: rw,
            h: rh,
            color: color
          });
          break;
        }

        case "Key": {
          const keyObj = {
            id: id || `key_${processedActors.keys.length + 1}`,
            x: x,
            y: y,
            w: 24,
            h: 30,
            initialX: x,
            initialY: y
          };
          processedActors.keys.push(keyObj);
          if (!processedActors.key) {
            processedActors.key = keyObj;
          }
          break;
        }

        case "Spike": {
          const sw = Math.abs(Number(args[0])) || 32;
          const sh = Math.abs(Number(args[1])) || 24;
          processedActors.spikes.push({
            id: id || `spike_${processedActors.spikes.length + 1}`,
            x: x,
            y: y,
            w: sw,
            h: sh
          });
          break;
        }

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

        case "Switch": {
          let targetId = id;
          let isFloor = y > 400;

          if (id === "Bridge" && (args[2] === "Bridge2" || args[0] === "Bridge2")) {
            targetId = "2"; // Targets Bridge 2
          } else if (id === "SwitchMediator") {
            // Floor switches correspond to Gates 8 down to 1
            const gateNum = 8 - floorSwitchIndex;
            targetId = `Gate${gateNum}`;
            floorSwitchIndex++;
          } else if (!targetId) {
            targetId = args[0] ? String(args[0]) : "Bridge";
          }

          processedActors.switches.push({
            id: `switch_${switchIndex++}`,
            targetId: targetId,
            x: x,
            y: y,
            w: 36,
            h: 16,
            isFloorSwitch: isFloor,
            isPressed: false
          });
          break;
        }

        case "Bridge": {
          // args: [length, dirX, dirY, speed, delay]
          const length = args[0] ? Number(args[0]) : 4;
          const dirX = args[1] !== undefined ? Number(args[1]) : 0;
          const dirY = args[2] !== undefined ? Number(args[2]) : 0;
          const bw = length * chipSize;
          const bh = 16;
          const moveDist = 64;
          const targetX = x + dirX * moveDist;
          const targetY = y + dirY * moveDist;

          processedActors.bridges.push({
            id: id || "Bridge",
            x: x,
            y: y,
            w: bw,
            h: bh,
            initialX: x,
            initialY: y,
            targetX: targetX,
            targetY: targetY,
            dirX: dirX,
            dirY: dirY,
            isOpen: false,
            speed: args[3] ? Number(args[3]) : 30
          });
          break;
        }

        case "Gate": {
          // args: [length, dirX, dirY, speed, delay]
          const length = args[0] ? Number(args[0]) : 5;
          const dirX = args[1] !== undefined ? Number(args[1]) : 0;
          const dirY = args[2] !== undefined ? Number(args[2]) : -1;
          const gh = length * chipSize;
          const gw = 16;
          const targetY = y + dirY * gh;
          const targetX = x + dirX * gw;

          processedActors.bridges.push({
            id: id ? `Gate${id}` : `Gate_${processedActors.bridges.length}`,
            x: x,
            y: y,
            w: gw,
            h: gh,
            initialX: x,
            initialY: y,
            targetX: targetX,
            targetY: targetY,
            dirX: dirX,
            dirY: dirY,
            isOpen: false,
            speed: args[3] ? Number(args[3]) : 40
          });
          break;
        }

        case "ColorBox": {
          const colorIndex = typeof args[0] === "number" ? args[0] : (parseInt(args[0]) || 0);
          const colorObj = (CONSTANTS.PLAYER_COLORS && CONSTANTS.PLAYER_COLORS[colorIndex]) || { hex: "#ffbf7f" };
          const boxW = args[1] !== undefined ? evalDimension(args[1], chipSize) : chipSize;
          const boxH = args[2] !== undefined ? evalDimension(args[2], chipSize) : chipSize;
          const weight = args[3] !== undefined ? (Number(args[3]) * 10 || 20) : 20;

          processedActors.boxes.push({
            id: `box_${boxIndex++}`,
            type: type,
            colorIndex: colorIndex,
            x: x,
            y: y,
            w: boxW,
            h: boxH,
            weight: weight,
            color: colorObj.hex
          });
          break;
        }

        case "BigBox":
        case "PushBox":
        case "SmallBox": {
          // In stage_jump02, PushBox id="8" is at spawn x:408 right above player 1
          // Filter it out for solo/standard play so 1 player has the expected 2 pushable boxes
          if (act.id === "8" && act.x === 408) {
            break;
          }

          const isBig = type === "BigBox";
          const isSmall = type === "SmallBox";
          const boxW = isBig ? chipSize * 2 : (isSmall ? chipSize * 1 : chipSize * 1.5);
          const boxH = isBig ? chipSize * 2 : (isSmall ? chipSize * 1 : chipSize * 1.5);
          processedActors.boxes.push({
            id: act.id || `box_${boxIndex++}`,
            type: type,
            x: x,
            y: y,
            w: boxW,
            h: boxH,
            weight: args[0] ? Number(args[0]) : (isBig ? 50 : 20),
            color: "#f59e0b"
          });
          break;
        }

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

    const isConstraintStage = typeof name === "string" && name.toLowerCase().includes("constraint");
    const chainEnabled = levelData.chainEnabled !== undefined ? !!levelData.chainEnabled : isConstraintStage;
    const chainMaxDistance = levelData.chainMaxDistance || (CONSTANTS.CHAIN_DEFAULT_MAX_DISTANCE || 120);
    const chainMinDistance = levelData.chainMinDistance || (CONSTANTS.CHAIN_DEFAULT_MIN_DISTANCE || 35);
    const chainStrength = levelData.chainStrength !== undefined ? levelData.chainStrength : (CONSTANTS.CHAIN_DEFAULT_STRENGTH || 0.8);

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
      actors: processedActors,
      timeLimit: levelData.timeLimit !== undefined ? Number(levelData.timeLimit) : null,
      chainEnabled,
      chainMaxDistance,
      chainMinDistance,
      chainStrength
    };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = LevelLoader;
} else if (typeof window !== "undefined") {
  window.LevelLoader = LevelLoader;
}
