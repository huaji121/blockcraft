import { useEffect, useRef, useState, useCallback, useReducer } from 'react';
import { GameEngine } from '../game/engine';
import { BlockType } from '../game/blocks';
import { Hotbar } from './Hotbar';
import { Backpack } from './Backpack';
import { BlockCube } from './BlockCube';
import { DebugOverlay } from './DebugOverlay';
import { Settings, type GameSettings } from './Settings';
import './Inventory.css';

export interface Slot {
  type: BlockType;
  count: number;
}

export const EMPTY_SLOT: Slot = { type: BlockType.AIR, count: 0 };
export const makeSlot = (type: BlockType, count = 1): Slot => ({ type, count });

interface InvState {
  hotbar: Slot[];
  backpack: Slot[];
}

type InvAction =
  | { type: 'CLICK_SLOT'; source: 'hotbar' | 'backpack'; index: number; heldItem: Slot | null }
  | { type: 'ADD_TO_BACKPACK'; blockType: BlockType };

const DEFAULT_HOTBAR: Slot[] = [
  makeSlot(BlockType.DIRT, 64),
  makeSlot(BlockType.GRASS, 64),
  makeSlot(BlockType.STONE, 64),
  makeSlot(BlockType.COBBLESTONE, 64),
  makeSlot(BlockType.OAK_PLANKS, 64),
  makeSlot(BlockType.OAK_LOG, 64),
  makeSlot(BlockType.SAND, 64),
  makeSlot(BlockType.GLASS, 64),
  makeSlot(BlockType.BRICKS, 64),
];

const DEFAULT_BACKPACK: Slot[] = Array.from({ length: 27 }, () => ({ ...EMPTY_SLOT }));

function invReducer(state: InvState, action: InvAction): InvState {
  switch (action.type) {
    case 'CLICK_SLOT': {
      const { source, index, heldItem } = action;
      const arr = source === 'hotbar' ? [...state.hotbar] : [...state.backpack];
      const clicked = arr[index];

      // Place held item into slot
      if (heldItem) {
        if (clicked.type === BlockType.AIR) {
          // Empty slot: place held item
          arr[index] = { ...heldItem };
        } else if (clicked.type === heldItem.type) {
          // Same type: stack
          arr[index] = { ...clicked, count: clicked.count + heldItem.count };
        } else {
          // Different type: swap
          arr[index] = { ...heldItem };
          // The old item becomes the new held item (handled by caller)
        }
      } else {
        // Pick up item from slot
        arr[index] = { ...EMPTY_SLOT };
      }

      if (source === 'hotbar') return { ...state, hotbar: arr };
      return { ...state, backpack: arr };
    }
    case 'ADD_TO_BACKPACK': {
      const idx = state.backpack.findIndex(s => s.type === BlockType.AIR);
      if (idx === -1) return state;
      const backpack = [...state.backpack];
      backpack[idx] = makeSlot(action.blockType, 1);
      return { ...state, backpack };
    }
    default:
      return state;
  }
}

