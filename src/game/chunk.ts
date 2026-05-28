import * as THREE from 'three';
import { CHUNK_SIZE, BLOCK_SIZE } from './constants';
import { BlockType, BLOCK_DATA } from './blocks';

export class Chunk {
  public blocks: Uint8Array;
  public cx: number;
  public cz: number;
  public meshes: THREE.Mesh[] = [];
  public dirty: boolean = true;

  constructor(cx: number, cz: number) {
    this.cx = cx;
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

  /** Get the texture path for a specific face of a block */
  private getTextureForFace(block: BlockType, faceDir: [number, number, number]): string {
    if (block === BlockType.GRASS) {
      if (faceDir[1] === 1) return BLOCK_DATA[BlockType.GRASS].texture;   // top: grass_block_top
      if (faceDir[1] === -1) return BLOCK_DATA[BlockType.DIRT].texture;    // bottom: dirt
      return BLOCK_DATA[BlockType.DIRT].texture;                           // sides: dirt (grass_side has alpha issues)
    }
    return BLOCK_DATA[block].texture;
  }

  /** Build meshes grouped by texture for efficient rendering */
  buildMeshes(
    textureAtlas: Map<string, THREE.Texture>,
    getNeighborBlock: (wx: number, wy: number, wz: number) => BlockType
  ): void {
    this.disposeMeshes();

    // Group faces by texture
    const facesByTex = new Map<string, { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }>();

    const worldX0 = this.cx * CHUNK_SIZE;
    const worldZ0 = this.cz * CHUNK_SIZE;

    const faceDefs = [
      { dir: [0, 1, 0] as [number, number, number], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] as number[][] },
      { dir: [0, -1, 0] as [number, number, number], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] as number[][] },
      { dir: [1, 0, 0] as [number, number, number], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] as number[][] },
      { dir: [-1, 0, 0] as [number, number, number], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] as number[][] },
      { dir: [0, 0, 1] as [number, number, number], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] as number[][] },
      { dir: [0, 0, -1] as [number, number, number], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] as number[][] },
    ];

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const block = this.blocks[this.idx(x, y, z)];
          if (block === BlockType.AIR) continue;

          const wx = worldX0 + x;
          const wz = worldZ0 + z;

          for (const face of faceDefs) {
            const nx = wx + face.dir[0];
            const ny = y + face.dir[1];
            const nz = wz + face.dir[2];

            const neighbor = getNeighborBlock(nx, ny, nz);
            if (neighbor !== BlockType.AIR) continue;

            const texPath = this.getTextureForFace(block, face.dir);
            if (!facesByTex.has(texPath)) {
              facesByTex.set(texPath, { positions: [], normals: [], uvs: [], indices: [] });
            }
            const group = facesByTex.get(texPath)!;
            const baseIndex = group.positions.length / 3;

            for (const corner of face.corners) {
              group.positions.push(
                (x + corner[0]) * BLOCK_SIZE,
                (y + corner[1]) * BLOCK_SIZE,
                (z + corner[2]) * BLOCK_SIZE
              );
              group.normals.push(face.dir[0], face.dir[1], face.dir[2]);
            }
            group.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
            group.indices.push(
              baseIndex, baseIndex + 1, baseIndex + 2,
              baseIndex, baseIndex + 2, baseIndex + 3
            );
          }
        }
      }
    }

    // Create one mesh per texture group
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

      // Grass top texture is grayscale in assets; tint it green like Minecraft
      const isGrassTop = texPath === BLOCK_DATA[BlockType.GRASS].texture;
      const material = new THREE.MeshLambertMaterial({
        map: tex || null,
        side: THREE.FrontSide,
        color: isGrassTop ? 0x5a8f29 : 0xffffff,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        this.cx * CHUNK_SIZE * BLOCK_SIZE,
        0,
        this.cz * CHUNK_SIZE * BLOCK_SIZE
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;

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
