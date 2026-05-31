# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `yarn dev` — Start Vite dev server (HMR)
- `yarn build` — Type-check with `tsc -b` then bundle with `vite build`
- `yarn lint` — Run ESLint
- `npx tsc --noEmit` — Type-check only (faster feedback loop, use this before builds)

## Architecture

This is a Minecraft-like voxel game with a strict separation between the game engine (pure TypeScript + Three.js) and the UI layer (React).

### Game Engine (`src/game/`)

All rendering, physics, and world logic lives here with zero React dependencies.

- **engine.ts** — Top-level `GameEngine` class. Owns the Three.js renderer, scene, camera, `World`, `Player`, `ParticleManager`, and `EntityManager`. Runs the animation loop with FPS limiting. Exposes `getPlayer()`, `getWorld()`, and `getEntities()` for React to read state.
- **world.ts** — Manages chunk loading/unloading around the player. Uses 3D chunk keys (`cx,cy,cz`). Loads chunks incrementally (`CHUNKS_PER_FRAME` per tick). Owns the `TextureAtlas` and individual textures for particles. Generates terrain with simplex noise (stone/dirt/grass layers) and ore veins (coal/iron/gold/diamond) using deterministic hash-based placement. BFS occlusion culling via `computeVisibleChunks()` — only renders chunks reachable through non-solid faces.
- **chunk.ts** — 16×16×16 block storage (`Uint8Array`) + mesh builder. Builds at most 2 meshes per chunk (opaque + transparent) using shared static materials (`Chunk.opaqueMaterial` / `Chunk.transparentMaterial`) initialized once via `Chunk.initMaterials(atlas)`. Face visibility determined by neighbor block transparency. `faceSolid[6]` tracks per-face solidity for BFS occlusion. `disposeMeshes()` only disposes geometry, never the shared materials.
- **player.ts** — First-person controller: WASD movement, mouse look (smoothed deltas with spike cap), jump, gravity, AABB collision, crouch (edge protection), sprint (double-tap W), camera bob. Block break/place via DDA raycasting. Communicates with React via callbacks (`setGetSelectedItemId`, `setOnBlockBreak`, `setEntityManager`). Uses `ITEM_REGISTRY` to resolve itemId → BlockType for placement.
- **entities.ts** — Entity system: `Entity` class (cuboid mesh, HP, gravity, AABB collision, damage flash, knockback), `DroppedItem` (per-face textures, pickup delay, lifetime, merge with nearby same-type drops, deterministic velocity via hash), and `EntityManager` (spawn, update, raycast against entities, item pickup callback).
- **blocks.ts** — `BlockType` enum (world block IDs 0-16) + `BLOCK_DATA` registry for chunk mesh building. Blocks can have a single `texture` or per-face `faceTextures` (top/bottom/side). `getBlockFaceTexture()` resolves the correct path.
- **items.ts** — Item class hierarchy: abstract `Item` base, `BlockItem` (wraps a `BlockType`), `SimpleItem` (non-block items like spawn egg), `SpawnEggItem`. `ItemRegistry` singleton maps numeric IDs to `Item` instances. Exports `Slot` interface (`{itemId, count}`), `EMPTY_ITEM_ID` (-1), `makeSlot()`, `isSlotEmpty()`. Block items use `BlockType` values as IDs; non-block items use 100+.
- **atlas.ts** — Packs all block textures into a single canvas texture for single-material-per-chunk rendering. Returns UV coordinates per texture path.
- **noise.ts** — Seeded simplex noise for terrain height generation (4 octaves, surface between y=40-70).
- **particles.ts** — Block-break particle system with per-face textures, gravity, fade-out. Death effect with red spray particles. Shared geometry (`sharedGeo`) for all particle types.
- **commands.ts** — Chat command system with `/help`, `/give`, `/tp`, `/pos`, `/clear`, `/kill`, `/debug rendermode`. Commands execute through a `CommandContext` interface with callbacks for inventory/teleport/entity operations.
- **keybinds.ts** — Centralized key binding configuration. All key checks go through `isKey(event, binding)`.
- **constants.ts** — All tunable values: chunk size (16), render distance (8), gravity (32), jump speed (9), player speed (5), mouse sensitivity (0.002), FOV (75/85 sprint).

