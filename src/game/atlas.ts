import * as THREE from 'three';

/** Maps a virtual composite path to its two source textures.  The atlas
 *  will draw the base image then the tinted overlay on top into one cell. */
export type CompositeDef = { base: string; overlay: string };

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

  /** Multiply-blend a tint colour onto a cell while preserving the source
   *  image's alpha channel.  Creates an alpha-masked tint overlay on a temp
   *  canvas so that fully-transparent pixels stay transparent.
   *
   *  Without the mask, the Canvas 2D multiply formula fills transparent
   *  destination pixels with the source colour — leaf holes become solid. */
  private static applyTint(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number, y: number, size: number, tint: string,
  ): void {
    // 1. Build an alpha-masked tint overlay on a temp canvas
    const overlay = document.createElement('canvas');
    overlay.width = size;
    overlay.height = size;
    const octx = overlay.getContext('2d')!;
    octx.fillStyle = tint;
    octx.fillRect(0, 0, size, size);
    // destination-in: keep tint only where the image has non-zero alpha
    octx.globalCompositeOperation = 'destination-in';
    octx.drawImage(img, 0, 0, size, size);

    // 2. Multiply-blend the masked overlay onto the main canvas.
    //    Where overlay α = 0 (leaf holes), nothing is drawn → stays transparent.
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(overlay, x, y);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Build atlas from a list of texture paths. Calls onLoad when done.
   *  @param tints      Map from texture path → CSS colour for multiply tinting
   *  @param composites Map from virtual path → {base, overlay} — the composite
   *                    cell is drawn after all source images have loaded. */
  build(
    paths: string[],
    onLoad: () => void,
    tints?: Map<string, string>,
    composites?: Map<string, CompositeDef>,
  ): void {
    // Collect composite source paths so they're loaded as normal images
    const compositeSources = new Set<string>();
    if (composites) {
      for (const [, def] of composites) {
        compositeSources.add(def.base);
        compositeSources.add(def.overlay);
      }
    }

    // Deduplicate and assign grid positions
    const unique = [...new Set([...paths.filter(Boolean), ...compositeSources])];
    this.gridSize = Math.ceil(Math.sqrt(unique.length));
    unique.forEach((path, i) => {
      this.grid.set(path, { col: i % this.gridSize, row: Math.floor(i / this.gridSize) });
    });

    const canvasSize = this.gridSize * this.tilePx;
    this.canvas = document.createElement('canvas');
    this.canvas.width = canvasSize;
    this.canvas.height = canvasSize;
    const ctx = this.canvas.getContext('2d')!;

    // Cache loaded images so composites can reference them later
    const imageCache = new Map<string, HTMLImageElement>();
    let loaded = 0;
    const total = unique.length;

    if (total === 0) {
      this.finalize(onLoad);
      return;
    }

    for (const path of unique) {
      const pos = this.grid.get(path)!;
      const img = new Image();
      imageCache.set(path, img);
      img.onload = () => {
        const sx = pos.col * this.tilePx;
        const sy = pos.row * this.tilePx;
        ctx.drawImage(img, sx, sy, this.tilePx, this.tilePx);

        // Apply colour tint while preserving the texture's alpha channel
        if (tints?.has(path)) {
          TextureAtlas.applyTint(ctx, img, sx, sy, this.tilePx, tints.get(path)!);
        }

        loaded++;
        if (loaded === total) this.buildCompositesAndFinish(ctx, onLoad, composites, imageCache, tints);
      };
      img.onerror = () => {
        loaded++;
        if (loaded === total) this.buildCompositesAndFinish(ctx, onLoad, composites, imageCache, tints);
      };
      img.src = path;
    }
  }

  /** After all source images are drawn, build composite cells and finalise. */
  private buildCompositesAndFinish(
    ctx: CanvasRenderingContext2D,
    onLoad: () => void,
    composites: Map<string, CompositeDef> | undefined,
    imageCache: Map<string, HTMLImageElement>,
    tints: Map<string, string> | undefined,
  ): void {
    if (composites) {
      for (const [compositePath, def] of composites) {
        const pos = this.grid.get(compositePath);
        if (!pos) continue; // composite path wasn't in the original paths set
        const sx = pos.col * this.tilePx;
        const sy = pos.row * this.tilePx;
        const baseImg = imageCache.get(def.base);
        const overlayImg = imageCache.get(def.overlay);
        if (!baseImg || !overlayImg) continue;

        // 1. Draw base (e.g. dirt) — no tint
        ctx.drawImage(baseImg, sx, sy, this.tilePx, this.tilePx);

        // 2. Draw overlay (e.g. grass tufts) — with tint if specified
        const overlayTint = tints?.get(def.overlay);
        ctx.drawImage(overlayImg, sx, sy, this.tilePx, this.tilePx);
        if (overlayTint) {
          // The overlay was drawn on top of the base.  Apply tint using
          // the overlay's alpha as a mask so only the tufts are tinted,
          // leaving the dirt base showing through transparent areas.
          TextureAtlas.applyTint(ctx, overlayImg, sx, sy, this.tilePx, overlayTint);
        }

        // 3. Register the composite cell's UVs for the virtual path.
        //    Already done via the paths → grid setup in build().
      }
    }

    this.finalize(onLoad);
  }

  private finalize(onLoad: () => void): void {
    this.texture = new THREE.CanvasTexture(this.canvas!);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.ready = true;
    onLoad();
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
        TextureAtlas.applyTint(ctx, img, 0, 0, SIZE, tint);
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
