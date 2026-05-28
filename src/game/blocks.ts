export enum BlockType {
  AIR = 0,
  DIRT = 1,
  GRASS = 2,
  STONE = 3,
}

export interface BlockData {
  name: string;
  solid: boolean;
  texture: string;
}

export const BLOCK_DATA: Record<number, BlockData> = {
  [BlockType.AIR]: { name: 'Air', solid: false, texture: '' },
  [BlockType.DIRT]: { name: 'Dirt', solid: true, texture: '/assets/textures/block/dirt.png' },
  [BlockType.GRASS]: { name: 'Grass', solid: true, texture: '/assets/textures/block/grass_block_top.png' },
  [BlockType.STONE]: { name: 'Stone', solid: true, texture: '/assets/textures/block/stone.png' },
};
