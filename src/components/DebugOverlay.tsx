interface Props {
  fps: number;
  x: number;
  y: number;
  z: number;
}

export function DebugOverlay({ fps, x, y, z }: Props) {
  return (
    <div style={{
      position: 'fixed',
      top: 8,
      left: 8,
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: 13,
      lineHeight: '18px',
      textShadow: '1px 1px 0 #000',
      pointerEvents: 'none',
      zIndex: 200,
    }}>
      <div>FPS: {fps}</div>
      <div>XYZ: {x.toFixed(1)} / {y.toFixed(1)} / {z.toFixed(1)}</div>
    </div>
  );
}
