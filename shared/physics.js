// Re-export from src/game/physics/PhysicsManager.js for full backward compatibility
const PhysicsManager = require("../src/game/physics/PhysicsManager");
module.exports = PhysicsManager;
if (typeof window !== "undefined") {
  window.PhysicsWorld = PhysicsManager;
}
