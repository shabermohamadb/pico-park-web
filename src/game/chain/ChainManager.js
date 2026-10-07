// src/game/chain/ChainManager.js
// PICO PARK Cooperative Chain & Distance Constraint System
// Authoritative physics constraint solver for adjacent player connections

const CONSTANTS_CHAIN = typeof require !== "undefined"
  ? (function() {
      try { return require("../game-state/GameState"); } catch (e) { return require("./constants"); }
    })()
  : window.CONSTANTS;

class ChainSystem {
  constructor(world, config = {}) {
    this.world = world;
    this.config = {
      enabled: config.enabled !== undefined ? !!config.enabled : false,
      maxDistance: Number(config.maxDistance) || (CONSTANTS_CHAIN.CHAIN_DEFAULT_MAX_DISTANCE || 120),
      minDistance: Number(config.minDistance) || (CONSTANTS_CHAIN.CHAIN_DEFAULT_MIN_DISTANCE || 35),
      strength: Number(config.strength) !== undefined ? Number(config.strength) : (CONSTANTS_CHAIN.CHAIN_DEFAULT_STRENGTH || 0.8)
    };

    // Active adjacent links: [ { p1: id1, p2: id2, dist: number, tension: number } ]
    this.links = [];
    this.rebuild();
  }

  setEnabled(enabled) {
    this.config.enabled = !!enabled;
    if (!this.config.enabled) {
      this.links = [];
    } else {
      this.rebuild();
    }
  }

  // Safely rebuild adjacent chain connections strictly ordered by player slot
  // P1 <-> P2 <-> P3 <-> ... <-> PN
  rebuild() {
    this.links = [];
    if (!this.config.enabled || !this.world || !this.world.players) {
      return;
    }

    // Filter alive players and sort ascending by slot/index
    const activePlayers = Array.from(this.world.players.values())
      .filter((p) => p && !p.isDead)
      .sort((a, b) => (a.slot || 0) - (b.slot || 0));

    if (activePlayers.length < 2) {
      return;
    }

    // Connect ONLY adjacent players
    for (let i = 0; i < activePlayers.length - 1; i++) {
      const p1 = activePlayers[i];
      const p2 = activePlayers[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const initialDist = Math.hypot(dx, dy) || 1;

      this.links.push({
        p1: p1.id,
        p2: p2.id,
        dist: initialDist,
        tension: 0
      });
    }
  }

  // Solves physical chain distance constraints and spring pull forces
  solve(dt) {
    if (!this.config.enabled || this.links.length === 0) {
      return;
    }

    const { maxDistance, minDistance, strength } = this.config;
    const iterations = 2; // Iterative relaxation for stable multi-player chains

    for (let iter = 0; iter < iterations; iter++) {
      for (const link of this.links) {
        const p1 = this.world.players.get(link.p1);
        const p2 = this.world.players.get(link.p2);

        // Discard invalid / dead / falling-in-pit player links
        if (!p1 || !p2 || p1.isDead || p2.isDead || p1.y > this.world.worldHeight || p2.y > this.world.worldHeight) {
          link.tension = 0;
          continue;
        }

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 0.0001) {
          link.dist = 0;
          link.tension = 0;
          continue;
        }

        link.dist = dist;
        const ux = dx / dist;
        const uy = dy / dist;

        // 1. Calculate tension ratio [0.0 to 1.0]
        if (dist <= minDistance) {
          link.tension = 0;
        } else if (dist < maxDistance) {
          link.tension = (dist - minDistance) / (maxDistance - minDistance);
        } else {
          link.tension = 1.0;
        }

        // Mass / Anchor weights: Grounded players act as heavier anchors
        let w1 = 0.5;
        let w2 = 0.5;
        if (p1.onGround && !p2.onGround) {
          w1 = 0.18;
          w2 = 0.82;
        } else if (!p1.onGround && p2.onGround) {
          w1 = 0.82;
          w2 = 0.18;
        }

        // 2. Smooth spring pull force when beyond minDistance
        if (dist > minDistance && dist < maxDistance && iter === 0) {
          const pullIntensity = link.tension * strength * 240 * dt;
          p1.vx += ux * pullIntensity * w1 * 60;
          p1.vy += uy * pullIntensity * w1 * 60;
          p2.vx -= ux * pullIntensity * w2 * 60;
          p2.vy -= uy * pullIntensity * w2 * 60;
        }

        // 3. Hard maximum distance constraint
        if (dist > maxDistance) {
          const excess = dist - maxDistance;
          // Clamp per-iteration displacement to maintain stability & prevent tunneling
          const maxCorrection = 24.0;
          const correction = Math.min(excess, maxCorrection);

          p1.x += ux * correction * w1;
          p1.y += uy * correction * w1;
          p2.x -= ux * correction * w2;
          p2.y -= uy * correction * w2;

          // 4. Relative velocity damping along the separation axis
          const relVx = p2.vx - p1.vx;
          const relVy = p2.vy - p1.vy;
          const separatingSpeed = relVx * ux + relVy * uy;

          if (separatingSpeed > 0) {
            // Moving apart: cancel separating velocity component
            p1.vx += ux * separatingSpeed * w1;
            p1.vy += uy * separatingSpeed * w1;
            p2.vx -= ux * separatingSpeed * w2;
            p2.vy -= uy * separatingSpeed * w2;
          }

          // 5. Restrain infinite upward flight when tethered to a grounded anchor below
          if (p1.onGround && p2.vy < 0 && p2.y < p1.y) {
            p2.vy = Math.max(p2.vy, -140);
          }
          if (p2.onGround && p1.vy < 0 && p1.y < p2.y) {
            p1.vy = Math.max(p1.vy, -140);
          }
        }
      }
    }
  }

  // Serializes active chain link data for 30Hz network snapshot broadcast
  getSnapshotData() {
    return {
      enabled: this.config.enabled,
      maxDistance: this.config.maxDistance,
      minDistance: this.config.minDistance,
      links: this.links.map((l) => ({
        p1: l.p1,
        p2: l.p2,
        dist: Math.round(l.dist * 10) / 10,
        tension: Math.round(l.tension * 100) / 100
      }))
    };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = ChainSystem;
} else if (typeof window !== "undefined") {
  window.ChainSystem = ChainSystem;
}
