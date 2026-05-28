import * as THREE from 'three';
import { Chunk } from './chunk';
import { TerrainNoise } from './noise';
import { BlockType, BLOCK_DATA } from './blocks';
import { CHUNK_SIZE, RENDER_DISTANCE, BLOCK_SIZE } from './constants';

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
    const texturePaths = [
      BLOCK_DATA[BlockType.DIRT].texture,
      BLOCK_DATA[BlockType.GRASS].texture,
      BLOCK_DATA[BlockType.STONE].texture,
    ];

    for (const path of texturePaths) {
      if (!path) continue;
      const tex = this.loader.load(path);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textureAtlas.set(path, tex);
    }
  }

  private chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(this.chunkKey(cx, cz));
  }

  /** Get block at world coordinates */
  getBlock(wx: number, wy: number, wz: number): BlockType {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return BlockType.AIR;

    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.getBlock(lx, wy, lz);
  }

  /** Set block at world coordinates */
  setBlock(wx: number, wy: number, wz: number, type: BlockType): void {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    let chunk = this.getChunk(cx, cz);
    if (!chunk) return;

    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.setBlock(lx, wy, lz, type);

    // Rebuild this chunk
    this.rebuildChunk(chunk);

    // Rebuild neighbors if block is on chunk edge
    if (lx === 0) this.rebuildNeighborChunk(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.rebuildNeighborChunk(cx + 1, cz);
    if (lz === 0) this.rebuildNeighborChunk(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.rebuildNeighborChunk(cx, cz + 1);
  }

  private rebuildNeighborChunk(cx: number, cz: number): void {
    const chunk = this.getChunk(cx, cz);
    if (chunk) this.rebuildChunk(chunk);
  }

  /** Generate terrain for a chunk */
  private generateChunk(cx: number, cz: number): Chunk {
    const chunk = new Chunk(cx, cz);
    const worldX0 = cx * CHUNK_SIZE;
    const worldZ0 = cz * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = worldX0 + x;
        const wz = worldZ0 + z;
        const height = this.noise.getHeight(wx, wz);

        for (let y = 0; y < CHUNK_SIZE; y++) {
          if (y === 0) {
            chunk.setBlock(x, y, z, BlockType.STONE);
          } else if (y < height - 3) {
            chunk.setBlock(x, y, z, BlockType.STONE);
          } else if (y < height) {
            chunk.setBlock(x, y, z, BlockType.DIRT);
          } else if (y === height) {
            chunk.setBlock(x, y, z, BlockType.GRASS);
          }
          // y > height: AIR (default)
        }
      }
    }

    return chunk;
  }

  /** Build mesh for a chunk */
  private rebuildChunk(chunk: Chunk): void {
    // Remove old meshes from scene
    for (const mesh of chunk.meshes) {
      this.scene.remove(mesh);
    }

    // Build new meshes
    chunk.buildMeshes(this.textureAtlas, (wx, wy, wz) => this.getBlock(wx, wy, wz));

    // Add new meshes to scene
    for (const mesh of chunk.meshes) {
      this.scene.add(mesh);
    }
  }

  /** Update which chunks are loaded based on player position */
  update(playerX: number, playerZ: number): void {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);

    const neededChunks = new Set<string>();

    // Load chunks in render distance
    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
      for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = this.chunkKey(cx, cz);
        neededChunks.add(key);

        if (!this.chunks.has(key)) {
          const chunk = this.generateChunk(cx, cz);
          this.chunks.set(key, chunk);
          this.rebuildChunk(chunk);
        } else {
          const chunk = this.chunks.get(key)!;
          if (chunk.dirty) {
            this.rebuildChunk(chunk);
          }
        }
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
    // DDA voxel traversal
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
