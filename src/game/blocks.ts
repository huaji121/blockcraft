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

export interface BlockData {
  name: string;
  solid: boolean;
  transparent: boolean;
  texture: string;
}

export const BLOCK_DATA: Record<number, BlockData> = {
  [BlockType.AIR]:         { name: 'Air',          solid: false, transparent: true,  texture: '' },
  [BlockType.DIRT]:        { name: 'Dirt',         solid: true,  transparent: false, texture: '/assets/textures/block/dirt.png' },
  [BlockType.GRASS]:       { name: 'Grass',        solid: true,  transparent: false, texture: '/assets/textures/block/grass_block_top.png' },
  [BlockType.STONE]:       { name: 'Stone',        solid: true,  transparent: false, texture: '/assets/textures/block/stone.png' },
  [BlockType.COBBLESTONE]: { name: 'Cobblestone',  solid: true,  transparent: false, texture: '/assets/textures/block/cobblestone.png' },
  [BlockType.OAK_PLANKS]:  { name: 'Oak Planks',   solid: true,  transparent: false, texture: '/assets/textures/block/oak_planks.png' },
  [BlockType.OAK_LOG]:     { name: 'Oak Log',      solid: true,  transparent: false, texture: '/assets/textures/block/oak_log.png' },
  [BlockType.SAND]:        { name: 'Sand',         solid: true,  transparent: false, texture: '/assets/textures/block/sand.png' },
  [BlockType.GRAVEL]:      { name: 'Gravel',       solid: true,  transparent: false, texture: '/assets/textures/block/gravel.png' },
  [BlockType.GLASS]:       { name: 'Glass',        solid: true,  transparent: true,  texture: '/assets/textures/block/glass.png' },
  [BlockType.BRICKS]:      { name: 'Bricks',       solid: true,  transparent: false, texture: '/assets/textures/block/bricks.png' },
  [BlockType.SNOW]:        { name: 'Snow',         solid: true,  transparent: false, texture: '/assets/textures/block/snow.png' },
  [BlockType.BEDROCK]:     { name: 'Bedrock',      solid: true,  transparent: false, texture: '/assets/textures/block/bedrock.png' },
  [BlockType.COAL_ORE]:    { name: 'Coal Ore',     solid: true,  transparent: false, texture: '/assets/textures/block/coal_ore.png' },
  [BlockType.IRON_ORE]:    { name: 'Iron Ore',     solid: true,  transparent: false, texture: '/assets/textures/block/iron_ore.png' },
  [BlockType.GOLD_ORE]:    { name: 'Gold Ore',     solid: true,  transparent: false, texture: '/assets/textures/block/gold_ore.png' },
  [BlockType.DIAMOND_ORE]: { name: 'Diamond Ore',  solid: true,  transparent: false, texture: '/assets/textures/block/diamond_ore.png' },
};

/** All placeable block types (excludes AIR) */
export const ALL_BLOCKS: BlockType[] = Object.values(BlockType)
  .filter((v): v is BlockType => typeof v === 'number' && v !== BlockType.AIR);
