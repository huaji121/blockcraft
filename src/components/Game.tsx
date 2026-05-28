import { useEffect, useRef } from 'react';
import { GameEngine } from '../game/engine';

export function Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new GameEngine(containerRef.current);
    engineRef.current = engine;
    engine.start();

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    />
  );
}
