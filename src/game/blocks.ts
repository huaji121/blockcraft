export enum BlockType {
  AIR = 0,
  DIRT = 1,
  GRASS = 2,
  STONE = 3,
  COBBLESTONE = 4,
  OAK_PLANKS = 5,
  OAK_LOG = 6,
  SAND = 7,
  GRAVEL = 8,
  GLASS = 9,
  BRICKS = 10,
  SNOW = 11,
  BEDROCK = 12,
  COAL_ORE = 13,
  IRON_ORE = 14,
  GOLD_ORE = 15,
  DIAMOND_ORE = 16,
}

export interface BlockFaceTextures {
  top: string;
  bottom: string;
  side: string;
}

export interface BlockData {
  name: string;
  solid: boolean;
  transparent: boolean;
  hardness: number;           // hits to break (1 = instant, -1 = unbreakable)
  texture: string;            // single texture for simple blocks
  faceTextures?: BlockFaceTextures; // per-face textures override
}

export const BLOCK_DATA: Record<number, BlockData> = {
  [BlockType.AIR]:         { name: 'Air',          solid: false, transparent: true,  hardness: 0,  texture: '' },
  [BlockType.DIRT]:        { name: 'Dirt',         solid: true,  transparent: false, hardness: 1,  texture: '/assets/textures/block/dirt.png' },
  [BlockType.GRASS]:       { name: 'Grass',        solid: true,  transparent: false, hardness: 1,  texture: '/assets/textures/block/grass_block_top.png', faceTextures: { top: '/assets/textures/block/grass_block_top.png', bottom: '/assets/textures/block/dirt.png', side: '/assets/textures/block/grass_block_side.png' } },
  [BlockType.STONE]:       { name: 'Stone',        solid: true,  transparent: false, hardness: 4,  texture: '/assets/textures/block/stone.png' },
  [BlockType.COBBLESTONE]: { name: 'Cobblestone',  solid: true,  transparent: false, hardness: 4,  texture: '/assets/textures/block/cobblestone.png' },
  [BlockType.OAK_PLANKS]:  { name: 'Oak Planks',   solid: true,  transparent: false, hardness: 3,  texture: '/assets/textures/block/oak_planks.png' },
  [BlockType.OAK_LOG]:     { name: 'Oak Log',      solid: true,  transparent: false, hardness: 3,  texture: '/assets/textures/block/oak_log.png', faceTextures: { top: '/assets/textures/block/oak_log_top.png', bottom: '/assets/textures/block/oak_log_top.png', side: '/assets/textures/block/oak_log.png' } },
  [BlockType.SAND]:        { name: 'Sand',         solid: true,  transparent: false, hardness: 1,  texture: '/assets/textures/block/sand.png' },
  [BlockType.GRAVEL]:      { name: 'Gravel',       solid: true,  transparent: false, hardness: 1,  texture: '/assets/textures/block/gravel.png' },
  [BlockType.GLASS]:       { name: 'Glass',        solid: true,  transparent: true,  hardness: 1,  texture: '/assets/textures/block/glass.png' },
  [BlockType.BRICKS]:      { name: 'Bricks',       solid: true,  transparent: false, hardness: 5,  texture: '/assets/textures/block/bricks.png' },
  [BlockType.SNOW]:        { name: 'Snow',         solid: true,  transparent: false, hardness: 1,  texture: '/assets/textures/block/snow.png' },
  [BlockType.BEDROCK]:     { name: 'Bedrock',      solid: true,  transparent: false, hardness: -1, texture: '/assets/textures/block/bedrock.png' },
  [BlockType.COAL_ORE]:    { name: 'Coal Ore',     solid: true,  transparent: false, hardness: 4,  texture: '/assets/textures/block/coal_ore.png' },
  [BlockType.IRON_ORE]:    { name: 'Iron Ore',     solid: true,  transparent: false, hardness: 4,  texture: '/assets/textures/block/iron_ore.png' },
  [BlockType.GOLD_ORE]:    { name: 'Gold Ore',     solid: true,  transparent: false, hardness: 5,  texture: '/assets/textures/block/gold_ore.png' },
  [BlockType.DIAMOND_ORE]: { name: 'Diamond Ore',  solid: true,  transparent: false, hardness: 5,  texture: '/assets/textures/block/diamond_ore.png' },
};

/** Get the texture path for a specific face of a block */
export function getBlockFaceTexture(blockType: BlockType, face: 'top' | 'bottom' | 'side'): string {
  const data = BLOCK_DATA[blockType];
  if (!data) return '';
  if (data.faceTextures) return data.faceTextures[face];
  return data.texture;
}

/** All placeable block types (excludes AIR) */
export const ALL_BLOCKS: BlockType[] = Object.values(BlockType)
  .filter((v): v is BlockType => typeof v === 'number' && v !== BlockType.AIR);
