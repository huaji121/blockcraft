import * as THREE from 'three';
import { Chunk } from './chunk';
import { TerrainNoise } from './noise';
import { BlockType, BLOCK_DATA, ALL_BLOCKS } from './blocks';
import { CHUNK_SIZE, RENDER_DISTANCE, RENDER_DISTANCE_Y, CHUNKS_PER_FRAME } from './constants';

export class World {
  private chunks: Map<string, Chunk> = new Map();
  private noise: TerrainNoise;
  private scene: THREE.Scene;
  private textureAtlas: Map<string, THREE.Texture> = new Map();
  private loader: THREE.TextureLoader;

  constructor(scene: THREE.Scene, seed: number = 42) {
    this.scene = scene;
    this.noise = new TerrainNoise(seed);
    this.loader = new THREE.TextureLoader();
    this.loadTextures();
  }

  private loadTextures(): void {
    const paths: string[] = ALL_BLOCKS.map(bt => BLOCK_DATA[bt].texture).filter(Boolean);
    paths.push('/assets/textures/block/grass_block_side.png');

    for (const path of paths) {
      const tex = this.loader.load(path);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textureAtlas.set(path, tex);
    }
  }

  private chunkKey(cx: number, cy: number, cz: number): string {
    return `${cx},${cy},${cz}`;
  }

  getChunk(cx: number, cy: number, cz: number): Chunk | undefined {
    return this.chunks.get(this.chunkKey(cx, cy, cz));
  }

