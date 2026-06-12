import * as THREE from 'three';
import { Chunk } from './chunk';
import { TerrainNoise } from './noise';
import { BlockType, BLOCK_DATA, ALL_BLOCKS, BLOCK_TEXTURE_TINTS, BLOCK_COMPOSITES } from './blocks';
import { CHUNK_SIZE, RENDER_DISTANCE, RENDER_DISTANCE_Y, UNLOAD_HYSTERESIS, CHUNKS_PER_FRAME } from './constants';
import { TextureAtlas } from './atlas';
import { BiomeType, BIOME_DATA, getBiomeFromTemperature } from './biome';

export class World {
  private chunks: Map<string, Chunk> = new Map();
  private noise: TerrainNoise;
  private scene: THREE.Scene;
  private atlas: TextureAtlas;
  private individualTextures: Map<string, THREE.Texture> = new Map();
  private loader: THREE.TextureLoader;
  private renderDistance: number = RENDER_DISTANCE;
  private chunksPerFrame: number = CHUNKS_PER_FRAME;
  private ready: boolean = false;

  // Dirty chunk tracking: only rebuild chunks that need it
  private dirtyChunks: Set<Chunk> = new Set();

  constructor(scene: THREE.Scene, seed: number = 42) {
    this.scene = scene;
    this.noise = new TerrainNoise(seed);
    this.loader = new THREE.TextureLoader();

    const paths = new Set<string>();
    for (const bt of ALL_BLOCKS) {
      const data = BLOCK_DATA[bt];
      if (data.texture) paths.add(data.texture);
      if (data.faceTextures) {
        paths.add(data.faceTextures.top);
        paths.add(data.faceTextures.bottom);
        paths.add(data.faceTextures.side);
        if (data.faceTextures.sideOverlay) paths.add(data.faceTextures.sideOverlay);
      }
    }

    this.atlas = new TextureAtlas(this.loader);
    this.atlas.build([...paths], () => {
      Chunk.initMaterials(this.atlas);
      this.ready = true;
      for (const chunk of this.chunks.values()) chunk.dirty = true;
    }, new Map(Object.entries(BLOCK_TEXTURE_TINTS)), new Map(Object.entries(BLOCK_COMPOSITES)));

    for (const path of paths) {
      // Composite paths are virtual — skip individual texture loading
      if (BLOCK_COMPOSITES[path]) continue;
      const tint = BLOCK_TEXTURE_TINTS[path];
      const tex = tint
        ? TextureAtlas.createTintedTexture(path, tint)
        : this.loader.load(path);
      if (!tint) {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;
      }
      this.individualTextures.set(path, tex);
    }

    // Load destroy stage overlays (destroy_stage_0..9)
    for (let i = 0; i <= 9; i++) {
      const path = `/assets/textures/block/destroy_stage_${i}.png`;
      const tex = this.loader.load(path);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.individualTextures.set(path, tex);
    }
  }

  setRenderDistance(distance: number): void { this.renderDistance = distance; }
  setChunksPerFrame(count: number): void { this.chunksPerFrame = count; }
  getTexture(path: string): THREE.Texture | null {
    // Composite paths (e.g. __composite/grass_side) exist only in the atlas —
    // resolve to the base texture for standalone use (particles, etc.).
    const resolved = BLOCK_COMPOSITES[path]?.base ?? path;
    return this.individualTextures.get(resolved) ?? null;
  }

  /** Get the biome at a world (x, z) column. */
  getBiomeAt(wx: number, wz: number): BiomeType {
    const temperature = this.noise.getTemperature(wx, wz);
    return getBiomeFromTemperature(temperature);
  }

  private chunkKey(cx: number, cy: number, cz: number): string {
    return `${cx},${cy},${cz}`;
  }

  getChunk(cx: number, cy: number, cz: number): Chunk | undefined {
    return this.chunks.get(this.chunkKey(cx, cy, cz));
  }

