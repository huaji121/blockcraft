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

- **engine.ts** — Top-level `GameEngine` class. Owns the Three.js renderer, scene, camera, `World`, `Player`, `ParticleManager`, and `EntityManager`. Runs the animation loop via `setTimeout` (decoupled from display refresh rate) with FPS limiting. Exposes `getPlayer()`, `getWorld()`, and `getEntities()` for React to read state.
- **world.ts** — Manages chunk lifecycle. Loads chunks in spiral order around the player (`CHUNKS_PER_FRAME` per tick), rebuilds dirty chunks, runs BFS occlusion culling, and unloads distant chunks — all in `update()`. Generates terrain with simplex noise (stone/dirt/grass layers) and ore veins (coal/iron/gold/diamond) using deterministic hash-based placement. Unloaded chunks return `BlockType.BEDROCK` from `getBlock()` to prevent boundary face leaks. Uses 3D string keys (`cx,cy,cz`).
- **chunk.ts** — 16×16×16 block storage (`Uint8Array`) + mesh builder. Builds at most 2 meshes per chunk (opaque + transparent) using shared static materials (`Chunk.opaqueMaterial` / `Chunk.transparentMaterial`) initialized once via `Chunk.initMaterials(atlas)`. `computeFaceSolidity()` checks both own face blocks AND adjacent neighbor blocks — ensures BFS propagates correctly when neighbor chunks change. `disposeMeshes()` only disposes geometry, never the shared materials.
- **player.ts** — First-person controller: WASD movement, mouse look (smoothed deltas with spike cap of 80px), jump, gravity, AABB collision, crouch (edge protection), sprint (double-tap W within 300ms), camera bob, FOV interpolation. Left-click: damage entity (5 HP + knockback) or break block — entity takes priority if closer than block. Right-click: spawn entity (spawn egg) or place block with overlap check. Communicates with React via callbacks (`setGetSelectedItemId`, `setOnBlockBreak`, `setEntityManager`).
- **entities.ts** — Entity system with per-axis collision resolution (X → Z → Y order). `Entity`: cuboid mesh, HP=20, gravity, AABB collision, 150ms damage flash, knockback. `DroppedItem`: per-face textures from item registry, 0.5s pickup delay, 60s lifetime, merges with same-type drops within 0.5 blocks, deterministic velocity via `dropHash()` (no Math.random). `EntityManager`: spawns entities/drops, raycasts against entities, handles item pickup callback, entity-entity AABB overlap push, player-entity push.
- **blocks.ts** — `BlockType` enum (world block IDs 0-16) + `BLOCK_DATA` registry. Blocks have either a single `texture` or per-face `faceTextures` (top/bottom/side). `getBlockFaceTexture()` resolves the correct path. `ALL_BLOCKS` excludes AIR.
- **items.ts** — Item class hierarchy: abstract `Item` base, `BlockItem` (wraps a `BlockType`, id = BlockType value), `SimpleItem` (non-block items), `SpawnEggItem`. `ItemRegistry` singleton maps numeric IDs to `Item` instances. Exports `Slot` interface (`{itemId, count}`), `EMPTY_ITEM_ID` (-1), `makeSlot()`, `isSlotEmpty()`. Non-block items use id ≥ 100.
- **atlas.ts** — Packs all block textures into a single canvas texture for single-material-per-chunk rendering. Returns UV coordinates (`u0, v0, u1, v1`) per texture path.
- **noise.ts** — Seeded simplex noise for terrain height generation (4 octaves, surface between y=40-70).
- **particles.ts** — Block-break particles (per-face textures, 8 per break) and death spray (red, 20 particles). Shared geometry for all particle types. Gravity + fade-out.
- **commands.ts** — Chat command system: `/help`, `/give`, `/tp`, `/pos`, `/clear`, `/kill`, `/debug rendermode`. Commands execute through a `CommandContext` interface with callbacks.
- **keybinds.ts** — Centralized key binding configuration. All key checks go through `isKey(event, binding)`.
- **constants.ts** — All tunable values: chunk size (16), render distance (8), gravity (32), jump speed (9), player speed (5), mouse sensitivity (0.002), FOV (75/85 sprint), entity push forces.

### React UI (`src/components/`)