export function Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [inv, dispatch] = useReducer(invReducer, {
    hotbar: DEFAULT_HOTBAR,
    backpack: DEFAULT_BACKPACK,
  });

  const [selectedSlot, setSelectedSlot] = useState(0);
  const [isBackpackOpen, setIsBackpackOpen] = useState(false);

  // Debug overlay
  const [showDebug, setShowDebug] = useState(false);
  const [fps, setFps] = useState(0);
  const [playerPos, setPlayerPos] = useState({ x: 0, y: 0, z: 0 });

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<GameSettings>({
    fpsLimit: 0,
    chunksPerFrame: 8,
    renderDistance: 8,
  });

  // Position + FPS tracker
  useEffect(() => {
    let rafId: number;

    const tick = () => {
      const engine = engineRef.current;
      if (engine) {
        const p = engine.getPlayer().position;
        setPlayerPos({ x: p.x, y: p.y, z: p.z });
        setFps(engine.fps);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Sync settings to engine
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.updateSettings(settings);
  }, [settings]);

  // Held item (follows mouse)
  const [heldItem, setHeldItem] = useState<Slot | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Refs
  const selectedSlotRef = useRef(selectedSlot);
  selectedSlotRef.current = selectedSlot;
  const hotbarRef = useRef(inv.hotbar);
  hotbarRef.current = inv.hotbar;
  const backpackRef = useRef(inv.backpack);
  backpackRef.current = inv.backpack;

  // Track mouse position for held item
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  // Click a slot: pick up or place
  // Creative tab uses negative index: -1 - blockType
  const handleSlotClick = useCallback((source: 'hotbar' | 'backpack', index: number) => {
    // Creative tab click: pick up a full stack of that block type
    if (source === 'backpack' && index < 0) {
      const blockType = (-1 - index) as BlockType;
      // If holding something, drop it first
      if (heldItem) {
        dispatch({ type: 'ADD_TO_BACKPACK', blockType: heldItem.type });
      }
      setHeldItem({ type: blockType, count: 64 });
      return;
    }

    const arr = source === 'hotbar' ? hotbarRef.current : backpackRef.current;
    const clicked = arr[index];

    if (heldItem) {
      if (clicked.type === BlockType.AIR) {
        dispatch({ type: 'CLICK_SLOT', source, index, heldItem });
        setHeldItem(null);
      } else if (clicked.type === heldItem.type) {
        dispatch({ type: 'CLICK_SLOT', source, index, heldItem });
        setHeldItem(null);
      } else {
        dispatch({ type: 'CLICK_SLOT', source, index, heldItem });
        setHeldItem({ ...clicked });
      }
    } else {
      if (clicked.type !== BlockType.AIR) {
        dispatch({ type: 'CLICK_SLOT', source, index, heldItem: null });
        setHeldItem({ ...clicked });
      }
    }
  }, [heldItem]);

  // Close backpack: drop held item back into first empty slot, then lock pointer
  const closeBackpack = useCallback(() => {
    if (heldItem) {
      dispatch({ type: 'ADD_TO_BACKPACK', blockType: heldItem.type });
      setHeldItem(null);
    }
    setIsBackpackOpen(false);
    setTimeout(() => engineRef.current?.requestPointerLock(), 50);
  }, [heldItem]);

  // Init engine
  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new GameEngine(containerRef.current);
    engineRef.current = engine;
    engine.getPlayer().setGetSelectedBlock(() => {
      return hotbarRef.current[selectedSlotRef.current].type;
    });
    engine.start();
    return () => { engine.dispose(); engineRef.current = null; };
  }, []);

  // Sync uiOpen
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.getPlayer().uiOpen = isBackpackOpen || showSettings;
  }, [isBackpackOpen, showSettings]);

  // Keyboard: E for backpack, 1-9 for hotbar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyE') {
        e.preventDefault();
        setIsBackpackOpen(prev => {
          if (!prev) {
            engineRef.current?.exitPointerLock();
          } else {
            // Closing: drop held item
            if (heldItemRef.current) {
              dispatch({ type: 'ADD_TO_BACKPACK', blockType: heldItemRef.current.type });
              setHeldItem(null);
            }
            setTimeout(() => engineRef.current?.requestPointerLock(), 50);
          }
          return !prev;
        });
        return;
      }
      if (e.code === 'F3') {
        e.preventDefault();
        setShowDebug(prev => !prev);
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        setShowSettings(prev => {
          if (!prev) {
            engineRef.current?.exitPointerLock();
          }
          return !prev;
        });
        return;
      }

      const digit = parseInt(e.key);
      if (digit >= 1 && digit <= 9) setSelectedSlot(digit - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const heldItemRef = useRef(heldItem);
  heldItemRef.current = heldItem;

  // Scroll wheel
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (isBackpackOpenRef.current) return;
      setSelectedSlot(prev => {
        const dir = e.deltaY > 0 ? 1 : -1;
        return ((prev + dir) % 9 + 9) % 9;
      });
    };
    document.addEventListener('wheel', onWheel, { passive: true });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  const isBackpackOpenRef = useRef(isBackpackOpen);
  isBackpackOpenRef.current = isBackpackOpen;

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        cursor: isBackpackOpen ? 'default' : 'pointer',
      }}
    >
      {/* Crosshair */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 60,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20">
          <line x1="10" y1="3" x2="10" y2="8" stroke="white" strokeWidth="2" />
          <line x1="10" y1="12" x2="10" y2="17" stroke="white" strokeWidth="2" />
          <line x1="3" y1="10" x2="8" y2="10" stroke="white" strokeWidth="2" />
          <line x1="12" y1="10" x2="17" y2="10" stroke="white" strokeWidth="2" />
        </svg>
      </div>

      <Hotbar
        slots={inv.hotbar}
        selected={selectedSlot}
        onSlotClick={(i) => handleSlotClick('hotbar', i)}
      />

      {isBackpackOpen && (
        <Backpack
          hotbar={inv.hotbar}
          backpack={inv.backpack}
          selected={selectedSlot}
          onSlotClick={handleSlotClick}
          onClose={closeBackpack}
        />
      )}

      {showSettings && (
        <Settings
          settings={settings}
          onChange={setSettings}
          onClose={() => {
            setShowSettings(false);
            setTimeout(() => engineRef.current?.requestPointerLock(), 50);
          }}
        />
      )}

      {/* Debug overlay */}
      {showDebug && (
        <DebugOverlay fps={fps} x={playerPos.x} y={playerPos.y} z={playerPos.z} />
      )}

      {/* Held item following cursor */}
      {heldItem && heldItem.type !== BlockType.AIR && (
        <div
          className="held-item"
          style={{
            left: mousePos.x,
            top: mousePos.y,
          }}
        >
          <BlockCube blockType={heldItem.type} size={24} />
          {heldItem.count > 1 && (
            <span className="count">{heldItem.count}</span>
          )}
        </div>
      )}
    </div>
  );
}