  getBlock(wx: number, wy: number, wz: number): BlockType {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cy, cz);
    // Unloaded chunks are treated as opaque solid — prevents boundary faces
    // from being rendered into empty space, and stops BFS propagation
    if (!chunk) return BlockType.BEDROCK;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.getBlock(lx, ly, lz);
  }

  setBlock(wx: number, wy: number, wz: number, type: BlockType): void {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cy, cz);
    if (!chunk) return;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.setBlock(lx, ly, lz, type);
    this.markDirty(chunk);
    if (lx === 0) this.markNeighborDirty(cx - 1, cy, cz);
    if (lx === CHUNK_SIZE - 1) this.markNeighborDirty(cx + 1, cy, cz);
    if (ly === 0) this.markNeighborDirty(cx, cy - 1, cz);
    if (ly === CHUNK_SIZE - 1) this.markNeighborDirty(cx, cy + 1, cz);
    if (lz === 0) this.markNeighborDirty(cx, cy, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markNeighborDirty(cx, cy, cz + 1);
  }

  private markDirty(chunk: Chunk): void {
    chunk.dirty = true;
    this.dirtyChunks.add(chunk);
  }

  private markNeighborDirty(cx: number, cy: number, cz: number): void {
    const chunk = this.getChunk(cx, cy, cz);
    if (chunk) this.markDirty(chunk);
  }

  private generateChunk(cx: number, cy: number, cz: number): Chunk {
    const chunk = new Chunk(cx, cy, cz);
    const worldX0 = cx * CHUNK_SIZE;
    const worldY0 = cy * CHUNK_SIZE;
    const worldZ0 = cz * CHUNK_SIZE;

    // Merged terrain + ore generation: cache surfaceHeight per column
    const surfaceMap = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE); // local_y of surface, 255 = below chunk
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = worldX0 + x;
        const wz = worldZ0 + z;
        const surfaceHeight = this.noise.getHeight(wx, wz);
        const localSurfaceY = surfaceHeight - worldY0;
        const biome = this.getBiomeAt(wx, wz);
        const biomeData = BIOME_DATA[biome];

        // Record surface position for tree placement (only if surface is inside this chunk)
        if (localSurfaceY >= 0 && localSurfaceY < CHUNK_SIZE) {
          surfaceMap[x + z * CHUNK_SIZE] = localSurfaceY;
        } else {
          surfaceMap[x + z * CHUNK_SIZE] = 255;
        }

        for (let y = 0; y < CHUNK_SIZE; y++) {
          const wy = worldY0 + y;
          if (wy < surfaceHeight - biomeData.subsurfaceDepth) {
            // Stone layer — check for ore placement inline
            const h = this.oreHash(wx, wy, wz);
            let blockType = BlockType.STONE;
            if (wy < 16 && h < 8) blockType = BlockType.DIAMOND_ORE;
            else if (wy < 32 && h < 16) blockType = BlockType.GOLD_ORE;
            else if (wy < 48 && h < 24) blockType = BlockType.IRON_ORE;
            else if (h < 32) blockType = BlockType.COAL_ORE;
            chunk.setBlock(x, y, z, blockType);
          } else if (wy < surfaceHeight) {
            chunk.setBlock(x, y, z, biomeData.subsurfaceBlock);
          } else if (wy === surfaceHeight) {
            chunk.setBlock(x, y, z, biomeData.surfaceBlock);
          }
        }
      }
    }

    // Tree placement — only where the full canopy fits inside this chunk
    for (let x = 1; x < CHUNK_SIZE - 1; x++) {
      for (let z = 1; z < CHUNK_SIZE - 1; z++) {
        const localSurfaceY = surfaceMap[x + z * CHUNK_SIZE];
        if (localSurfaceY === 255) continue;              // surface not in this chunk
        if (localSurfaceY + 5 >= CHUNK_SIZE) continue;    // tree top would exceed chunk ceiling

        const wx = worldX0 + x;
        const wz = worldZ0 + z;
        const groundY = worldY0 + localSurfaceY;

        // Must be grass and pass the biome tree-density check
        if (chunk.getBlock(x, localSurfaceY, z) !== BlockType.GRASS) continue;
        const biome = this.getBiomeAt(wx, wz);
        if (BIOME_DATA[biome].treeDensity <= 0) continue;
        if (this.treeHash(wx, wz) >= 8) continue; // 8/1000 ≈ 1 tree per chunk

        this.placeTree(chunk, wx, groundY, wz);
      }
    }

    chunk.buildMeshes(
      this.atlas,
      (wx, wy, wz) => this.getBlock(wx, wy, wz),
      (wx, wz) => this.getBiomeAt(wx, wz),
    );
    chunk.computeFaceSolidity((wx, wy, wz) => this.getBlock(wx, wy, wz));
    chunk.dirty = false;
    return chunk;
  }

  /** Simple hash for ore placement — deterministic from world coordinates */
  private oreHash(x: number, y: number, z: number): number {
    let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
    h = ((h ^ (h >> 13)) * 1103515245) | 0;
    return ((h ^ (h >> 16)) & 0x7fffffff) % 1000;
  }

  /** Deterministic hash for tree placement at (x, z). */
  private treeHash(x: number, z: number): number {
    let h = (x * 374761393 + z * 668265263) | 0;
    h = ((h ^ (h >> 13)) * 1103515245) | 0;
    return ((h ^ (h >> 16)) & 0x7fffffff) % 1000;
  }

  /** Place a small oak tree at world position (tx, groundY, tz).
   *  All blocks must fit within the given chunk — caller must verify. */
  private placeTree(chunk: Chunk, tx: number, groundY: number, tz: number): void {
    const worldX0 = chunk.cx * CHUNK_SIZE;
    const worldY0 = chunk.cy * CHUNK_SIZE;
    const worldZ0 = chunk.cz * CHUNK_SIZE;
    const toLocal = (w: number, base: number) => ((w % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    const lx = toLocal(tx, worldX0);
    const lz = toLocal(tz, worldZ0);
    const trunkBase = toLocal(groundY + 1, worldY0); // first log block above grass
    const trunkTop = trunkBase + 3;                    // 4-block-tall trunk (indices base .. base+3)

    // Trunk
    for (let y = trunkBase; y <= trunkTop; y++) {
      chunk.setBlock(lx, y, lz, BlockType.OAK_LOG);
    }

    // ── Canopy (3 layers around / above the trunk top) ──

    // Layer 1 — trunk-top minus 1: plus-shaped leaves (N/S/E/W)
    const ly = trunkTop - 1;
    chunk.setBlock(lx - 1, ly, lz, BlockType.OAK_LEAVES);
    chunk.setBlock(lx + 1, ly, lz, BlockType.OAK_LEAVES);
    chunk.setBlock(lx, ly, lz - 1, BlockType.OAK_LEAVES);
    chunk.setBlock(lx, ly, lz + 1, BlockType.OAK_LEAVES);

    // Layer 2 — at trunk top: 3×3 ring (8 leaves around the log centre)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue; // centre is trunk
        chunk.setBlock(lx + dx, trunkTop, lz + dz, BlockType.OAK_LEAVES);
      }
    }

    // Layer 3 — one above trunk top: plus-shaped + centre cap
    const topY = trunkTop + 1;
    chunk.setBlock(lx, topY, lz, BlockType.OAK_LEAVES);          // centre
    chunk.setBlock(lx - 1, topY, lz, BlockType.OAK_LEAVES);
    chunk.setBlock(lx + 1, topY, lz, BlockType.OAK_LEAVES);
    chunk.setBlock(lx, topY, lz - 1, BlockType.OAK_LEAVES);
    chunk.setBlock(lx, topY, lz + 1, BlockType.OAK_LEAVES);
  }

  private rebuildChunk(chunk: Chunk): void {
    for (const mesh of chunk.meshes) this.scene.remove(mesh);
    chunk.buildMeshes(
      this.atlas,
      (wx, wy, wz) => this.getBlock(wx, wy, wz),
      (wx, wz) => this.getBiomeAt(wx, wz),
    );
    chunk.computeFaceSolidity((wx, wy, wz) => this.getBlock(wx, wy, wz));
    for (const mesh of chunk.meshes) this.scene.add(mesh);
  }

  update(playerX: number, playerY: number, playerZ: number): void {
    if (!this.ready) return;

    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcy = Math.floor(playerY / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);

    const unloadDist = this.renderDistance + UNLOAD_HYSTERESIS;

    // Phase 1: Generate new chunks (spiral order, limited per frame)
    let generated = 0;
    genLoop:
    for (let r = 0; r <= this.renderDistance; r++) {
      // Spiral perimeter at radius r
      const positions: [number, number][] = [[0, 0]];
      if (r > 0) {
        for (let x = -r; x <= r; x++) positions.push([x, -r]);
        for (let z = -r + 1; z <= r; z++) positions.push([r, z]);
        for (let x = r - 1; x >= -r; x--) positions.push([x, r]);
        for (let z = r - 1; z >= -r + 1; z--) positions.push([-r, z]);
      }

      for (const [dx, dz] of positions) {
        for (let dy = -RENDER_DISTANCE_Y; dy <= RENDER_DISTANCE_Y; dy++) {
          if (generated >= this.chunksPerFrame) break genLoop;

          const cx = pcx + dx;
          const cy = pcy + dy;
          const cz = pcz + dz;
          const key = this.chunkKey(cx, cy, cz);

          if (this.chunks.has(key)) continue;

          const chunk = this.generateChunk(cx, cy, cz);
          this.chunks.set(key, chunk);
          // generateChunk already built meshes and computed faceSolidity
          for (const mesh of chunk.meshes) this.scene.add(mesh);

          // Mark neighboring chunks as dirty so their boundary faces update
          this.markNeighborDirty(cx - 1, cy, cz);
          this.markNeighborDirty(cx + 1, cy, cz);
          this.markNeighborDirty(cx, cy - 1, cz);
          this.markNeighborDirty(cx, cy + 1, cz);
          this.markNeighborDirty(cx, cy, cz - 1);
          this.markNeighborDirty(cx, cy, cz + 1);

          generated++;
        }
      }
    }

    // Phase 2: Rebuild only dirty chunks (O(dirty), not O(all chunks))
    for (const chunk of this.dirtyChunks) {
      this.rebuildChunk(chunk);
      this.dirtyChunks.delete(chunk);
    }

    // Phase 3: BFS occlusion culling
    const visible = this.computeVisibleChunks(pcx, pcy, pcz);
    for (const [key, chunk] of this.chunks) {
      const isVisible = visible.has(key);
      for (const mesh of chunk.meshes) {
        mesh.visible = isVisible;
      }
    }

    // Phase 4: Unload distant chunks
    for (const [key, chunk] of this.chunks) {
      const dist = Math.max(
        Math.abs(chunk.cx - pcx),
        Math.abs(chunk.cy - pcy),
        Math.abs(chunk.cz - pcz),
      );
      if (dist > unloadDist) {
        for (const mesh of chunk.meshes) this.scene.remove(mesh);
        chunk.disposeMeshes();
        this.dirtyChunks.delete(chunk);
        this.chunks.delete(key);
      }
    }
  }

  /** BFS from player chunk through non-solid faces to find visible chunks.
   *  Optimized: pre-compute dirs/opposite arrays, minimize chunkKey calls. */
  private computeVisibleChunks(pcx: number, pcy: number, pcz: number): Set<string> {
    const visible = new Set<string>();
    const queue: [number, number, number][] = [[pcx, pcy, pcz]];
    const maxBfsDist = this.renderDistance + 1;

    // Face directions and their opposite indices
    // 0=+Y, 1=-Y, 2=+X, 3=-X, 4=+Z, 5=-Z
    const dirs: [number, number, number][] = [
      [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
    ];
    const opposite = [1, 0, 3, 2, 5, 4];

    let head = 0;
    while (head < queue.length) {
      const [cx, cy, cz] = queue[head++];
      const key = this.chunkKey(cx, cy, cz);
      if (visible.has(key)) continue;
      visible.add(key);

      const chunk = this.chunks.get(key);

      for (let face = 0; face < 6; face++) {
        const [dx, dy, dz] = dirs[face];
        const nx = cx + dx;
        const ny = cy + dy;
        const nz = cz + dz;

        // Distance check
        if (Math.abs(nx - pcx) > maxBfsDist || Math.abs(nz - pcz) > maxBfsDist) continue;
        if (Math.abs(ny - pcy) > RENDER_DISTANCE_Y + 1) continue;

        // Pre-compute neighbor key to avoid double chunkKey call
        const nKey = this.chunkKey(nx, ny, nz);
        if (visible.has(nKey)) continue;

        // Occlusion: stop if exit face or entry face is solid
        if (chunk && chunk.faceSolid[face]) continue;
        const neighborChunk = this.chunks.get(nKey);
        if (!neighborChunk) continue;
        if (neighborChunk.faceSolid[opposite[face]]) continue;

        queue.push([nx, ny, nz]);
      }
    }

    return visible;
  }

  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number = 8): {
    blockPos: THREE.Vector3;
    normal: THREE.Vector3;
    blockType: BlockType;
  } | null {
    const step = new THREE.Vector3();
    const tMax = new THREE.Vector3();
    const tDelta = new THREE.Vector3();
    const blockPos = new THREE.Vector3(
      Math.floor(origin.x), Math.floor(origin.y), Math.floor(origin.z)
    );
    const normal = new THREE.Vector3();

    step.x = direction.x > 0 ? 1 : -1;
    step.y = direction.y > 0 ? 1 : -1;
    step.z = direction.z > 0 ? 1 : -1;

    tMax.x = direction.x !== 0 ? ((direction.x > 0 ? Math.floor(origin.x) + 1 : Math.floor(origin.x)) - origin.x) / direction.x : Infinity;
    tMax.y = direction.y !== 0 ? ((direction.y > 0 ? Math.floor(origin.y) + 1 : Math.floor(origin.y)) - origin.y) / direction.y : Infinity;
    tMax.z = direction.z !== 0 ? ((direction.z > 0 ? Math.floor(origin.z) + 1 : Math.floor(origin.z)) - origin.z) / direction.z : Infinity;

    tDelta.x = direction.x !== 0 ? Math.abs(1 / direction.x) : Infinity;
    tDelta.y = direction.y !== 0 ? Math.abs(1 / direction.y) : Infinity;
    tDelta.z = direction.z !== 0 ? Math.abs(1 / direction.z) : Infinity;

    let distance = 0;
    while (distance < maxDistance) {
      const block = this.getBlock(blockPos.x, blockPos.y, blockPos.z);
      if (block !== BlockType.AIR) {
        return { blockPos: blockPos.clone(), normal: normal.clone(), blockType: block };
      }
      if (tMax.x < tMax.y) {
        if (tMax.x < tMax.z) {
          distance = tMax.x; blockPos.x += step.x; tMax.x += tDelta.x; normal.set(-step.x, 0, 0);
        } else {
          distance = tMax.z; blockPos.z += step.z; tMax.z += tDelta.z; normal.set(0, 0, -step.z);
        }
      } else {
        if (tMax.y < tMax.z) {
          distance = tMax.y; blockPos.y += step.y; tMax.y += tDelta.y; normal.set(0, -step.y, 0);
        } else {
          distance = tMax.z; blockPos.z += step.z; tMax.z += tDelta.z; normal.set(0, 0, -step.z);
        }
      }
    }
    return null;
  }
}
