import * as THREE from 'three';
import { CHUNK_SIZE, BLOCK_SIZE } from './constants';
import { BlockType, BLOCK_DATA, getBlockFaceTexture } from './blocks';
import type { TextureAtlas } from './atlas';

export class Chunk {
  public blocks: Uint8Array;
  public cx: number;
  public cy: number;
  public cz: number;
  public meshes: THREE.Mesh[] = [];
  public dirty: boolean = true;
  // Face solidity: [0]=+Y, [1]=-Y, [2]=+X, [3]=-X, [4]=+Z, [5]=-Z
  public faceSolid: boolean[] = [false, false, false, false, false, false];

  // Shared materials — reused across all chunks to avoid per-chunk material creation
  static opaqueMaterial: THREE.MeshLambertMaterial;
  static transparentMaterial: THREE.MeshLambertMaterial;

  static initMaterials(atlas: TextureAtlas): void {
    const tex = atlas.getTexture();
    Chunk.opaqueMaterial = new THREE.MeshLambertMaterial({
      map: tex,
      side: THREE.FrontSide,
      transparent: false,
      alphaTest: 0.1,
    });
    Chunk.transparentMaterial = new THREE.MeshLambertMaterial({
      map: tex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
      alphaTest: 0.1,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }

  constructor(cx: number, cy: number, cz: number) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
  }

  private idx(x: number, y: number, z: number): number {
    return x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_SIZE;
  }

  getBlock(x: number, y: number, z: number): BlockType {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
      return BlockType.AIR;
    }
    return this.blocks[this.idx(x, y, z)];
  }

  setBlock(x: number, y: number, z: number, type: BlockType): void {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
    this.blocks[this.idx(x, y, z)] = type;
    this.dirty = true;
  }

  /** Precompute whether each face is completely solid (for occlusion culling).
   *  A face is "solid" only if ALL blocks on that face AND the adjacent
   *  neighbor blocks are non-transparent. This ensures BFS correctly
   *  propagates when a neighbor chunk's edge block changes. */
  computeFaceSolidity(
    getNeighborBlock: (wx: number, wy: number, wz: number) => BlockType
  ): void {
    const S = CHUNK_SIZE;
    const wx0 = this.cx * S;
    const wy0 = this.cy * S;
    const wz0 = this.cz * S;

    // +Y face (y = S-1): check block at y=S-1 and neighbor at y=S
    let solid = true;
    for (let x = 0; x < S && solid; x++) {
      for (let z = 0; z < S && solid; z++) {
        if (BLOCK_DATA[this.blocks[this.idx(x, S - 1, z)]].transparent) { solid = false; break; }
        if (BLOCK_DATA[getNeighborBlock(wx0 + x, wy0 + S, wz0 + z)].transparent) { solid = false; break; }
      }
    }
    this.faceSolid[0] = solid;

    // -Y face (y = 0)
    solid = true;
    for (let x = 0; x < S && solid; x++) {
      for (let z = 0; z < S && solid; z++) {
        if (BLOCK_DATA[this.blocks[this.idx(x, 0, z)]].transparent) { solid = false; break; }
        if (BLOCK_DATA[getNeighborBlock(wx0 + x, wy0 - 1, wz0 + z)].transparent) { solid = false; break; }
      }
    }
    this.faceSolid[1] = solid;

    // +X face (x = S-1)
    solid = true;
    for (let y = 0; y < S && solid; y++) {
      for (let z = 0; z < S && solid; z++) {
        if (BLOCK_DATA[this.blocks[this.idx(S - 1, y, z)]].transparent) { solid = false; break; }
        if (BLOCK_DATA[getNeighborBlock(wx0 + S, wy0 + y, wz0 + z)].transparent) { solid = false; break; }
      }
    }
    this.faceSolid[2] = solid;

    // -X face (x = 0)
    solid = true;
    for (let y = 0; y < S && solid; y++) {
      for (let z = 0; z < S && solid; z++) {
        if (BLOCK_DATA[this.blocks[this.idx(0, y, z)]].transparent) { solid = false; break; }
        if (BLOCK_DATA[getNeighborBlock(wx0 - 1, wy0 + y, wz0 + z)].transparent) { solid = false; break; }
      }
    }
    this.faceSolid[3] = solid;

    // +Z face (z = S-1)
    solid = true;
    for (let x = 0; x < S && solid; x++) {
      for (let y = 0; y < S && solid; y++) {
        if (BLOCK_DATA[this.blocks[this.idx(x, y, S - 1)]].transparent) { solid = false; break; }
        if (BLOCK_DATA[getNeighborBlock(wx0 + x, wy0 + y, wz0 + S)].transparent) { solid = false; break; }
      }
    }
    this.faceSolid[4] = solid;

    // -Z face (z = 0)
    solid = true;
    for (let x = 0; x < S && solid; x++) {
      for (let y = 0; y < S && solid; y++) {
        if (BLOCK_DATA[this.blocks[this.idx(x, y, 0)]].transparent) { solid = false; break; }
        if (BLOCK_DATA[getNeighborBlock(wx0 + x, wy0 + y, wz0 - 1)].transparent) { solid = false; break; }
      }
    }
    this.faceSolid[5] = solid;
  }

