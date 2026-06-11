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

  /** Build atlas from a list of texture paths. Calls onLoad when done.
   *  @param tints Optional map from texture path to CSS color — applies a
   *               multiply overlay to colorize grayscale textures (e.g. leaves). */
  build(paths: string[], onLoad: () => void, tints?: Map<string, string>): void {
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

        // Apply color tint for grayscale textures (e.g. leaves → green)
        if (tints?.has(path)) {
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = tints.get(path)!;
          ctx.fillRect(pos.col * this.tilePx, pos.row * this.tilePx, this.tilePx, this.tilePx);
          ctx.globalCompositeOperation = 'source-over';
        }

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

  /** Create a tinted texture for standalone use (dropped items, particles,
   *  inventory icons).  Returns a CanvasTexture immediately — the image
   *  loads asynchronously and the texture updates when ready.
   *  @param path  Texture file path
   *  @param tint  CSS colour to multiply-blend (e.g. "#559944"), or undefined
   *               to load the raw texture with no tinting. */
  static createTintedTexture(path: string, tint: string | undefined): THREE.CanvasTexture {
    const SIZE = 16; // Minecraft textures are 16×16
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;

    // Fallback: fill with tint colour (or white) so the mesh isn't black while loading
    ctx.fillStyle = tint ?? '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(img, 0, 0, SIZE, SIZE);

      if (tint) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.globalCompositeOperation = 'source-over';
      }

      tex.needsUpdate = true;
    };
    img.onerror = () => {
      // Keep the fallback fill
      tex.needsUpdate = true;
    };
    img.src = path;

    return tex;
  }
}
