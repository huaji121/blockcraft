import { ITEM_REGISTRY } from '../game/items';
import { BLOCK_TEXTURE_TINTS } from '../game/blocks';

interface Props {
  itemId: number;
  size?: number;
}

export function BlockCube({ itemId, size = 28 }: Props) {
  const item = ITEM_REGISTRY.getById(itemId);
  if (!item) return null;

  const top = item.getFaceTexture('top');
  const bottom = item.getFaceTexture('bottom');
  const side = item.getFaceTexture('side');
  const sideOverlay = item.getSideOverlay();
  const half = size / 2;

  const face = (bg: string, transform: string): React.CSSProperties => {
    const tint = BLOCK_TEXTURE_TINTS[bg];
    const style: React.CSSProperties = {
      position: 'absolute',
      width: size,
      height: size,
      backgroundImage: `url(${bg})`,
      backgroundSize: 'cover',
      imageRendering: 'pixelated' as const,
      backfaceVisibility: 'hidden' as const,
      transform,
    };
    if (tint) {
      style.backgroundColor = tint;
      style.backgroundBlendMode = 'multiply';
      // Clip to the texture's alpha channel so transparent pixels
      // don't expose the background colour as a solid block.
      style.maskImage = `url(${bg})`;
      style.WebkitMaskImage = `url(${bg})`;
      style.maskSize = 'cover';
      style.WebkitMaskSize = 'cover';
    }
    return style;
  };

  return (
    <div style={{
      width: size,
      height: size,
      perspective: 200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: size,
        height: size,
        position: 'relative',
        transformStyle: 'preserve-3d',
        transform: `rotateX(-25deg) rotateY(45deg)`,
      }}>
        <div style={face(top,    `rotateX(90deg) translateZ(${half}px)`)} />
        <div style={face(bottom, `rotateX(-90deg) translateZ(${half}px)`)} />

        {/* Side base faces (dirt) */}
        <div style={face(side, `translateZ(${half}px)`)} />
        <div style={face(side, `rotateY(180deg) translateZ(${half}px)`)} />
        <div style={face(side, `rotateY(90deg) translateZ(${half}px)`)} />
        <div style={face(side, `rotateY(-90deg) translateZ(${half}px)`)} />

        {/* Side overlay faces (grass tufts), 1 px in front */}
        {sideOverlay && (
          <>
            <div style={face(sideOverlay, `translateZ(${half + 1}px)`)} />
            <div style={face(sideOverlay, `rotateY(180deg) translateZ(${half + 1}px)`)} />
            <div style={face(sideOverlay, `rotateY(90deg) translateZ(${half + 1}px)`)} />
            <div style={face(sideOverlay, `rotateY(-90deg) translateZ(${half + 1}px)`)} />
          </>
        )}
      </div>
    </div>
  );
}