- **Game.tsx** — Central state hub. Uses `useReducer` for inventory state (`InvState` with hotbar (9 slots) + backpack (27 slots) of `Slot`). Holds `heldItem` (mouse cursor item), settings, debug state. All inventory click/drag logic in `handleSlotClick`. Creative tab uses negative index encoding (`-1 - itemId`). Wires engine callbacks for item pickup, block break, commands, and throws. Keyboard handler dispatches UI state changes (E=inventory, T=chat, /=command, Q=throw, F3=debug, Esc=settings).
- **Backpack.tsx** — Inventory/creative panel with tabs. Uses `onMouseDown` (not `onClick`) to capture left/right click + shift state. Supports drag distribution (left click = evenly split, right click = place one per slot). `DELETE_SLOT_INDEX` (-100) is the red X slot. Creative tab iterates `ITEM_REGISTRY.allItems`.
- **Hotbar.tsx** — Bottom HUD bar, always visible. Same `onMouseDown` pattern.
- **BlockCube.tsx** — CSS 3D cube renderer for inventory item icons using per-face textures.
- **Chat.tsx** — Chat input with up/down arrow history (50 entries max), idle fade-out (10s delay, 3s duration), `/` command prefix support.
- **Settings.tsx** — FPS limit, chunks/frame, render distance, fog density sliders.
- **DebugOverlay.tsx** — FPS + coordinates (F3 toggle).

### Key Patterns

- The game engine uses `setTimeout` for its animation loop (not `requestAnimationFrame`), decoupled from display refresh. React reads engine state (player position, FPS) via refs and `requestAnimationFrame` polling.
- Inventory uses a shared `Slot` type (`{itemId: number, count: number}`) from `items.ts`. `EMPTY_ITEM_ID = -1` marks empty slots.
- Inventory actions are dispatched through `useReducer` with typed actions (`CLICK_SLOT`, `PLACE_ONE`, `PICK_HALF`, `QUICK_MOVE`, `DELETE_ITEM`, `ADD_TO_BACKPACK`, `DISTRIBUTE_LEFT`, `DISTRIBUTE_RIGHT`). The reducer returns new state; React's `heldItem` state is managed separately in the component.
- Block placement uses the player's `getSelectedItemId` callback, which reads `hotbarRef.current[selectedSlotRef.current].itemId`. The player resolves itemId → BlockType via `ITEM_REGISTRY` for world placement.
- Left-click on entities deals 5 damage + knockback with a 150ms red flash. Right-click with spawn egg (itemId 100) spawns an entity on top of the hit block.
- Chunk mesh building uses a texture atlas (single material per chunk) with per-face UV mapping. Transparent blocks (glass) get a separate mesh with `alphaTest`, `depthWrite: false`, and `polygonOffset`. Shared materials (`Chunk.opaqueMaterial`/`Chunk.transparentMaterial`) are created once via `Chunk.initMaterials()` and reused by all chunks — never dispose them.
- BFS occlusion culling (`world.ts:computeVisibleChunks`) starts from the player's chunk and propagates through non-solid faces. `Chunk.faceSolid[6]` is precomputed per-face solidity (checks both own blocks AND neighbor blocks). This prevents rendering chunks behind solid walls.
- Dropped items use deterministic velocity via `DroppedItem.dropHash()` — no `Math.random()` in entity code. `Math.random()` is only used for visual particles.
- Entity-entity collision resolves per-axis (X → Z → Y). Falling onto an entity snaps on top (like landing on a block). Lateral overlap pushes out along the XZ direction vector.
- World ↔ chunk coordinate conversion: `chunkKey = "cx,cy,cz"` where `cx = Math.floor(wx / CHUNK_SIZE)`. Local coords: `lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE` (handles negatives).

## Textures

All block textures are in `public/assets/textures/block/` (18 Minecraft Java Edition 16×16 PNGs). Rendered with `nearest` filtering for pixel-art style. The `public/assets/textures/items/` directory exists but is empty — item textures currently reuse block textures.

## TypeScript Notes

- `verbatimModuleSyntax` is enabled — use `import type` for type-only imports
- `noUnusedLocals` and `noUnusedParameters` are enforced
- React Compiler is enabled via Babel preset — no need for manual `useMemo`/`useCallback` optimization (but they are used in Game.tsx for stable callback refs)
