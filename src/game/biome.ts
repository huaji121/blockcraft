import { BlockType } from './blocks';

export enum BiomeType {
  PLAINS = 0,
  DESERT = 1,
}

export interface BiomeData {
  name: string;
  /** Block placed at the surface (top of terrain column). */
  surfaceBlock: BlockType;
  /** Block placed between surface and the stone layer. */
  subsurfaceBlock: BlockType;
  /** Number of blocks between surface and stone (the dirt/sand layer thickness). */
  subsurfaceDepth: number;
  /** RGB vertex-colour multiplier for leaf blocks, each channel in [0, 1].
   *  Multiplied with the atlas-tinted leaf texture at render time via
   *  Three.js vertexColors.  White [1,1,1] preserves the atlas tint. */
  leafTint: [number, number, number];
  /** Probability threshold for tree placement (0 = no trees).
   *  Compared against treeHash() result / 1000. */
  treeDensity: number;
}

export const BIOME_DATA: Record<BiomeType, BiomeData> = {
  [BiomeType.PLAINS]: {
    name: 'Plains',
    surfaceBlock: BlockType.GRASS,
    subsurfaceBlock: BlockType.DIRT,
    subsurfaceDepth: 3,
    leafTint: [1.0, 1.0, 1.0],      // neutral — atlas green passes through
    treeDensity: 0.008,              // ~1 tree per chunk (8/1000)
  },
  [BiomeType.DESERT]: {
    name: 'Desert',
    surfaceBlock: BlockType.SAND,
    subsurfaceBlock: BlockType.SAND,
    subsurfaceDepth: 3,
    leafTint: [1.0, 0.85, 0.55],    // warm — makes leaves olive / yellowish
    treeDensity: 0,                  // no trees in desert
  },
};

/** Look up a biome from a temperature value (roughly -1 … +1).
 *  Sharp cutoff: temperature > 0.2 → desert, otherwise plains. */
export function getBiomeFromTemperature(temperature: number): BiomeType {
  if (temperature > 0.2) return BiomeType.DESERT;
  return BiomeType.PLAINS;
}
