import { createNoise2D } from 'simplex-noise';

export class TerrainNoise {
  private noise2D: (x: number, y: number) => number;

  constructor(seed: number = 42) {
    // Create a seeded PRNG for simplex noise
    const prng = this.createSeededRandom(seed);
    this.noise2D = createNoise2D(prng);
  }

  private createSeededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  /** Get terrain height at world (x, z) using octave noise */
  getHeight(x: number, z: number): number {
    let height = 0;
    let amplitude = 1;
    let frequency = 0.01;
    let maxValue = 0;

    // 4 octaves of noise for natural-looking terrain
    for (let i = 0; i < 4; i++) {
      height += this.noise2D(x * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    // Normalize to 0..1, then scale to terrain height range
    const normalized = (height / maxValue + 1) * 0.5;
    return Math.floor(normalized * 30 + 40); // Surface height between 40 and 70
  }
}
