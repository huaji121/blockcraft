import * as THREE from 'three';

/**
 * Texture Atlas — packs all block textures into a single texture.
 * Each texture occupies a grid cell; UVs are computed from grid position.
 */
export class TextureAtlas {
  private loader: THREE.TextureLoader;
  private grid: Map<string, { col: number; row: number }> = new Map();
  private texture: THREE.CanvasTexture | null = null;
  private gridSize: number = 0;
  private tilePx: number = 16; // each Minecraft texture is 16x16
  private canvas: HTMLCanvasElement | null = null;
  private ready: boolean = false;

  constructor(loader: THREE.TextureLoader) {
    this.loader = loader;
  }

  /** Build atlas from a list of texture paths. Calls onLoad when done. */
  build(paths: string[], onLoad: () => void): void {
    // Deduplicate and assign grid positions
    const unique = [...new Set(paths.filter(Boolean))];
    this.gridSize = Math.ceil(Math.sqrt(unique.length));
    unique.forEach((path, i) => {
      this.grid.set(path, { col: i % this.gridSize, row: Math.floor(i / this.gridSize) });
    });

    const canvasSize = this.gridSize * this.tilePx;
    this.canvas = document.createElement('canvas');
    this.canvas.width = canvasSize;
    this.canvas.height = canvasSize;
    const ctx = this.canvas.getContext('2d')!;

    let loaded = 0;
    const total = unique.length;

    if (total === 0) {
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.magFilter = THREE.NearestFilter;
      this.texture.minFilter = THREE.NearestFilter;
      this.texture.generateMipmaps = false;
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.ready = true;
      onLoad();
      return;
    }

    for (const path of unique) {
      const pos = this.grid.get(path)!;
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, pos.col * this.tilePx, pos.row * this.tilePx, this.tilePx, this.tilePx);
        loaded++;
        if (loaded === total) {
          this.texture = new THREE.CanvasTexture(this.canvas!);
          this.texture.magFilter = THREE.NearestFilter;
          this.texture.minFilter = THREE.NearestFilter;
          this.texture.generateMipmaps = false;
          this.texture.colorSpace = THREE.SRGBColorSpace;
          this.ready = true;
          onLoad();
        }
      };
      img.onerror = () => {
        loaded++;
        if (loaded === total) {
          this.texture = new THREE.CanvasTexture(this.canvas!);
          this.texture.magFilter = THREE.NearestFilter;
          this.texture.minFilter = THREE.NearestFilter;
          this.texture.generateMipmaps = false;
          this.ready = true;
          onLoad();
        }
      };
      img.src = path;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  getTexture(): THREE.Texture | null {
    return this.texture;
  }

  /** Get UV coordinates for a texture within the atlas.
   *  Returns [u0, v0, u1, v1] — the rectangle in atlas space. */
  getUV(path: string): { u0: number; v0: number; u1: number; v1: number } | null {
    const pos = this.grid.get(path);
    if (!pos) return null;
    const s = 1 / this.gridSize;
    // V is flipped in atlas (top row = v0=0, bottom = v1)
    return {
      u0: pos.col * s,
      v0: 1 - (pos.row + 1) * s,
      u1: (pos.col + 1) * s,
      v1: 1 - pos.row * s,
    };
  }
}
