import { useEffect, useRef, useState, useCallback, useReducer } from 'react';
import { GameEngine } from '../game/engine';
import { BlockType, BLOCK_DATA } from '../game/blocks';
import { Hotbar } from './Hotbar';
import { Backpack } from './Backpack';
import { CreativeInventory } from './CreativeInventory';
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
  const [isCreativeOpen, setIsCreativeOpen] = useState(false);

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
  const handleSlotClick = useCallback((source: 'hotbar' | 'backpack', index: number) => {
    const arr = source === 'hotbar' ? hotbarRef.current : backpackRef.current;
    const clicked = arr[index];

    if (heldItem) {
      if (clicked.type === BlockType.AIR) {
        // Place held item into empty slot
        dispatch({ type: 'CLICK_SLOT', source, index, heldItem });
        setHeldItem(null);
      } else if (clicked.type === heldItem.type) {
        // Same type: stack
        dispatch({ type: 'CLICK_SLOT', source, index, heldItem });
        setHeldItem(null);
      } else {
        // Different type: swap — put held into slot, pick up what was there
        dispatch({ type: 'CLICK_SLOT', source, index, heldItem });
        setHeldItem({ ...clicked });
      }
    } else {
      if (clicked.type !== BlockType.AIR) {
        // Pick up
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
    setIsCreativeOpen(false);
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
    engine.getPlayer().uiOpen = isBackpackOpen || isCreativeOpen;
  }, [isBackpackOpen, isCreativeOpen]);

  // Keyboard: E for backpack, 1-9 for hotbar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyE') {
        e.preventDefault();
        setIsBackpackOpen(prev => {
          if (!prev) {
            engineRef.current?.exitPointerLock();
            setIsCreativeOpen(false);
          } else {
            // Closing: drop held item
            if (heldItemRef.current) {
              dispatch({ type: 'ADD_TO_BACKPACK', blockType: heldItemRef.current.type });
              setHeldItem(null);
            }
            setTimeout(() => engineRef.current?.requestPointerLock(), 50);
            setIsCreativeOpen(false);
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

  const handleCreativeSelect = useCallback((blockType: number) => {
    dispatch({ type: 'ADD_TO_BACKPACK', blockType: blockType as BlockType });
  }, []);

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

      {isBackpackOpen && !isCreativeOpen && (
        <Backpack
          hotbar={inv.hotbar}
          backpack={inv.backpack}
          selected={selectedSlot}
          onSlotClick={handleSlotClick}
          onClose={closeBackpack}
          onOpenCreative={() => setIsCreativeOpen(true)}
        />
      )}

      {isCreativeOpen && (
        <CreativeInventory
          onSelect={handleCreativeSelect}
          onBack={() => setIsCreativeOpen(false)}
        />
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
          <img
            src={BLOCK_DATA[heldItem.type].texture}
            alt=""
            draggable={false}
          />
          {heldItem.count > 1 && (
            <span className="count">{heldItem.count}</span>
          )}
        </div>
      )}
    </div>
  );
}
