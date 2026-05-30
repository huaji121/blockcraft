import { ITEM_REGISTRY } from '../game/items';

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
  const half = size / 2;

  const face = (bg: string, transform: string): React.CSSProperties => ({
    position: 'absolute',
    width: size,
    height: size,
    backgroundImage: `url(${bg})`,
    backgroundSize: 'cover',
    imageRendering: 'pixelated' as const,
    backfaceVisibility: 'hidden' as const,
    transform,
  });

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
        <div style={face(side,   `translateZ(${half}px)`)} />
        <div style={face(side,   `rotateY(180deg) translateZ(${half}px)`)} />
        <div style={face(side,   `rotateY(90deg) translateZ(${half}px)`)} />
        <div style={face(side,   `rotateY(-90deg) translateZ(${half}px)`)} />
      </div>
    </div>
  );
}
