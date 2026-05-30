# BlockCraft

A Minecraft-like voxel game built with TypeScript, Three.js, and React.

## Features

- Infinite procedurally generated voxel world (simplex noise terrain)
- 16×16×16 chunk system with spiral loading and frustum culling
- 17 block types with per-face textures and texture atlas rendering
- First-person controls: WASD movement, mouse look, jump, crouch, sprint
- Block breaking and placing with particle effects
- Item inventory system with hotbar, backpack, and creative mode
- Entity system with damage, knockback, and death particles
- Dropped items with pickup, merge, and throw mechanics
- Chat system and configurable settings (FPS, render distance, fog)

## Tech Stack

- **Rendering**: Three.js (WebGL)
- **UI**: React 19
- **Language**: TypeScript 6
- **Build**: Vite 8
- **Terrain**: simplex-noise

## Getting Started

### Prerequisites

- Node.js 18+
- Yarn

### Install

```bash
yarn install
```

### Run (development)

```bash
yarn dev
```

Open `http://localhost:5173` in your browser. Click the canvas to enter the game.

### Build (production)

```bash
yarn build
```

Output is in the `dist/` directory.

### Type Check

```bash
npx tsc --noEmit
```

## Controls

| Key | Action |
|---|---|
| W/A/S/D | Move |
| Space | Jump |
| Shift | Crouch (slow + edge protection) |
| Double-tap W / Ctrl+W | Sprint |
| Mouse move | Look around |
| Left click | Break block / Attack entity |
| Right click | Place block / Spawn entity |
| E | Open inventory |
| T | Open chat |
| Q | Throw item |
| 1-9 | Select hotbar slot |
| Scroll wheel | Cycle hotbar |
| F3 | Toggle debug overlay |
| Escape | Settings |

## Project Structure

```
src/
├── game/           # Game engine (pure TypeScript, no React)
│   ├── engine.ts   # Main loop, renderer, scene
│   ├── world.ts    # Chunk loading, terrain generation
│   ├── chunk.ts    # Block storage, mesh building
│   ├── player.ts   # First-person controller
│   ├── entities.ts # Entity system
│   ├── blocks.ts   # Block type definitions
│   ├── items.ts    # Item class hierarchy
│   ├── atlas.ts    # Texture atlas
│   ├── particles.ts# Particle effects
│   ├── noise.ts    # Terrain noise
│   ├── keybinds.ts # Key binding config
│   └── constants.ts# Tunable constants
├── components/     # React UI layer
│   ├── Game.tsx    # State hub, inventory logic
│   ├── Hotbar.tsx  # Bottom HUD bar
│   ├── Backpack.tsx# Inventory/creative panel
│   ├── BlockCube.tsx# 3D item icons
│   ├── Chat.tsx    # Chat messages
│   ├── Settings.tsx# Settings panel
│   └── DebugOverlay.tsx# FPS + coordinates
└── assets/         # Static assets
```