### React UI (`src/components/`)

- **Game.tsx** — Central state hub. Uses `useReducer` for inventory state (`InvState` with hotbar + backpack arrays of `Slot`). Holds `heldItem` (mouse cursor item), settings, debug state. All inventory click logic lives in `handleSlotClick`. Creative tab uses negative index encoding (`-1 - itemId`). Wires engine callbacks for item pickup, block break, commands, and throws.
- **Backpack.tsx** — Inventory/creative panel with tabs. Uses `onMouseDown` (not `onClick`) to capture left/right click + shift state. Supports drag distribution (left = evenly split, right = place one per slot). `DELETE_SLOT_INDEX` (-100) is the red X slot. Creative tab iterates `ITEM_REGISTRY.allItems`.
- **Hotbar.tsx** — Bottom HUD bar, always visible. Same `onMouseDown` pattern.
- **BlockCube.tsx** — CSS 3D cube renderer for inventory item icons. Takes `itemId` prop, looks up `ITEM_REGISTRY` for textures.
- **Chat.tsx** — Chat input with up/down arrow history (50 entries max), idle fade-out (10s delay, 3s duration), `/` command prefix support.
- **Settings.tsx** — FPS limit, chunks/frame, render distance, fog density sliders.
- **DebugOverlay.tsx** — FPS + coordinates (F3 toggle).

### Key Patterns

- The game engine calls `requestAnimationFrame` independently. React reads engine state (player position, FPS) via refs and `requestAnimationFrame` polling.
- Inventory uses a shared `Slot` type (`{itemId: number, count: number}`) from `items.ts`. `EMPTY_ITEM_ID = -1` marks empty slots. `Slot.type: BlockType` is no longer used.
- Inventory actions are dispatched through `useReducer` with typed actions (`CLICK_SLOT`, `PLACE_ONE`, `PICK_HALF`, `QUICK_MOVE`, `DELETE_ITEM`, `ADD_TO_BACKPACK`, `DISTRIBUTE_LEFT`, `DISTRIBUTE_RIGHT`). The reducer returns new state; React's `heldItem` state is managed separately in the component.
- Block placement uses the player's `getSelectedItemId` callback, which reads `hotbarRef.current[selectedSlotRef.current].itemId`. The player resolves itemId → BlockType via `ITEM_REGISTRY` for world placement.
- Left-click on entities deals damage + knockback with a 150ms red flash. Right-click with spawn egg (itemId 100) spawns an entity.
- Chunk mesh building uses a texture atlas (single material per chunk) with per-face UV mapping. Transparent blocks (glass) get a separate mesh with `alphaTest` and `depthWrite: false`. Shared materials (`Chunk.opaqueMaterial`/`Chunk.transparentMaterial`) are created once via `Chunk.initMaterials()` and reused by all chunks — never dispose them.
- BFS occlusion culling (`world.ts:computeVisibleChunks`) starts from the player's chunk and propagates through non-solid faces. `Chunk.faceSolid[6]` is precomputed per-face solidity (checks both own blocks AND neighbor blocks). This prevents rendering chunks behind solid walls.
- Dropped items use deterministic velocity via `DroppedItem.dropHash()` — no `Math.random()` in entity code. `Math.random()` is only used for visual particles.

## Textures

All block textures are in `public/assets/textures/block/`. Item textures in `public/assets/textures/item/`. These are Minecraft Java Edition assets — 16×16 PNGs rendered with `nearest` filtering for pixel-art style.

## TypeScript Notes

- `verbatimModuleSyntax` is enabled — use `import type` for type-only imports
- `noUnusedLocals` and `noUnusedParameters` are enforced
- React Compiler is enabled via Babel preset — no need for manual `useMemo`/`useCallback` optimization (but they are used in Game.tsx for stable callback refs)
