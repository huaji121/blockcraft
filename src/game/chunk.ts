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

  private getTextureForFace(block: BlockType, faceDir: [number, number, number]): string {
    if (faceDir[1] === 1) return getBlockFaceTexture(block, 'top');
    if (faceDir[1] === -1) return getBlockFaceTexture(block, 'bottom');
    return getBlockFaceTexture(block, 'side');
  }

  private shouldRenderFace(block: BlockType, neighbor: BlockType): boolean {
    if (neighbor === BlockType.AIR) return true;
    const blockData = BLOCK_DATA[block];
    const neighborData = BLOCK_DATA[neighbor];
    if (blockData.transparent) {
      return block !== neighbor;
    }
    return neighborData.transparent;
  }

  buildMeshes(
    atlas: TextureAtlas,
    getNeighborBlock: (wx: number, wy: number, wz: number) => BlockType
  ): void {
    this.disposeMeshes();

    // Opaque: single merged geometry + single material (atlas)
    const opaquePositions: number[] = [];
    const opaqueNormals: number[] = [];
    const opaqueUvs: number[] = [];
    const opaqueIndices: number[] = [];

    // Transparent: separate geometry (still uses atlas)
    const transPositions: number[] = [];
    const transNormals: number[] = [];
    const transUvs: number[] = [];
    const transIndices: number[] = [];

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

    // UV mapping per face direction
    const faceUvMap: Record<string, number[][]> = {
      '0,1,0':  [[0, 0], [1, 0], [1, 1], [0, 1]], // top
      '0,-1,0': [[0, 0], [1, 0], [1, 1], [0, 1]], // bottom
      '1,0,0':  [[0, 0], [0, 1], [1, 1], [1, 0]], // right
      '-1,0,0': [[0, 0], [0, 1], [1, 1], [1, 0]], // left
      '0,0,1':  [[0, 0], [1, 0], [1, 1], [0, 1]], // front
      '0,0,-1': [[0, 0], [1, 0], [1, 1], [0, 1]], // back
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

          const positions = isTransparent ? transPositions : opaquePositions;
          const normals = isTransparent ? transNormals : opaqueNormals;
          const uvs = isTransparent ? transUvs : opaqueUvs;
          const indices = isTransparent ? transIndices : opaqueIndices;

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
            const faceUvs = faceUvMap[faceKey];
            const baseIndex = positions.length / 3;

            for (let i = 0; i < 4; i++) {
              const corner = face.corners[i];
              positions.push(
                (x + corner[0]) * BLOCK_SIZE,
                (y + corner[1]) * BLOCK_SIZE,
                (z + corner[2]) * BLOCK_SIZE
              );
              normals.push(face.dir[0], face.dir[1], face.dir[2]);

              // Map 0-1 face UVs to atlas UVs
              const fu = faceUvs[i][0];
              const fv = faceUvs[i][1];
              uvs.push(
                uvRect.u0 + fu * (uvRect.u1 - uvRect.u0),
                uvRect.v0 + fv * (uvRect.v1 - uvRect.v0)
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

    // Build opaque mesh (single draw call per chunk)
    if (opaquePositions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(opaquePositions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(opaqueNormals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(opaqueUvs, 2));
      geo.setIndex(opaqueIndices);

      const mat = new THREE.MeshLambertMaterial({
        map: atlas.getTexture(),
        side: THREE.FrontSide,
        alphaTest: 0.1,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        this.cx * CHUNK_SIZE * BLOCK_SIZE,
        this.cy * CHUNK_SIZE * BLOCK_SIZE,
        this.cz * CHUNK_SIZE * BLOCK_SIZE
      );
      mesh.renderOrder = 0;
      this.meshes.push(mesh);
    }

    // Build transparent mesh
    if (transPositions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(transPositions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(transNormals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(transUvs, 2));
      geo.setIndex(transIndices);

      const mat = new THREE.MeshLambertMaterial({
        map: atlas.getTexture(),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        this.cx * CHUNK_SIZE * BLOCK_SIZE,
        this.cy * CHUNK_SIZE * BLOCK_SIZE,
        this.cz * CHUNK_SIZE * BLOCK_SIZE
      );
      mesh.renderOrder = 1;
      this.meshes.push(mesh);
    }

    this.dirty = false;
  }

  disposeMeshes(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
    this.meshes = [];
  }
}
