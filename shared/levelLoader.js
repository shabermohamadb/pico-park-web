// Re-export from src/game/levels/LevelManager.js for full backward compatibility
const LevelManager = require("../src/game/levels/LevelManager");
module.exports = LevelManager;
if (typeof window !== "undefined") {
  window.LevelLoader = LevelManager;
}
