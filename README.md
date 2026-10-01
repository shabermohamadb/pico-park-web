# PICO PARK - Web Multiplayer Edition

A web-based, real-time cooperative multiplayer conversion of **PICO PARK**, built with Node.js, WebSockets, HTML5 Canvas 2D, and authentic game assets.

---

## Features

- **Real-Time Multiplayer**: Real-time room networking with authoritative physics simulation and snapshot interpolation.
- **Authentic Gameplay & Physics**:
  - Cat physics with jumping, landing, climbing, and stacking on other players' heads.
  - Multi-player cooperative box pushing (weight-based force calculations).
  - Synchronized switches, sliding bridges, warps, and floating golden keys.
  - Goal doors that open when the key arrives and complete the level when all players enter.
- **Authentic Assets & Level Designs**:
  - Direct conversion of all 94 original Lua stages extracted from the game executable.
  - Authentic 12-world progression (`HELLO PICO PARK`, `GO TOGETHER`, `TIME LIMIT`, `GIMMICK GIMMICK`, `ALL FOR ONE`, etc.).
  - 32 original OGG audio files including background music, fanfares, jumps, switches, and clear sounds.
  - Master sprite sheet (`picolecitta.png`) with dynamic multi-channel color compositing matching the original shader.
  - Distinct player colors for up to 10 players (`Peach`, `Periwinkle`, `Cyan`, `Pastel Green`, `Sky Blue`, `Pink`, etc.).
- **Professional Web UI**:
  - Retro-modern minimalist aesthetic without AI gradients or glassmorphism.
  - Responsive 16:9 letterboxed canvas that auto-adapts to 16:9, 16:10, 21:9 ultrawide, and laptop displays.
  - Quick chat emotes (1: GO!, 2: STOP!, 3: HERE!, 4: JUMP!, 5: OK!, 6: SORRY!).
  - Audio settings with independent volume sliders for Master, Music, and SFX.

---

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation & Run

1. Clone or navigate to the project directory:
   ```bash
   cd /home/shaber/.gemini/antigravity/scratch/pico-park-web
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the game server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3001
   ```

### Multiplayer Testing

1. Open `http://localhost:3001` in Browser Window 1. Click **CREATE ROOM**. Enter your name and click **CREATE**.
2. Note the generated 6-letter Room Code (e.g. `RSWABX`).
3. Open `http://localhost:3001` in Browser Window 2 (or another computer on the same network). Click **JOIN ROOM**, enter your name and the Room Code, then click **JOIN**.
4. Both players will appear in the Lobby with distinct colors and player numbers.
5. Have players click **READY UP**, and the Host clicks **START GAME**!

---

## Controls

| Action | Keyboard |
|---|---|
| Move Left / Right | `A` / `D` or `←` / `→` |
| Jump | `Space` / `W` / `↑` |
| Quick Emotes | `1` to `6` |
| Retry Level (Host) | `R` |
| Settings & Volume | `Settings` Button |

---

## Project Structure

```
pico-park-web/
├── client/                     # Web frontend
│   ├── index.html              # Clean responsive HTML markup
│   ├── css/
│   │   └── style.css           # Modern minimalist game styling
│   ├── js/
│   │   ├── main.js             # Client lifecycle and render loop
│   │   ├── renderer.js         # Canvas 2D engine with sprite tinting
│   │   ├── network.js          # WebSocket client & snapshot interpolation
│   │   ├── audio.js            # Web Audio API sound manager
│   │   ├── input.js            # Keyboard handler (WASD/Arrows/Space)
│   │   └── ui.js               # UI screen manager & toasts
│   └── assets/
│       ├── audio/              # 32 authentic extracted OGG sound files
│       └── sprites/            # Master sprite sheet, font, and UI textures
├── server/                     # Backend authoritative server
│   ├── index.js                # Express static server & WebSocket handler
│   └── roomManager.js          # Room lifecycle, host migration & game sessions
├── shared/                     # Code shared between client and server
│   ├── constants.js            # Shared constants, tile types, and protocols
│   ├── physics.js              # Authoritative 2D physics simulation
│   ├── levelLoader.js          # Level parser and actor spawner
│   └── levels/                 # 94 converted JSON level files & manifest
├── test/
│   └── integration_test.js     # Automated multi-client test suite
├── .env.example
├── .gitignore
└── package.json
```

---

## Production Deployment

### Render / Railway / Fly.io

1. **Environment Variables**:
   - `PORT`: Provided automatically by the host (default: `3001`).
   - `NODE_ENV`: Set to `production`.
2. **Build Command**: `npm install`
3. **Start Command**: `npm start`
4. The server automatically serves both the static web frontend and WebSocket connections over the same port.
