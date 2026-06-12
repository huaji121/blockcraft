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

  /** Raw 4-octave noise normalised to 0 … 1. */
  getRawHeight(x: number, z: number): number {
    let h = 0;
    let amp = 1;
    let freq = 0.01;
    let max = 0;
    for (let i = 0; i < 4; i++) {
      h += this.noise2D(x * freq, z * freq) * amp;
      max += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return (h / max + 1) * 0.5;
  }

  /** Get terrain height at world (x, z) using octave noise */
  getHeight(x: number, z: number): number {
    return Math.floor(this.getRawHeight(x, z) * 30 + 40);
  }

  /** Get temperature at world (x, z) for biome determination.
   *  Uses low frequency so climate regions are broad and contiguous.
   *  Returns roughly -1 … +1; high values = hot (desert). */
  getTemperature(x: number, z: number): number {
    return this.noise2D(x * 0.002, z * 0.002);
  }

  /** Ridgeness for mountain detection — absolute value of low-freq noise
   *  gives sharp ridges.  0 … 1; high values = mountain. */
  getRidgeness(x: number, z: number): number {
    return Math.abs(this.noise2D(x * 0.0005 + 500, z * 0.0005));
  }
}
