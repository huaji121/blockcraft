import { BlockType } from './blocks';

export enum BiomeType {
  PLAINS = 0,
  DESERT = 1,
  FLAT_PLAINS = 2,
  MOUNTAIN = 3,
}

export interface BiomeData {
  name: string;
  surfaceBlock: BlockType;
  subsurfaceBlock: BlockType;
  subsurfaceDepth: number;
  leafTint: [number, number, number];
  grassTint: [number, number, number];
  treeDensity: number;
  /** Pulls terrain height toward the mean (0 = normal, 1 = completely flat). */
  terrainFlatness?: number;
  /** Total height range above base (default 30). */
  terrainRange?: number;
  /** Exponent for height distribution — > 1 clusters heights lower with rare
   *  tall peaks (default 1 = linear). */
  terrainPower?: number;
}

export const BIOME_DATA: Record<BiomeType, BiomeData> = {
  [BiomeType.PLAINS]: {
    name: 'Plains',
    surfaceBlock: BlockType.GRASS,
    subsurfaceBlock: BlockType.DIRT,
    subsurfaceDepth: 3,
    leafTint: [1.0, 1.0, 1.0],      // neutral — atlas green passes through
    grassTint: [1.0, 1.0, 1.0],     // neutral — atlas green preserved
    treeDensity: 0.008,              // ~1 tree per chunk (8/1000)
  },
  [BiomeType.DESERT]: {
    name: 'Desert',
    surfaceBlock: BlockType.SAND,
    subsurfaceBlock: BlockType.SAND,
    subsurfaceDepth: 3,
    leafTint: [1.0, 0.85, 0.55],    // warm — makes leaves olive / yellowish
    grassTint: [1.0, 0.82, 0.5],    // warm — makes grass dry / yellowish
    treeDensity: 0,                  // no trees in desert
  },
  [BiomeType.FLAT_PLAINS]: {
    name: 'Flat Plains',
    surfaceBlock: BlockType.GRASS,
    subsurfaceBlock: BlockType.DIRT,
    subsurfaceDepth: 3,
    leafTint: [1.0, 1.0, 1.0],
    grassTint: [1.0, 1.0, 1.0],
    treeDensity: 0.002,
    terrainFlatness: 0.7,
  },
  [BiomeType.MOUNTAIN]: {
    name: 'Mountain',
    surfaceBlock: BlockType.SNOW,     // default — overridden by Y in generateChunk
    subsurfaceBlock: BlockType.STONE,
    subsurfaceDepth: 6,
    leafTint: [1.0, 1.0, 1.0],
    grassTint: [1.0, 1.0, 1.0],
    treeDensity: 0,
    terrainRange: 460,                // 40 + 460 = max 500
    terrainPower: 2.5,                // rare high peaks, mostly moderate
  },
};

/** Look up a biome from temperature and ridgeness (both roughly -1 … +1).
 *  Ridgeness > 0.55 → mountain (overrides temperature). */
export function getBiome(temperature: number, ridgeness: number): BiomeType {
  if (ridgeness > 0.55) return BiomeType.MOUNTAIN;
  if (temperature > 0.2) return BiomeType.DESERT;
  if (temperature > 0.0) return BiomeType.PLAINS;
  return BiomeType.FLAT_PLAINS;
}
