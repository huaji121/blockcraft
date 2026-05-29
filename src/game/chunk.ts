import * as THREE from 'three';
import { CHUNK_SIZE, BLOCK_SIZE } from './constants';
import { BlockType, BLOCK_DATA, getBlockFaceTexture } from './blocks';

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
    textureAtlas: Map<string, THREE.Texture>,
    getNeighborBlock: (wx: number, wy: number, wz: number) => BlockType
  ): void {
    this.disposeMeshes();

    const opaqueByTex = new Map<string, { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }>();
    const transparentByTex = new Map<string, { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }>();

    const worldX0 = this.cx * CHUNK_SIZE;
    const worldY0 = this.cy * CHUNK_SIZE;
    const worldZ0 = this.cz * CHUNK_SIZE;

    const faceDefs = [
      { dir: [0, 1, 0] as [number, number, number], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] as number[][], uvs: [0,0, 1,0, 1,1, 0,1] as number[] },
      { dir: [0, -1, 0] as [number, number, number], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] as number[][], uvs: [0,0, 1,0, 1,1, 0,1] as number[] },
      { dir: [1, 0, 0] as [number, number, number], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] as number[][], uvs: [0,0, 0,1, 1,1, 1,0] as number[] },
      { dir: [-1, 0, 0] as [number, number, number], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] as number[][], uvs: [0,0, 0,1, 1,1, 1,0] as number[] },
      { dir: [0, 0, 1] as [number, number, number], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] as number[][], uvs: [0,0, 1,0, 1,1, 0,1] as number[] },
      { dir: [0, 0, -1] as [number, number, number], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] as number[][], uvs: [0,0, 1,0, 1,1, 0,1] as number[] },
    ];

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const block = this.blocks[this.idx(x, y, z)];
          if (block === BlockType.AIR) continue;

          const isTransparent = BLOCK_DATA[block].transparent;
          const wx = worldX0 + x;
          const wy = worldY0 + y;
          const wz = worldZ0 + z;

          for (const face of faceDefs) {
            const nx = wx + face.dir[0];
            const ny = wy + face.dir[1];
            const nz = wz + face.dir[2];

            const neighbor = getNeighborBlock(nx, ny, nz);
            if (!this.shouldRenderFace(block, neighbor)) continue;

            const texPath = this.getTextureForFace(block, face.dir);
            const groupMap = isTransparent ? transparentByTex : opaqueByTex;

            if (!groupMap.has(texPath)) {
              groupMap.set(texPath, { positions: [], normals: [], uvs: [], indices: [] });
            }
            const group = groupMap.get(texPath)!;
            const baseIndex = group.positions.length / 3;

            for (const corner of face.corners) {
              group.positions.push(
                (x + corner[0]) * BLOCK_SIZE,
                (y + corner[1]) * BLOCK_SIZE,
                (z + corner[2]) * BLOCK_SIZE
              );
              group.normals.push(face.dir[0], face.dir[1], face.dir[2]);
            }
            group.uvs.push(...face.uvs);
            group.indices.push(
              baseIndex, baseIndex + 1, baseIndex + 2,
              baseIndex, baseIndex + 2, baseIndex + 3
            );
          }
        }
      }
    }

    this.buildMeshGroup(opaqueByTex, textureAtlas, false, 0);
    this.buildMeshGroup(transparentByTex, textureAtlas, true, 1);
    this.dirty = false;
  }

  private buildMeshGroup(
    facesByTex: Map<string, { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }>,
    textureAtlas: Map<string, THREE.Texture>,
    transparent: boolean,
    renderOrder: number
  ): void {
    for (const [texPath, group] of facesByTex) {
      if (group.positions.length === 0) continue;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(group.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(group.normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(group.uvs, 2));
      geometry.setIndex(group.indices);

      const tex = textureAtlas.get(texPath);
      if (tex) {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
      }

      const isGrassSide = texPath === '/assets/textures/block/grass_block_side.png';
      const material = new THREE.MeshLambertMaterial({
        map: tex || null,
        side: transparent ? THREE.DoubleSide : THREE.FrontSide,
        transparent: transparent || isGrassSide,
        opacity: transparent ? 0.5 : 1,
        alphaTest: isGrassSide ? 0.1 : 0,
        depthWrite: !transparent,
        polygonOffset: transparent,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        this.cx * CHUNK_SIZE * BLOCK_SIZE,
        this.cy * CHUNK_SIZE * BLOCK_SIZE,
        this.cz * CHUNK_SIZE * BLOCK_SIZE
      );
      mesh.renderOrder = renderOrder;
      this.meshes.push(mesh);
    }
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