  private getTextureForFace(block: BlockType, faceDir: [number, number, number]): string {
    if (faceDir[1] === 1) return getBlockFaceTexture(block, 'top');
    if (faceDir[1] === -1) return getBlockFaceTexture(block, 'bottom');
    return getBlockFaceTexture(block, 'side');
  }

  private shouldRenderFace(block: BlockType, neighbor: BlockType): boolean {
    if (neighbor === BlockType.AIR) return true;
    const bd = BLOCK_DATA[block];
    const nd = BLOCK_DATA[neighbor];
    if (bd.transparent) return block !== neighbor;
    return nd.transparent;
  }

  buildMeshes(
    atlas: TextureAtlas,
    getNeighborBlock: (wx: number, wy: number, wz: number) => BlockType
  ): void {
    this.disposeMeshes();

    const opaquePos: number[] = [];
    const opaqueNorm: number[] = [];
    const opaqueUv: number[] = [];
    const opaqueIdx: number[] = [];
    const transPos: number[] = [];
    const transNorm: number[] = [];
    const transUv: number[] = [];
    const transIdx: number[] = [];

    const worldX0 = this.cx * CHUNK_SIZE;
    const worldY0 = this.cy * CHUNK_SIZE;
    const worldZ0 = this.cz * CHUNK_SIZE;

    const faceDefs = [
      { dir: [0, 1, 0] as [number, number, number], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] as number[][] },
      { dir: [0, -1, 0] as [number, number, number], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] as number[][] },
      { dir: [1, 0, 0] as [number, number, number], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] as number[][] },
      { dir: [-1, 0, 0] as [number, number, number], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] as number[][] },
      { dir: [0, 0, 1] as [number, number, number], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] as number[][] },
      { dir: [0, 0, -1] as [number, number, number], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] as number[][] },
    ];

    const faceUvs: Record<string, number[][]> = {
      '0,1,0':  [[0, 0], [1, 0], [1, 1], [0, 1]],
      '0,-1,0': [[0, 0], [1, 0], [1, 1], [0, 1]],
      '1,0,0':  [[0, 0], [0, 1], [1, 1], [1, 0]],
      '-1,0,0': [[0, 0], [0, 1], [1, 1], [1, 0]],
      '0,0,1':  [[0, 0], [1, 0], [1, 1], [0, 1]],
      '0,0,-1': [[0, 0], [1, 0], [1, 1], [0, 1]],
    };

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const block = this.blocks[this.idx(x, y, z)];
          if (block === BlockType.AIR) continue;

          const isTransparent = BLOCK_DATA[block].transparent;
          const wx = worldX0 + x;
          const wy = worldY0 + y;
          const wz = worldZ0 + z;

          const positions = isTransparent ? transPos : opaquePos;
          const normals = isTransparent ? transNorm : opaqueNorm;
          const uvs = isTransparent ? transUv : opaqueUv;
          const indices = isTransparent ? transIdx : opaqueIdx;

          for (const face of faceDefs) {
            const nx = wx + face.dir[0];
            const ny = wy + face.dir[1];
            const nz = wz + face.dir[2];

            const neighbor = getNeighborBlock(nx, ny, nz);
            if (!this.shouldRenderFace(block, neighbor)) continue;

            const texPath = this.getTextureForFace(block, face.dir);
            const uvRect = atlas.getUV(texPath);
            if (!uvRect) continue;

            const faceKey = `${face.dir[0]},${face.dir[1]},${face.dir[2]}`;
            const fuvs = faceUvs[faceKey];
            const baseIndex = positions.length / 3;

            for (let i = 0; i < 4; i++) {
              const corner = face.corners[i];
              positions.push(
                (x + corner[0]) * BLOCK_SIZE,
                (y + corner[1]) * BLOCK_SIZE,
                (z + corner[2]) * BLOCK_SIZE
              );
              normals.push(face.dir[0], face.dir[1], face.dir[2]);
              uvs.push(
                uvRect.u0 + fuvs[i][0] * (uvRect.u1 - uvRect.u0),
                uvRect.v0 + fuvs[i][1] * (uvRect.v1 - uvRect.v0)
              );
            }

            indices.push(
              baseIndex, baseIndex + 1, baseIndex + 2,
              baseIndex, baseIndex + 2, baseIndex + 3
            );
          }
        }
      }
    }

    this.buildGroup(opaquePos, opaqueNorm, opaqueUv, opaqueIdx, atlas, false, 0);
    this.buildGroup(transPos, transNorm, transUv, transIdx, atlas, true, 1);
    this.dirty = false;
  }

  private buildGroup(
    pos: number[], norm: number[], uv: number[], idx: number[],
    atlas: TextureAtlas, transparent: boolean, renderOrder: number
  ): void {
    if (pos.length === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(idx);

    const material = transparent ? Chunk.transparentMaterial : Chunk.opaqueMaterial;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      this.cx * CHUNK_SIZE * BLOCK_SIZE,
      this.cy * CHUNK_SIZE * BLOCK_SIZE,
      this.cz * CHUNK_SIZE * BLOCK_SIZE
    );
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = true;
    this.meshes.push(mesh);
  }

  disposeMeshes(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      // Don't dispose material — shared across all chunks via static fields
    }
    this.meshes = [];
  }
}
