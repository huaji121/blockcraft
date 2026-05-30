import { useEffect, useRef, useState, useCallback, useReducer } from 'react';
import { GameEngine } from '../game/engine';
import { BlockType } from '../game/blocks';
import { Hotbar } from './Hotbar';
import { Backpack, DELETE_SLOT_INDEX } from './Backpack';
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

const MAX_STACK = 64;

type InvAction =
  | { type: 'CLICK_SLOT'; source: 'hotbar' | 'backpack'; index: number; heldItem: Slot | null }
  | { type: 'PLACE_ONE'; source: 'hotbar' | 'backpack'; index: number; blockType: BlockType }
  | { type: 'PICK_HALF'; source: 'hotbar' | 'backpack'; index: number }
  | { type: 'QUICK_MOVE'; source: 'hotbar' | 'backpack'; index: number }
  | { type: 'DELETE_ITEM'; source: 'hotbar' | 'backpack'; index: number }
  | { type: 'ADD_TO_BACKPACK'; blockType: BlockType; count?: number };

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

      if (heldItem) {
        if (clicked.type === BlockType.AIR) {
          arr[index] = { ...heldItem };
        } else if (clicked.type === heldItem.type) {
          const canFit = Math.min(heldItem.count, MAX_STACK - clicked.count);
          arr[index] = { ...clicked, count: clicked.count + canFit };
        } else {
          arr[index] = { ...heldItem };
        }
      } else {
        if (clicked.type !== BlockType.AIR) {
          arr[index] = { ...EMPTY_SLOT };
        }
      }

      return source === 'hotbar' ? { ...state, hotbar: arr } : { ...state, backpack: arr };
    }
    case 'PLACE_ONE': {
      const { source, index, blockType } = action;
      const arr = source === 'hotbar' ? [...state.hotbar] : [...state.backpack];
      const clicked = arr[index];
      if (clicked.type === BlockType.AIR) {
        arr[index] = makeSlot(blockType, 1);
      } else if (clicked.type === blockType && clicked.count < MAX_STACK) {
        arr[index] = { ...clicked, count: clicked.count + 1 };
      }
      return source === 'hotbar' ? { ...state, hotbar: arr } : { ...state, backpack: arr };
    }
    case 'PICK_HALF': {
      const { source, index } = action;
      const arr = source === 'hotbar' ? [...state.hotbar] : [...state.backpack];
      const clicked = arr[index];
      if (clicked.type === BlockType.AIR) return state;
      const half = Math.ceil(clicked.count / 2);
      arr[index] = { ...clicked, count: clicked.count - half };
      if (arr[index].count <= 0) arr[index] = { ...EMPTY_SLOT };
      return source === 'hotbar' ? { ...state, hotbar: arr } : { ...state, backpack: arr };
    }
    case 'QUICK_MOVE': {
      const { source, index } = action;
      const fromArr = source === 'hotbar' ? [...state.hotbar] : [...state.backpack];
      const toSource = source === 'hotbar' ? 'backpack' : 'hotbar';
      const toArr = toSource === 'hotbar' ? [...state.hotbar] : [...state.backpack];
      const slot = fromArr[index];
      if (slot.type === BlockType.AIR) return state;
      let remaining = slot.count;
      // Stack into existing same-type slots first
      for (let i = 0; i < toArr.length && remaining > 0; i++) {
        if (toArr[i].type === slot.type && toArr[i].count < MAX_STACK) {
          const canFit = Math.min(remaining, MAX_STACK - toArr[i].count);
          toArr[i] = { ...toArr[i], count: toArr[i].count + canFit };
          remaining -= canFit;
        }
      }
      // Fill empty slots
      for (let i = 0; i < toArr.length && remaining > 0; i++) {
        if (toArr[i].type === BlockType.AIR) {
          const count = Math.min(remaining, MAX_STACK);
          toArr[i] = makeSlot(slot.type, count);
          remaining -= count;
        }
      }
      fromArr[index] = remaining > 0 ? { ...slot, count: remaining } : { ...EMPTY_SLOT };
      if (source === 'hotbar') {
        return { hotbar: fromArr, backpack: toArr };
      } else {
        return { hotbar: toArr, backpack: fromArr };
      }
    }
    case 'DELETE_ITEM': {
      const { source, index } = action;
      const arr = source === 'hotbar' ? [...state.hotbar] : [...state.backpack];
      arr[index] = { ...EMPTY_SLOT };
      return source === 'hotbar' ? { ...state, hotbar: arr } : { ...state, backpack: arr };
    }
    case 'ADD_TO_BACKPACK': {
      const { blockType, count = 1 } = action;
      const backpack = [...state.backpack];
      let remaining = count;
      // Stack into existing
      for (let i = 0; i < backpack.length && remaining > 0; i++) {
        if (backpack[i].type === blockType && backpack[i].count < MAX_STACK) {
          const canFit = Math.min(remaining, MAX_STACK - backpack[i].count);
          backpack[i] = { ...backpack[i], count: backpack[i].count + canFit };
          remaining -= canFit;
        }
      }
      // Fill empty
      for (let i = 0; i < backpack.length && remaining > 0; i++) {
        if (backpack[i].type === BlockType.AIR) {
          const c = Math.min(remaining, MAX_STACK);
          backpack[i] = makeSlot(blockType, c);
          remaining -= c;
        }
      }
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
  const [backpackTab, setBackpackTab] = useState<'inventory' | 'creative'>('inventory');

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
  // button: 0=left, 2=right
  const handleSlotClick = useCallback((source: 'hotbar' | 'backpack', index: number, button: number, shiftKey: boolean) => {
    // Delete slot
    if (source === 'backpack' && index === DELETE_SLOT_INDEX) {
      setHeldItem(null);
      return;
    }

    // Creative tab (negative index: -1 - blockType)
    if (source === 'backpack' && index < 0) {
      const blockType = (-1 - index) as BlockType;
      if (shiftKey && heldItem) { setHeldItem(null); return; }
      if (shiftKey && !heldItem) { setHeldItem({ type: blockType, count: MAX_STACK }); return; }
      if (heldItem) { dispatch({ type: 'ADD_TO_BACKPACK', blockType: heldItem.type, count: heldItem.count }); }
      setHeldItem({ type: blockType, count: MAX_STACK });
      return;
    }

    const arr = source === 'hotbar' ? hotbarRef.current : backpackRef.current;
    const clicked = arr[index];

    // Shift+click: quick move
    if (shiftKey) {
      if (clicked.type !== BlockType.AIR) {
        dispatch({ type: 'QUICK_MOVE', source, index });
      }
      return;
    }

    if (heldItem) {
      if (button === 2) {
        // Right click: place 1
        if (clicked.type === BlockType.AIR || clicked.type === heldItem.type) {
          if (clicked.count < MAX_STACK) {
            dispatch({ type: 'PLACE_ONE', source, index, blockType: heldItem.type });
            setHeldItem(heldItem.count <= 1 ? null : { ...heldItem, count: heldItem.count - 1 });
          }
        }
      } else {
        // Left click: place all or swap
        if (clicked.type === BlockType.AIR) {
          dispatch({ type: 'CLICK_SLOT', source, index, heldItem });
          setHeldItem(null);
        } else if (clicked.type === heldItem.type) {
          const canFit = Math.min(heldItem.count, MAX_STACK - clicked.count);
          dispatch({ type: 'CLICK_SLOT', source, index, heldItem });
          const leftover = heldItem.count - canFit;
          setHeldItem(leftover > 0 ? { ...heldItem, count: leftover } : null);
        } else {
          dispatch({ type: 'CLICK_SLOT', source, index, heldItem });
          setHeldItem({ ...clicked });
        }
      }
    } else {
      if (clicked.type !== BlockType.AIR) {
        if (button === 2) {
          // Right click: pick up half
          const half = Math.ceil(clicked.count / 2);
          dispatch({ type: 'PICK_HALF', source, index });
          setHeldItem({ type: clicked.type, count: half });
        } else {
          // Left click: pick up all
          dispatch({ type: 'CLICK_SLOT', source, index, heldItem: null });
          setHeldItem({ ...clicked });
        }
      }
    }
  }, [heldItem]);

  // Close backpack: drop held item back into first empty slot, then lock pointer
  const closeBackpack = useCallback(() => {
    if (heldItem) {
      dispatch({ type: 'ADD_TO_BACKPACK', blockType: heldItem.type, count: heldItem.count });
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
            setBackpackTab('inventory');
          } else {
            // Closing: drop held item
            if (heldItemRef.current) {
              dispatch({ type: 'ADD_TO_BACKPACK', blockType: heldItemRef.current.type, count: heldItemRef.current.count });
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
        onSlotClick={(i, button, shiftKey) => handleSlotClick('hotbar', i, button, shiftKey)}
      />

      {isBackpackOpen && (
        <Backpack
          hotbar={inv.hotbar}
          backpack={inv.backpack}
          selected={selectedSlot}
          tab={backpackTab}
          onTabChange={setBackpackTab}
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
