import * as THREE from 'three';
import { Chunk } from './chunk';
import { TerrainNoise } from './noise';
import { BlockType, BLOCK_DATA, ALL_BLOCKS } from './blocks';
import { CHUNK_SIZE, RENDER_DISTANCE, RENDER_DISTANCE_Y, UNLOAD_HYSTERESIS, CHUNKS_PER_FRAME, MESH_UPLOADS_PER_FRAME } from './constants';
import { TextureAtlas } from './atlas';

export class World {
  private chunks: Map<string, Chunk> = new Map();
  private noise: TerrainNoise;
  private scene: THREE.Scene;
  private atlas: TextureAtlas;
  private individualTextures: Map<string, THREE.Texture> = new Map();
  private loader: THREE.TextureLoader;
  private renderDistance: number = RENDER_DISTANCE;
  private chunksPerFrame: number = CHUNKS_PER_FRAME;
  private meshUploadsPerFrame: number = MESH_UPLOADS_PER_FRAME;
  private ready: boolean = false;

  // Mesh upload queue: chunks waiting to have their meshes added to scene
  private meshQueue: Chunk[] = [];

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
      }
    }

    this.atlas = new TextureAtlas(this.loader);
    this.atlas.build([...paths], () => {
      this.ready = true;
      for (const chunk of this.chunks.values()) chunk.dirty = true;
    });

    for (const path of paths) {
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
  getTexture(path: string): THREE.Texture | null { return this.individualTextures.get(path) ?? null; }

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
    if (!chunk) return BlockType.AIR;
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
        }
      }
    }
    chunk.computeFaceSolidity((wx, wy, wz) => this.getBlock(wx, wy, wz));
    return chunk;
  }

  private rebuildChunk(chunk: Chunk): void {
    for (const mesh of chunk.meshes) this.scene.remove(mesh);
    chunk.buildMeshes(this.atlas, (wx, wy, wz) => this.getBlock(wx, wy, wz));
    chunk.computeFaceSolidity((wx, wy, wz) => this.getBlock(wx, wy, wz));
    for (const mesh of chunk.meshes) this.scene.add(mesh);
  }

  /** Spiral chunk order: yields (dx, dz) from center outward */
  private *spiralOrder(radius: number): Generator<[number, number]> {
    yield [0, 0];
    for (let r = 1; r <= radius; r++) {
      for (let x = -r; x <= r; x++) yield [x, -r];
      for (let z = -r + 1; z <= r; z++) yield [r, z];
      for (let x = r - 1; x >= -r; x--) yield [x, r];
      for (let z = r - 1; z >= -r + 1; z--) yield [-r, z];
    }
  }

  /** Chebyshev distance (max of axis distances) */
  private chebyshev(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
  }

  update(playerX: number, playerY: number, playerZ: number): void {
    if (!this.ready) return;

    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcy = Math.floor(playerY / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);

    const neededChunks = new Set<string>();
    const toGenerate: { cx: number; cy: number; cz: number; dist: number }[] = [];

    // Spiral loading: collect missing chunks in spiral order
    for (const [dx, dz] of this.spiralOrder(this.renderDistance)) {
      for (let dy = -RENDER_DISTANCE_Y; dy <= RENDER_DISTANCE_Y; dy++) {
        const cx = pcx + dx;
        const cy = pcy + dy;
        const cz = pcz + dz;
        const key = this.chunkKey(cx, cy, cz);
        neededChunks.add(key);

        if (!this.chunks.has(key)) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
          toGenerate.push({ cx, cy, cz, dist });
        }
      }
    }

    // Generate at most chunksPerFrame new chunks (already sorted by spiral = distance)
    const genBatch = toGenerate.slice(0, this.chunksPerFrame);
    for (const { cx, cy, cz } of genBatch) {
      const chunk = this.generateChunk(cx, cy, cz);
      const key = this.chunkKey(cx, cy, cz);
      this.chunks.set(key, chunk);
      this.rebuildChunk(chunk);

      // Mark neighboring chunks as dirty so their boundary faces update
      const neighbors: [number, number, number][] = [
        [cx - 1, cy, cz], [cx + 1, cy, cz],
        [cx, cy - 1, cz], [cx, cy + 1, cz],
        [cx, cy, cz - 1], [cx, cy, cz + 1],
      ];
      for (const [nx, ny, nz] of neighbors) {
        const nChunk = this.getChunk(nx, ny, nz);
        if (nChunk) nChunk.dirty = true;
      }
    }

    // Rebuild dirty chunks
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) this.rebuildChunk(chunk);
    }

    // BFS occlusion culling: only show chunks reachable through non-solid faces
    const visible = this.computeVisibleChunks(pcx, pcy, pcz);
    for (const [key, chunk] of this.chunks) {
      const isVisible = visible.has(key);
      for (const mesh of chunk.meshes) {
        mesh.visible = isVisible;
      }
    }

    // Unload distant chunks (hysteresis: unload distance = render distance + buffer)
    const unloadDist = this.renderDistance + UNLOAD_HYSTERESIS;
    for (const [key, chunk] of this.chunks) {
      if (!neededChunks.has(key)) {
        // Check if truly beyond hysteresis distance
        const dist = this.chebyshev(
          pcx, pcy, pcz,
          chunk.cx, chunk.cy, chunk.cz
        );
        if (dist > unloadDist) {
          for (const mesh of chunk.meshes) this.scene.remove(mesh);
          chunk.disposeMeshes();
          this.chunks.delete(key);
        }
      }
    }
  }

  /** BFS from player chunk through non-solid faces to find visible chunks */
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

      const chunk = this.getChunk(cx, cy, cz);

      for (let face = 0; face < 6; face++) {
        const [dx, dy, dz] = dirs[face];
        const nx = cx + dx;
        const ny = cy + dy;
        const nz = cz + dz;

        // Distance check
        if (Math.abs(nx - pcx) > maxBfsDist || Math.abs(nz - pcz) > maxBfsDist) continue;
        if (Math.abs(ny - pcy) > RENDER_DISTANCE_Y + 1) continue;

        const nKey = this.chunkKey(nx, ny, nz);
        if (visible.has(nKey)) continue;
        if (!this.chunks.has(nKey)) continue;

        // Occlusion: stop if exit face or entry face is solid
        if (chunk && chunk.faceSolid[face]) continue;
        const neighborChunk = this.getChunk(nx, ny, nz);
        if (neighborChunk && neighborChunk.faceSolid[opposite[face]]) continue;

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