  /** Get block at world coordinates */
  getBlock(wx: number, wy: number, wz: number): BlockType {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cy, cz);
    if (!chunk) return BlockType.AIR;

    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.getBlock(lx, ly, lz);
  }

  /** Set block at world coordinates */
  setBlock(wx: number, wy: number, wz: number, type: BlockType): void {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    let chunk = this.getChunk(cx, cy, cz);
    if (!chunk) return;

    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.setBlock(lx, ly, lz, type);

    this.rebuildChunk(chunk);

    if (lx === 0) this.rebuildNeighborChunk(cx - 1, cy, cz);
    if (lx === CHUNK_SIZE - 1) this.rebuildNeighborChunk(cx + 1, cy, cz);
    if (ly === 0) this.rebuildNeighborChunk(cx, cy - 1, cz);
    if (ly === CHUNK_SIZE - 1) this.rebuildNeighborChunk(cx, cy + 1, cz);
    if (lz === 0) this.rebuildNeighborChunk(cx, cy, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.rebuildNeighborChunk(cx, cy, cz + 1);
  }

  private rebuildNeighborChunk(cx: number, cy: number, cz: number): void {
    const chunk = this.getChunk(cx, cy, cz);
    if (chunk) this.rebuildChunk(chunk);
  }

  /** Generate terrain for one vertical chunk in a column */
  private generateChunk(cx: number, cy: number, cz: number): Chunk {
    const chunk = new Chunk(cx, cy, cz);
    const worldX0 = cx * CHUNK_SIZE;
    const worldY0 = cy * CHUNK_SIZE;
    const worldZ0 = cz * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = worldX0 + x;
        const wz = worldZ0 + z;
        const surfaceHeight = this.noise.getHeight(wx, wz);

        for (let y = 0; y < CHUNK_SIZE; y++) {
          const wy = worldY0 + y;

          if (wy < surfaceHeight - 3) {
            chunk.setBlock(x, y, z, BlockType.STONE);
          } else if (wy < surfaceHeight) {
            chunk.setBlock(x, y, z, BlockType.DIRT);
          } else if (wy === surfaceHeight) {
            chunk.setBlock(x, y, z, BlockType.GRASS);
          }
          // wy > surfaceHeight: AIR (default)
        }
      }
    }

    return chunk;
  }

  private rebuildChunk(chunk: Chunk): void {
    for (const mesh of chunk.meshes) {
      this.scene.remove(mesh);
    }

    chunk.buildMeshes(this.textureAtlas, (wx, wy, wz) => this.getBlock(wx, wy, wz));

    for (const mesh of chunk.meshes) {
      this.scene.add(mesh);
    }
  }

  /** Update which chunks are loaded based on player position */
  update(playerX: number, playerY: number, playerZ: number): void {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcy = Math.floor(playerY / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);

    // Collect needed chunk keys and find missing ones
    const neededChunks = new Set<string>();
    const missingChunks: { cx: number; cy: number; cz: number; dist: number }[] = [];

    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
      for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
        for (let dy = -RENDER_DISTANCE_Y; dy <= RENDER_DISTANCE_Y; dy++) {
          const cx = pcx + dx;
          const cy = pcy + dy;
          const cz = pcz + dz;
          const key = this.chunkKey(cx, cy, cz);
          neededChunks.add(key);

          if (!this.chunks.has(key)) {
            const dist = dx * dx + dy * dy + dz * dz;
            missingChunks.push({ cx, cy, cz, dist });
          }
        }
      }
    }

    // Sort by distance (closest first), then generate at most N per frame
    missingChunks.sort((a, b) => a.dist - b.dist);
    const toGenerate = missingChunks.slice(0, CHUNKS_PER_FRAME);

    for (const { cx, cy, cz } of toGenerate) {
      const chunk = this.generateChunk(cx, cy, cz);
      const key = this.chunkKey(cx, cy, cz);
      this.chunks.set(key, chunk);
      this.rebuildChunk(chunk);
    }

    // Rebuild dirty chunks
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) {
        this.rebuildChunk(chunk);
      }
    }

    // Unload distant chunks
    for (const [key, chunk] of this.chunks) {
      if (!neededChunks.has(key)) {
        for (const mesh of chunk.meshes) {
          this.scene.remove(mesh);
        }
        chunk.disposeMeshes();
        this.chunks.delete(key);
      }
    }
  }

  /** Raycast to find which block is hit */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number = 8): {
    blockPos: THREE.Vector3;
    normal: THREE.Vector3;
    blockType: BlockType;
  } | null {
    const step = new THREE.Vector3();
    const tMax = new THREE.Vector3();
    const tDelta = new THREE.Vector3();
    const blockPos = new THREE.Vector3(
      Math.floor(origin.x),
      Math.floor(origin.y),
      Math.floor(origin.z)
    );
    const normal = new THREE.Vector3();

    step.x = direction.x > 0 ? 1 : -1;
    step.y = direction.y > 0 ? 1 : -1;
    step.z = direction.z > 0 ? 1 : -1;

    tMax.x = direction.x !== 0
      ? ((direction.x > 0 ? Math.floor(origin.x) + 1 : Math.floor(origin.x)) - origin.x) / direction.x
      : Infinity;
    tMax.y = direction.y !== 0
      ? ((direction.y > 0 ? Math.floor(origin.y) + 1 : Math.floor(origin.y)) - origin.y) / direction.y
      : Infinity;
    tMax.z = direction.z !== 0
      ? ((direction.z > 0 ? Math.floor(origin.z) + 1 : Math.floor(origin.z)) - origin.z) / direction.z
      : Infinity;

    tDelta.x = direction.x !== 0 ? Math.abs(1 / direction.x) : Infinity;
    tDelta.y = direction.y !== 0 ? Math.abs(1 / direction.y) : Infinity;
    tDelta.z = direction.z !== 0 ? Math.abs(1 / direction.z) : Infinity;

    let distance = 0;

    while (distance < maxDistance) {
      const block = this.getBlock(blockPos.x, blockPos.y, blockPos.z);
      if (block !== BlockType.AIR) {
        return {
          blockPos: blockPos.clone(),
          normal: normal.clone(),
          blockType: block,
        };
      }

      if (tMax.x < tMax.y) {
        if (tMax.x < tMax.z) {
          distance = tMax.x;
          blockPos.x += step.x;
          tMax.x += tDelta.x;
          normal.set(-step.x, 0, 0);
        } else {
          distance = tMax.z;
          blockPos.z += step.z;
          tMax.z += tDelta.z;
          normal.set(0, 0, -step.z);
        }
      } else {
        if (tMax.y < tMax.z) {
          distance = tMax.y;
          blockPos.y += step.y;
          tMax.y += tDelta.y;
          normal.set(0, -step.y, 0);
        } else {
          distance = tMax.z;
          blockPos.z += step.z;
          tMax.z += tDelta.z;
          normal.set(0, 0, -step.z);
        }
      }
    }

    return null;
  }
}
