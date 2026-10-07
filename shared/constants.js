// Re-export from src/game/game-state/GameState.js for full backward compatibility
const GameState = require("../src/game/game-state/GameState");
module.exports = GameState;
if (typeof window !== "undefined") {
  window.CONSTANTS = GameState;
}
