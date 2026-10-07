// PICO PARK Web Canvas Renderer

class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });

    this.width = CONSTANTS.WINDOW_WIDTH;
    this.height = CONSTANTS.WINDOW_HEIGHT;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.spriteSheet = new Image();
    this.spriteSheetLoaded = false;
    this.tintedSheets = new Map(); // colorHex -> offscreenCanvas

    this.cameraX = 0;
    this.cameraY = 0;

    this.particles = [];
    this.emotes = []; // { playerId, text, expiresAt }
    this.cachedTiles = new Map();
    this.showDebugOverlay = false;

    this.loadAssets();
  }

  loadAssets() {
    this.spriteSheet.src = "assets/players/player-sprites/picolecitta.png";
    this.spriteSheet.onload = () => {
      this.spriteSheetLoaded = true;
      this.prebakePlayerTints();
    };
    this.spriteSheet.onerror = () => {
      this.spriteSheet.src = "assets/sprites/picolecitta.png";
    };
  }

  // Pre-generate tinted player sprite sheets using the authentic PICO PARK shader math
  prebakePlayerTints() {
    if (!this.spriteSheetLoaded) return;

    for (const colorInfo of CONSTANTS.PLAYER_COLORS) {
      const offscreen = document.createElement("canvas");
      offscreen.width = this.spriteSheet.width;
      offscreen.height = this.spriteSheet.height;
      const offCtx = offscreen.getContext("2d");

      offCtx.drawImage(this.spriteSheet, 0, 0);
      const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
      const data = imgData.data;

      const [cr, cg, cb] = colorInfo.rgb;
      const colR = cr / 255.0;
      const colG = cg / 255.0;
      const colB = cb / 255.0;

      // Pico Park shader formula:
      // result = texColor.xxxw * input.color
      // result.xyz += texColor.zzz * input.color.xyz * 0.7
      // result.xyz += texColor.yyy
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0) continue;

        const rTex = data[i] / 255.0;     // Body mask
        const gTex = data[i + 1] / 255.0; // Eyes / mouth / grayscale
        const bTex = data[i + 2] / 255.0; // Outline shading

        let r = rTex * colR + bTex * colR * 0.7 + gTex;
        let g = rTex * colG + bTex * colG * 0.7 + gTex;
        let b = rTex * colB + bTex * colB * 0.7 + gTex;

        data[i] = Math.min(255, Math.floor(r * 255));
        data[i + 1] = Math.min(255, Math.floor(g * 255));
        data[i + 2] = Math.min(255, Math.floor(b * 255));
      }

      offCtx.putImageData(imgData, 0, 0);
      this.tintedSheets.set(colorInfo.hex, offscreen);
    }
  }

  addEmote(playerId, text) {
    this.emotes = this.emotes.filter((e) => e.playerId !== playerId);
    this.emotes.push({
      playerId,
      text,
      createdAt: Date.now(),
      expiresAt: Date.now() + 2500
    });
  }

  spawnConfetti(x, y) {
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 300 + 100;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 150,
        color: CONSTANTS.PLAYER_COLORS[Math.floor(Math.random() * CONSTANTS.PLAYER_COLORS.length)].hex,
        size: Math.random() * 6 + 4,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 10,
        life: 2.0,
        maxLife: 2.0
      });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt; // gravity
      p.rotation += p.rotSpeed * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(stage, snapshot, localPlayerId, dt = 0.016, perfMetrics = null) {
    const ctx = this.ctx;

    this.updateParticles(dt);

    // Clean viewport background (authentic light warm beige/off-white)
    ctx.fillStyle = "#fcf9f2";
    ctx.fillRect(0, 0, this.width, this.height);

    if (!stage || !snapshot) {
      ctx.fillStyle = "#666";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Loading stage...", this.width / 2, this.height / 2);
      return;
    }

    // Camera update
    if (stage.width * stage.chipSize > this.width) {
      // Calculate center of players
      if (snapshot.players && snapshot.players.length > 0) {
        const avgX = snapshot.players.reduce((sum, p) => sum + p.x, 0) / snapshot.players.length;
        const targetCamX = avgX - this.width / 2;
        const maxCamX = stage.width * stage.chipSize - this.width;
        this.cameraX += (Math.max(0, Math.min(maxCamX, targetCamX)) - this.cameraX) * 0.1;
      }
    } else {
      this.cameraX = 0;
    }

    ctx.save();
    ctx.translate(-Math.floor(this.cameraX), 0);

    // 1. Render Tilemap
    this.renderTilemap(stage);

    // 1b. Render Solid Platforms (Rect blocks such as stairs/pillars)
    this.renderPlatforms(stage.actors ? stage.actors.platforms : []);

    // 1b2. Render JumpStands (Trampolines/Springs)
    this.renderJumpStands(snapshot.jumpStands || (stage.actors ? stage.actors.jumpStands : []));

    // 1c. Render Hazard Spikes
    this.renderSpikes(stage.actors ? stage.actors.spikes : []);

    // 2. Render Bridges & Gates
    this.renderBridges(snapshot.bridges, stage.chipSize, stage.actors ? stage.actors.bridges : []);

    // 3. Render Switches
    this.renderSwitches(stage.actors ? stage.actors.switches : [], snapshot.switches);

    // 4. Render Goal Door
    if (stage.actors && stage.actors.goal) {
      this.renderGoal(stage.actors.goal, snapshot.goal, stage);
    }

    // 5. Render Boxes
    this.renderBoxes(snapshot.boxes);

    // 6. Render Keys
    if (snapshot.keys && snapshot.keys.length > 0) {
      for (const k of snapshot.keys) {
        this.renderKey(k);
      }
    } else if (snapshot.key) {
      this.renderKey(snapshot.key);
    }

    // 6b. Render Chains / Ropes (drawn underneath players so anchor rings connect naturally)
    if (snapshot.chain && snapshot.chain.enabled && snapshot.chain.links) {
      this.renderChains(snapshot.chain, snapshot.players);
    }

    // 7. Render Players
    this.renderPlayers(snapshot.players, localPlayerId);

    // 8. Render Particles / Confetti
    this.renderParticles();

    ctx.restore();

    // 9. Render HUD & Overlays in screen space
    this.renderHUD(stage, snapshot, localPlayerId, perfMetrics);
  }

  renderTilemap(stage) {
    const ctx = this.ctx;
    const { grid, width, height, chipSize } = stage;
    if (!grid) return;

    const startCol = Math.max(0, Math.floor(this.cameraX / chipSize));
    const endCol = Math.min(width, Math.ceil((this.cameraX + this.width) / chipSize) + 1);

    const isGreenTheme = stage.name === "stage_time_trampoline";
    ctx.fillStyle = isGreenTheme ? "#58a023" : "#374151";
    ctx.strokeStyle = isGreenTheme ? "#46811c" : "#1f2937";
    ctx.lineWidth = 1;

    for (let x = startCol; x < endCol; x++) {
      for (let y = 0; y < height; y++) {
        const tile = grid[y][x];
        if (CONSTANTS.isSolidTile(tile)) {
          const px = x * chipSize;
          const py = y * chipSize;

          ctx.fillRect(px, py, chipSize, chipSize);
          // Clean inner bevel / border
          ctx.strokeRect(px + 0.5, py + 0.5, chipSize - 1, chipSize - 1);
        }
      }
    }
  }

  renderPlatforms(platforms) {
    if (!platforms || platforms.length === 0) return;
    const ctx = this.ctx;

    for (const p of platforms) {
      const px = p.x - p.w / 2;
      const py = p.y - p.h / 2;

      if (p.color === "cyan") {
        ctx.fillStyle = "#4ed5fc";
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(px, py, p.w, p.h, 12);
        } else {
          ctx.rect(px, py, p.w, p.h);
        }
        ctx.fill();
        ctx.stroke();
      } else if (p.color === "green") {
        ctx.fillStyle = "#58a023";
        ctx.strokeStyle = "#46811c";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(px, py, p.w, p.h, 6);
        } else {
          ctx.rect(px, py, p.w, p.h);
        }
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = "#374151";
        ctx.strokeStyle = "#1f2937";
        ctx.lineWidth = 1;
        ctx.fillRect(px, py, p.w, p.h);
        ctx.strokeRect(px + 0.5, py + 0.5, p.w - 1, p.h - 1);
      }
    }
  }

  renderJumpStands(jumpStands) {
    if (!jumpStands || jumpStands.length === 0) return;
    const ctx = this.ctx;

    for (const js of jumpStands) {
      const jx = js.x;
      const jy = js.y;
      const jw = js.w || 36;
      const jh = js.h || 24;
      const comp = js.compressed ? Math.min(8, js.compressed * 25) : 0;

      const topY = jy - jh / 2 + comp;
      const botY = jy + jh / 2;
      const midY = (topY + botY) / 2;

      ctx.save();
      // Green color matching Pico Park jump stands: #58a023
      ctx.fillStyle = "#58a023";
      ctx.strokeStyle = "#46811c";
      ctx.lineWidth = 2;

      // Top pad
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(jx - jw / 2, topY - 3, jw, 6, 2);
      } else {
        ctx.rect(jx - jw / 2, topY - 3, jw, 6);
      }
      ctx.fill();
      ctx.stroke();

      // Bottom base
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(jx - jw / 2, botY - 3, jw, 6, 2);
      } else {
        ctx.rect(jx - jw / 2, botY - 3, jw, 6);
      }
      ctx.fill();
      ctx.stroke();

      // Middle scissor / diamond spring
      ctx.beginPath();
      ctx.moveTo(jx - jw / 4, topY + 2);
      ctx.lineTo(jx + jw / 4, midY);
      ctx.lineTo(jx - jw / 4, botY - 2);

      ctx.moveTo(jx + jw / 4, topY + 2);
      ctx.lineTo(jx - jw / 4, midY);
      ctx.lineTo(jx + jw / 4, botY - 2);

      ctx.strokeStyle = "#58a023";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
  }

  renderSpikes(spikes) {
    if (!spikes || spikes.length === 0) return;
    const ctx = this.ctx;
    ctx.fillStyle = "#9ca3af"; // Silver-grey hazard spikes
    ctx.strokeStyle = "#1f2937"; // Dark border
    ctx.lineWidth = 1.5;

    for (const sp of spikes) {
      const numTeeth = Math.max(1, Math.round(sp.w / 16));
      const toothW = sp.w / numTeeth;
      const startX = sp.x - sp.w / 2;
      const baseY = sp.y + sp.h / 2;
      const tipY = sp.y - sp.h / 2;

      ctx.beginPath();
      ctx.moveTo(startX, baseY);
      for (let i = 0; i < numTeeth; i++) {
        const toothLeft = startX + i * toothW;
        const toothMid = toothLeft + toothW / 2;
        const toothRight = toothLeft + toothW;
        ctx.lineTo(toothMid, tipY);
        ctx.lineTo(toothRight, baseY);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  renderBridges(bridges, chipSize, stageBridgeDefs) {
    if (!bridges && !stageBridgeDefs) return;
    const ctx = this.ctx;
    const defMap = new Map((stageBridgeDefs || []).map((b) => [b.id, b]));

    const list = (bridges && bridges.length > 0) ? bridges : (stageBridgeDefs || []);
    for (const br of list) {
      const def = defMap.get(br.id) || {};
      const x = br.x !== undefined ? br.x : def.x;
      const y = br.y !== undefined ? br.y : def.y;
      const w = br.w !== undefined ? br.w : def.w;
      const h = br.h !== undefined ? br.h : (def.h || 16);

      if (x === undefined || y === undefined || w === undefined) continue;

      ctx.fillStyle = "#4b5563";
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
    }
  }

  renderSwitches(switchDefs, switchStates) {
    if (!switchDefs) return;
    const ctx = this.ctx;
    const stateMap = new Map((switchStates || []).map((s) => [s.id, s.isPressed]));

    for (const sw of switchDefs) {
      const isPressed = stateMap.get(sw.id) || false;
      const baseH = 8;
      const buttonH = isPressed ? 4 : 10;

      // Base plate
      ctx.fillStyle = "#4b5563";
      ctx.fillRect(sw.x - sw.w / 2, sw.y + sw.h / 2 - baseH, sw.w, baseH);

      // Button top (orange)
      ctx.fillStyle = isPressed ? "#d97706" : "#f59e0b";
      ctx.fillRect(
        sw.x - (sw.w - 8) / 2,
        sw.y + sw.h / 2 - baseH - buttonH,
        sw.w - 8,
        buttonH
      );

      // Outline
      ctx.strokeStyle = "#1f2937";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        sw.x - (sw.w - 8) / 2,
        sw.y + sw.h / 2 - baseH - buttonH,
        sw.w - 8,
        buttonH
      );
    }
  }

  renderGoal(goalDef, goalState, stage = null) {
    const ctx = this.ctx;
    const isOpen = goalState ? goalState.isOpen : false;
    const gx = goalDef.x;
    const gy = goalDef.y;
    const gw = goalDef.w || 52;
    const gh = goalDef.h || 68;

    if (stage && stage.name === "stage_time_trampoline") {
      ctx.save();
      // Outer rounded door frame matching reference image
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#58a023";
      ctx.lineWidth = 4;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(gx - gw / 2, gy - gh / 2, gw, gh, [10, 10, 0, 0]);
      } else {
        ctx.rect(gx - gw / 2, gy - gh / 2, gw, gh);
      }
      ctx.fill();
      ctx.stroke();

      // Centered green digit showing player count
      const playersInside = (goalState && goalState.playersInside) ? goalState.playersInside.length : 0;
      const countStr = isOpen ? `${playersInside || 1}` : "1";
      ctx.fillStyle = "#58a023";
      ctx.font = "bold 28px 'Courier New', monospace, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(countStr, gx, gy);
      ctx.restore();
      return;
    }

    // Door frame
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(gx - gw / 2, gy - gh / 2, gw, gh);

    // Rounded doorway arch
    ctx.beginPath();
    ctx.arc(gx, gy - gh / 2 + gw / 2, gw / 2 - 4, Math.PI, 0);
    ctx.rect(gx - gw / 2 + 4, gy - gh / 2 + gw / 2, gw - 8, gh - gw / 2 - 4);
    ctx.fillStyle = isOpen ? "#0f172a" : "#cbd5e1";
    ctx.fill();

    // If locked, draw keyhole
    if (!isOpen) {
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.arc(gx, gy - 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(gx - 2, gy - 2, 4, 12);
    } else {
      // Glow indicator
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(gx, gy - gh / 2 - 8, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderBoxes(boxes) {
    if (!boxes) return;
    const ctx = this.ctx;

    for (const b of boxes) {
      const bx = b.x - b.w / 2;
      const by = b.y - b.h / 2;

      // Wooden / colored box
      ctx.fillStyle = b.color || "#f59e0b";
      ctx.fillRect(bx, by, b.w, b.h);

      ctx.strokeStyle = "#1f2937";
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, b.w, b.h);

      // Inner diagonal cross pattern
      ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx + 4, by + 4);
      ctx.lineTo(bx + b.w - 4, by + b.h - 4);
      ctx.moveTo(bx + b.w - 4, by + 4);
      ctx.lineTo(bx + 4, by + b.h - 4);
      ctx.stroke();

      // Box weight / handle / player number
      ctx.fillStyle = "#1f2937";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = b.colorIndex !== undefined ? String(b.colorIndex + 1) : "■";
      ctx.fillText(label, b.x, b.y);
    }
  }

  renderKey(key) {
    if (!key || key.isUsed || (CONSTANTS.KEY_STATE && (key.state === CONSTANTS.KEY_STATE.KEY_USED || key.state === CONSTANTS.KEY_STATE.LEVEL_COMPLETE))) {
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(key.x, key.y);

    // Golden key
    ctx.fillStyle = "#facc15";
    ctx.strokeStyle = "#854d0e";
    ctx.lineWidth = 2;

    // Key ring
    ctx.beginPath();
    ctx.arc(0, -6, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#fcf9f2";
    ctx.beginPath();
    ctx.arc(0, -6, 3, 0, Math.PI * 2);
    ctx.fill();

    // Key shaft
    ctx.fillStyle = "#facc15";
    ctx.fillRect(-2, 0, 4, 14);
    ctx.strokeRect(-2, 0, 4, 14);

    // Key teeth
    ctx.fillRect(2, 6, 4, 3);
    ctx.fillRect(2, 11, 3, 3);

    ctx.restore();
  }

  renderChains(chainData, players) {
    if (!chainData || !chainData.enabled || !chainData.links || chainData.links.length === 0) return;
    if (!players || players.length === 0) return;

    const ctx = this.ctx;
    const playerMap = new Map();
    for (const p of players) {
      playerMap.set(p.id, p);
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const link of chainData.links) {
      const p1 = playerMap.get(link.p1);
      const p2 = playerMap.get(link.p2);
      if (!p1 || !p2) continue;

      const x1 = p1.x;
      const y1 = p1.y;
      const x2 = p2.x;
      const y2 = p2.y;

      const tension = Math.min(1.0, Math.max(0.0, link.tension !== undefined ? link.tension : 0));
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;

      // Natural gravity sag based on slack: high slack = downward catenary curve
      // When taut (tension -> 1), sag -> 0
      const sag = (1.0 - tension) * 26.0;
      const cpx = mx;
      const cpy = my + sag;

      // 1. Drop shadow for depth
      ctx.beginPath();
      ctx.moveTo(x1, y1 + 2);
      ctx.quadraticCurveTo(cpx, cpy + 2, x2, y2 + 2);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
      ctx.lineWidth = 5;
      ctx.stroke();

      // 2. Main rope outer body (dark warm rope tone matching Pico Park)
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cpx, cpy, x2, y2);
      ctx.strokeStyle = tension > 0.85 ? "#3b1e10" : "#4a3525";
      ctx.lineWidth = 4;
      ctx.stroke();

      // 3. Inner braided highlight (warm ochre/rope texture that intensifies under tension)
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cpx, cpy, x2, y2);
      ctx.strokeStyle = tension > 0.85 ? "#c2410c" : "#b45309";
      ctx.lineWidth = 2;
      ctx.stroke();

      // 4. Anchor rings / collars at player centers
      for (const [px, py] of [[x1, y1], [x2, y2]]) {
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#334155";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  renderPlayers(players, localPlayerId) {
    if (!players) return;
    const ctx = this.ctx;

    for (const p of players) {
      ctx.save();
      ctx.translate(p.x, p.y);

      if (p.facing === -1) {
        ctx.scale(-1, 1);
      }

      // Draw Cat Sprite
      this.drawCat(p);

      ctx.restore();

      // Draw Name Tag & Emotes (in world space above head)
      this.drawPlayerTag(p, p.id === localPlayerId);
    }
  }

  drawCat(p) {
    const ctx = this.ctx;
    const sheet = this.tintedSheets.get(p.color);

    if (sheet && this.spriteSheetLoaded) {
      // Determine frame based on animation state
      let frameCol = 0;
      let frameRow = 0;

      if (p.anim === "run") {
        // 2-frame walk cycle based on time
        frameCol = (Math.floor(Date.now() / 150) % 2 === 0) ? 2 : 4;
      } else if (p.anim === "jump") {
        frameCol = 5;
      } else if (p.anim === "celebrate") {
        frameCol = 10;
      } else if (p.isDead) {
        frameCol = 1;
      } else {
        frameCol = 0;
      }

      const sx = frameCol * 32 + 6;
      const sy = frameRow * 32 + 8;
      const sw = 20;
      const sh = 24;

      // Draw scaled cat: 42 x 48 px centered at (0, 0)
      ctx.drawImage(sheet, sx, sy, sw, sh, -CONSTANTS.PLAYER_WIDTH / 2, -CONSTANTS.PLAYER_HEIGHT / 2, CONSTANTS.PLAYER_WIDTH, CONSTANTS.PLAYER_HEIGHT);
    } else {
      // Procedural vector fallback with authentic PICO PARK geometry
      const pw = CONSTANTS.PLAYER_WIDTH;
      const ph = CONSTANTS.PLAYER_HEIGHT;

      // Body (rounded rect with flat base for clean feet contact)
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.roundRect(-pw / 2, -ph / 2 + 10, pw, ph - 10, [6, 6, 2, 2]);
      ctx.fill();

      // Ears (two triangles)
      ctx.beginPath();
      ctx.moveTo(-pw / 2 + 4, -ph / 2 + 10);
      ctx.lineTo(-pw / 2 + 10, -ph / 2);
      ctx.lineTo(-pw / 2 + 16, -ph / 2 + 10);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(pw / 2 - 16, -ph / 2 + 10);
      ctx.lineTo(pw / 2 - 10, -ph / 2);
      ctx.lineTo(pw / 2 - 4, -ph / 2 + 10);
      ctx.closePath();
      ctx.fill();

      // Outline
      ctx.strokeStyle = "#1f2937";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Eyes (black rectangles)
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(-6, -4, 4, 6);
      ctx.fillRect(4, -4, 4, 6);
    }
  }

  drawPlayerTag(p, isLocal) {
    const ctx = this.ctx;
    const tagY = p.y - CONSTANTS.PLAYER_HEIGHT / 2 - 12;

    // Player slot and name
    ctx.font = isLocal ? "bold 13px sans-serif" : "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    // Text background pill
    const text = `${p.slot}. ${p.name}`;
    const metrics = ctx.measureText(text);
    const bgW = metrics.width + 10;
    const bgH = 18;

    ctx.fillStyle = isLocal ? "rgba(15, 23, 42, 0.85)" : "rgba(15, 23, 42, 0.65)";
    ctx.beginPath();
    ctx.roundRect(p.x - bgW / 2, tagY - bgH, bgW, bgH, 4);
    ctx.fill();

    // Colored dot
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - bgW / 2 + 8, tagY - bgH / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Name text
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, p.x + 4, tagY - 2);

    // Active emote bubble
    const now = Date.now();
    const emote = this.emotes.find((e) => e.playerId === p.id && e.expiresAt > now);
    if (emote) {
      const bubbleY = tagY - bgH - 8;
      ctx.font = "bold 14px monospace";
      const eMetrics = ctx.measureText(emote.text);
      const bW = eMetrics.width + 16;
      const bH = 24;

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#1f2937";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(p.x - bW / 2, bubbleY - bH, bW, bH, 6);
      ctx.fill();
      ctx.stroke();

      // Tail
      ctx.beginPath();
      ctx.moveTo(p.x - 4, bubbleY);
      ctx.lineTo(p.x, bubbleY + 6);
      ctx.lineTo(p.x + 4, bubbleY);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#0f172a";
      ctx.fillText(emote.text, p.x, bubbleY - 6);
    }
  }

  renderParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1.0;
  }

  renderHUD(stage, snapshot, localPlayerId, perfMetrics = null) {
    const ctx = this.ctx;

    // Top Header Bar
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillRect(0, 0, this.width, 42);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
    ctx.beginPath();
    ctx.moveTo(0, 42);
    ctx.lineTo(this.width, 42);
    ctx.stroke();

    // Stage Name / Number
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const stageTitle = stage.name.toUpperCase().replace("_", " ");
    ctx.fillText(`STAGE: ${stageTitle}`, 24, 21);

    // Player Count
    const playerCount = snapshot.players ? snapshot.players.length : 0;
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#475569";
    ctx.textAlign = "center";
    ctx.fillText(`PLAYERS: ${playerCount}`, this.width / 2, 21);

    // Chain Mode Indicator
    if (snapshot.chain && snapshot.chain.enabled) {
      ctx.font = "bold 12px sans-serif";
      ctx.fillStyle = "#d97706";
      ctx.textAlign = "left";
      ctx.fillText("[CHAIN MODE]", this.width / 2 + 65, 21);
    }

    // Key status indicator (placed to the left of the top action buttons)
    if (snapshot.keys && snapshot.keys.length > 1) {
      const total = snapshot.keys.length;
      const isDoorOpen = snapshot.goal && snapshot.goal.isOpen;
      const acquiredCount = snapshot.keys.filter((k) =>
        k.state === CONSTANTS.KEY_STATE.KEY_CARRIED || k.state === CONSTANTS.KEY_STATE.KEY_USED || k.state === CONSTANTS.KEY_STATE.LEVEL_COMPLETE
      ).length;

      ctx.textAlign = "right";
      if (isDoorOpen) {
        ctx.fillStyle = "#2563eb";
        ctx.fillText("DOOR: UNLOCKED ✓", this.width - 310, 21);
      } else if (acquiredCount === total) {
        ctx.fillStyle = "#16a34a";
        ctx.fillText(`KEYS: ${acquiredCount}/${total} ACQUIRED ✓`, this.width - 310, 21);
      } else {
        ctx.fillStyle = acquiredCount > 0 ? "#d97706" : "#dc2626";
        ctx.fillText(`KEYS: ${acquiredCount}/${total} REQUIRED`, this.width - 310, 21);
      }
    } else if (snapshot.key) {
      const isUsed = snapshot.key.isUsed || (CONSTANTS.KEY_STATE && (snapshot.key.state === CONSTANTS.KEY_STATE.KEY_USED || snapshot.key.state === CONSTANTS.KEY_STATE.LEVEL_COMPLETE));
      const hasKey = !isUsed && (!!snapshot.key.heldBy || (CONSTANTS.KEY_STATE && snapshot.key.state === CONSTANTS.KEY_STATE.KEY_CARRIED));
      ctx.textAlign = "right";
      if (isUsed) {
        ctx.fillStyle = "#2563eb";
        ctx.fillText("DOOR: UNLOCKED ✓", this.width - 310, 21);
      } else if (hasKey) {
        ctx.fillStyle = "#16a34a";
        ctx.fillText("KEY: ACQUIRED ✓", this.width - 310, 21);
      } else {
        ctx.fillStyle = "#dc2626";
        ctx.fillText("KEY: REQUIRED ✗", this.width - 310, 21);
      }
    }

    // Countdown Timer Box (authentic Pico Park green rounded box at top center)
    if (stage.name === "stage_time_trampoline" || snapshot.timeRemaining !== null || stage.timeLimit) {
      const timeSec = snapshot.timeRemaining !== null && snapshot.timeRemaining !== undefined
        ? Math.ceil(snapshot.timeRemaining)
        : (stage.timeLimit || 25);
      const mins = Math.floor(timeSec / 60);
      const secs = timeSec % 60;
      const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

      ctx.save();
      const boxW = 180;
      const boxH = 46;
      const boxX = this.width / 2;
      const boxY = 46;

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#58a023";
      ctx.lineWidth = 4;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(boxX - boxW / 2, boxY - boxH / 2, boxW, boxH, 10);
      } else {
        ctx.rect(boxX - boxW / 2, boxY - boxH / 2, boxW, boxH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#58a023";
      ctx.font = "bold 28px 'Courier New', monospace, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(timeStr, boxX, boxY);
      ctx.restore();
    }

    // Update in-game instruction banner text if stage changed
    if (this._lastStageName !== stage.name) {
      this._lastStageName = stage.name;
      const goalEl = document.getElementById("instruction-goal-text");
      if (goalEl) {
        const HINTS = {
          stage_jump01: "Jump across gaps to collect the Key • All players enter the Goal Door!",
          stage_push02: "Push large boxes together to clear the path to the Key and Goal Door!",
          stage_time_trampoline: "TIME TRAMPOLINE • Bounce on springs, cross lifts, get the Key and reach Goal Door before time runs out!",
          stage_four_keys: "MAP 1: THE FOUR KEYS • Collect all 4 Keys (1 each) • Avoid Spikes • Escape together!",
          stage_jump02: "MAP 1: THE FOUR KEYS • Collect all 4 Keys (1 each) • Avoid Spikes • Escape together!",
          stage_push01: "Push matching colored boxes to bridge gaps and reach the Goal Door together!"
        };
        goalEl.textContent = HINTS[stage.name] || "Collect the Key, solve the puzzle, and all players enter the Goal Door!";
      }
    }

    // Performance Monitor HUD Overlay (Toggle with F3)
    if (this.showDebugOverlay && perfMetrics) {
      this.renderPerformanceHUD(perfMetrics);
    }
  }

  renderPerformanceHUD(metrics) {
    const ctx = this.ctx;
    const x = 16;
    const y = 50;
    const w = 210;
    const h = 118;

    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, 6);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = "bold 11px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    // Header
    ctx.fillStyle = "#38bdf8";
    ctx.fillText("PERFORMANCE MONITOR (F3)", x + 10, y + 8);

    // FPS
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Client FPS:", x + 10, y + 28);
    const fps = metrics.fps || 60;
    ctx.fillStyle = fps >= 55 ? "#4ade80" : fps >= 30 ? "#facc15" : "#f87171";
    ctx.fillText(`${fps} FPS`, x + 120, y + 28);

    // Ping
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Latency (RTT):", x + 10, y + 46);
    const ping = metrics.ping !== undefined ? metrics.ping : 0;
    ctx.fillStyle = ping <= 50 ? "#4ade80" : ping <= 120 ? "#facc15" : "#f87171";
    ctx.fillText(`${ping} ms`, x + 120, y + 46);

    // Server Tick Duration
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Server Tick:", x + 10, y + 64);
    const tickMs = metrics.serverTickDuration !== undefined ? metrics.serverTickDuration : 0;
    ctx.fillStyle = tickMs <= 5 ? "#4ade80" : tickMs <= 12 ? "#facc15" : "#f87171";
    ctx.fillText(`${tickMs} ms`, x + 120, y + 64);

    // Network updates
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Net Inflow:", x + 10, y + 82);
    const netRate = metrics.updatesPerSecond !== undefined ? metrics.updatesPerSecond : 30;
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`${netRate} pkt/s`, x + 120, y + 82);

    // Local prediction status
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Prediction:", x + 10, y + 98);
    ctx.fillStyle = "#38bdf8";
    ctx.fillText(metrics.predictionActive ? "0ms ACTIVE" : "OFF", x + 120, y + 98);

    ctx.restore();
  }
}

if (typeof window !== "undefined") {
  window.GameRenderer = GameRenderer;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = GameRenderer;
}
