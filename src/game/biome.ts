import { BlockType } from './blocks';

export enum BiomeType {
  PLAINS = 0,
  DESERT = 1,
  FLAT_PLAINS = 2,
}

export interface BiomeData {
  name: string;
  /** Block placed at the surface (top of terrain column). */
  surfaceBlock: BlockType;
  /** Block placed between surface and the stone layer. */
  subsurfaceBlock: BlockType;
  /** Number of blocks between surface and stone (the dirt/sand layer thickness). */
  subsurfaceDepth: number;
  /** RGB vertex-colour multiplier for leaf blocks, each channel in [0, 1]. */
  leafTint: [number, number, number];
  /** RGB vertex-colour multiplier for grass blocks. */
  grassTint: [number, number, number];
  /** Probability threshold for tree placement (0 = no trees). */
  treeDensity: number;
  /** Pulls terrain height toward the mean (0 = normal, 1 = completely flat). */
  terrainFlatness?: number;
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
    treeDensity: 0.002,              // ~1 tree per 4 chunks (25% of normal)
    terrainFlatness: 0.7,            // pull height 70% toward the mean
  },
};

/** Look up a biome from a temperature value (roughly -1 … +1).
 *  Three bands: cool ≤ 0 → flat plains, 0 … 0.2 → normal plains, > 0.2 → desert. */
export function getBiomeFromTemperature(temperature: number): BiomeType {
  if (temperature > 0.2) return BiomeType.DESERT;
  if (temperature > 0.0) return BiomeType.PLAINS;
  return BiomeType.FLAT_PLAINS;
}
