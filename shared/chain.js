// Re-export from src/game/chain/ChainManager.js for full backward compatibility
const ChainManager = require("../src/game/chain/ChainManager");
module.exports = ChainManager;
if (typeof window !== "undefined") {
  window.ChainSystem = ChainManager;
}
