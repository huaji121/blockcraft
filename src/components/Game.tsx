import { useEffect, useRef, useState, useCallback, useReducer } from 'react';
import { GameEngine } from '../game/engine';
import { BlockType } from '../game/blocks';
import { type Slot, EMPTY_SLOT, EMPTY_ITEM_ID, makeSlot, isSlotEmpty, ITEM_REGISTRY } from '../game/items';
import { DEFAULT_KEYBINDS, isKey } from '../game/keybinds';
import { executeCommand } from '../game/commands';
import { Hotbar } from './Hotbar';
import { Backpack, DELETE_SLOT_INDEX } from './Backpack';
import { BlockCube } from './BlockCube';
import { DebugOverlay } from './DebugOverlay';
import { Settings, type GameSettings } from './Settings';
import { Chat, type ChatMessage } from './Chat';
import './Inventory.css';

interface InvState {
  hotbar: Slot[];
  backpack: Slot[];
}

const MAX_STACK = 64;

type InvAction =
  | { type: 'CLICK_SLOT'; source: 'hotbar' | 'backpack'; index: number; heldItem: Slot | null }
  | { type: 'PLACE_ONE'; source: 'hotbar' | 'backpack'; index: number; itemId: number }
  | { type: 'PICK_HALF'; source: 'hotbar' | 'backpack'; index: number }
  | { type: 'REMOVE_FROM_SLOT'; source: 'hotbar' | 'backpack'; index: number; count: number }
  | { type: 'QUICK_MOVE'; source: 'hotbar' | 'backpack'; index: number }
  | { type: 'DELETE_ITEM'; source: 'hotbar' | 'backpack'; index: number }
  | { type: 'ADD_TO_BACKPACK'; itemId: number; count?: number }
  | { type: 'DISTRIBUTE_LEFT'; slots: { source: 'hotbar' | 'backpack'; index: number }[]; heldItem: Slot }
  | { type: 'DISTRIBUTE_RIGHT'; slots: { source: 'hotbar' | 'backpack'; index: number }[]; heldItem: Slot };

const DEFAULT_HOTBAR: Slot[] = Array.from({ length: 9 }, () => ({ ...EMPTY_SLOT }));

const DEFAULT_BACKPACK: Slot[] = Array.from({ length: 27 }, () => ({ ...EMPTY_SLOT }));

function getSlot(arr: Slot[], index: number): Slot {
  return arr[index] ?? EMPTY_SLOT;
}

function invReducer(state: InvState, action: InvAction): InvState {
  switch (action.type) {
    case 'CLICK_SLOT': {
      const { source, index, heldItem } = action;
      const arr = source === 'hotbar' ? [...state.hotbar] : [...state.backpack];
      const clicked = getSlot(arr, index);

      if (heldItem && !isSlotEmpty(heldItem)) {
        if (isSlotEmpty(clicked)) {
          arr[index] = { ...heldItem };
        } else if (clicked.itemId === heldItem.itemId) {
          const canFit = Math.min(heldItem.count, MAX_STACK - clicked.count);
          arr[index] = { ...clicked, count: clicked.count + canFit };
        } else {
          arr[index] = { ...heldItem };
        }
      } else {
        if (!isSlotEmpty(clicked)) {
          arr[index] = { ...EMPTY_SLOT };
        }
      }

      return source === 'hotbar' ? { ...state, hotbar: arr } : { ...state, backpack: arr };
    }
    case 'PLACE_ONE': {
      const { source, index, itemId } = action;
      const arr = source === 'hotbar' ? [...state.hotbar] : [...state.backpack];
      const clicked = getSlot(arr, index);
      if (isSlotEmpty(clicked)) {
        arr[index] = makeSlot(itemId, 1);
      } else if (clicked.itemId === itemId && clicked.count < MAX_STACK) {
        arr[index] = { ...clicked, count: clicked.count + 1 };
      }
      return source === 'hotbar' ? { ...state, hotbar: arr } : { ...state, backpack: arr };
    }
    case 'PICK_HALF': {
      const { source, index } = action;
      const arr = source === 'hotbar' ? [...state.hotbar] : [...state.backpack];
      const clicked = getSlot(arr, index);
      if (isSlotEmpty(clicked)) return state;
      const half = Math.ceil(clicked.count / 2);
      arr[index] = { ...clicked, count: clicked.count - half };
      if (arr[index].count <= 0) arr[index] = { ...EMPTY_SLOT };
      return source === 'hotbar' ? { ...state, hotbar: arr } : { ...state, backpack: arr };
    }
    case 'REMOVE_FROM_SLOT': {
      const { source, index, count } = action;
      const arr = source === 'hotbar' ? [...state.hotbar] : [...state.backpack];
      const slot = getSlot(arr, index);
      if (isSlotEmpty(slot)) return state;
      const newCount = slot.count - count;
      arr[index] = newCount > 0 ? { ...slot, count: newCount } : { ...EMPTY_SLOT };
      return source === 'hotbar' ? { ...state, hotbar: arr } : { ...state, backpack: arr };
    }
    case 'QUICK_MOVE': {
      const { source, index } = action;
      const fromArr = source === 'hotbar' ? [...state.hotbar] : [...state.backpack];
      const toSource = source === 'hotbar' ? 'backpack' : 'hotbar';
      const toArr = toSource === 'hotbar' ? [...state.hotbar] : [...state.backpack];
      const slot = getSlot(fromArr, index);
      if (isSlotEmpty(slot)) return state;
      let remaining = slot.count;
      // Stack into existing same-type slots first
      for (let i = 0; i < toArr.length && remaining > 0; i++) {
        if (toArr[i].itemId === slot.itemId && toArr[i].count < MAX_STACK) {
          const canFit = Math.min(remaining, MAX_STACK - toArr[i].count);
          toArr[i] = { ...toArr[i], count: toArr[i].count + canFit };
          remaining -= canFit;
        }
      }
      // Fill empty slots
      for (let i = 0; i < toArr.length && remaining > 0; i++) {
        if (isSlotEmpty(toArr[i])) {
          const count = Math.min(remaining, MAX_STACK);
          toArr[i] = makeSlot(slot.itemId, count);
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
      const { itemId, count = 1 } = action;
      const backpack = [...state.backpack];
      const hotbar = [...state.hotbar];
      let remaining = count;
      // Stack into existing backpack slots
      for (let i = 0; i < backpack.length && remaining > 0; i++) {
        if (backpack[i].itemId === itemId && backpack[i].count < MAX_STACK) {
          const canFit = Math.min(remaining, MAX_STACK - backpack[i].count);
          backpack[i] = { ...backpack[i], count: backpack[i].count + canFit };
          remaining -= canFit;
        }
      }
      // Fill empty backpack slots
      for (let i = 0; i < backpack.length && remaining > 0; i++) {
        if (isSlotEmpty(backpack[i])) {
          const c = Math.min(remaining, MAX_STACK);
          backpack[i] = makeSlot(itemId, c);
          remaining -= c;
        }
      }
      // Stack into existing hotbar slots
      for (let i = 0; i < hotbar.length && remaining > 0; i++) {
        if (hotbar[i].itemId === itemId && hotbar[i].count < MAX_STACK) {
          const canFit = Math.min(remaining, MAX_STACK - hotbar[i].count);
          hotbar[i] = { ...hotbar[i], count: hotbar[i].count + canFit };
          remaining -= canFit;
        }
      }
      // Fill empty hotbar slots
      for (let i = 0; i < hotbar.length && remaining > 0; i++) {
        if (isSlotEmpty(hotbar[i])) {
          const c = Math.min(remaining, MAX_STACK);
          hotbar[i] = makeSlot(itemId, c);
          remaining -= c;
        }
      }
      return { hotbar, backpack };
    }
    case 'DISTRIBUTE_LEFT': {
      const { slots, heldItem } = action;
      let hotbar = [...state.hotbar];
      let backpack = [...state.backpack];
      const perSlot = Math.floor(heldItem.count / slots.length);
      if (perSlot === 0) return state;
      for (let i = 0; i < slots.length; i++) {
        const { source, index } = slots[i];
        const arr = source === 'hotbar' ? hotbar : backpack;
        const slot = getSlot(arr, index);
        if (isSlotEmpty(slot) || slot.itemId === heldItem.itemId) {
          const canFit = Math.min(perSlot, MAX_STACK - slot.count);
          if (canFit > 0) {
            arr[index] = isSlotEmpty(slot)
              ? makeSlot(heldItem.itemId, canFit)
              : { ...slot, count: slot.count + canFit };
          }
        }
      }
      return { hotbar, backpack };
    }
    case 'DISTRIBUTE_RIGHT': {
      const { slots, heldItem } = action;
      let hotbar = [...state.hotbar];
      let backpack = [...state.backpack];
      for (let i = 0; i < slots.length; i++) {
        const { source, index } = slots[i];
        const arr = source === 'hotbar' ? hotbar : backpack;
        const slot = getSlot(arr, index);
        if (isSlotEmpty(slot)) {
          arr[index] = makeSlot(heldItem.itemId, 1);
        } else if (slot.itemId === heldItem.itemId && slot.count < MAX_STACK) {
          arr[index] = { ...slot, count: slot.count + 1 };
        }
      }
      return { hotbar, backpack };
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
    chunksPerFrame: 1,
    renderDistance: 8,
    fogDensity: 40,
  });

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);

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
  const [hoveredSlot, setHoveredSlot] = useState<{ source: 'hotbar' | 'backpack'; index: number } | null>(null);

  // Refs
  const selectedSlotRef = useRef(selectedSlot);
  selectedSlotRef.current = selectedSlot;
  const hotbarRef = useRef(inv.hotbar);
  hotbarRef.current = inv.hotbar;
  const backpackRef = useRef(inv.backpack);
  backpackRef.current = inv.backpack;
  const heldItemRef = useRef(heldItem);
  heldItemRef.current = heldItem;
  const isBackpackOpenRef = useRef(isBackpackOpen);
  isBackpackOpenRef.current = isBackpackOpen;
  const hoveredSlotRef = useRef(hoveredSlot);
  hoveredSlotRef.current = hoveredSlot;
  const isChatOpenRef = useRef(isChatOpen);
  isChatOpenRef.current = isChatOpen;
  const showSettingsRef = useRef(showSettings);
  showSettingsRef.current = showSettings;

  // Track mouse position for held item
  useEffect(() => {
    const onMove = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
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

    // Creative tab (negative index: -1 - itemId)
    if (source === 'backpack' && index < 0) {
      const itemId = -1 - index;
      if (shiftKey && heldItem) { setHeldItem(null); return; }
      if (shiftKey && !heldItem) { setHeldItem(makeSlot(itemId, MAX_STACK)); return; }
      if (heldItem && !isSlotEmpty(heldItem)) { dispatch({ type: 'ADD_TO_BACKPACK', itemId: heldItem.itemId, count: heldItem.count }); }
      setHeldItem(makeSlot(itemId, MAX_STACK));
      return;
    }

    const arr = source === 'hotbar' ? hotbarRef.current : backpackRef.current;
    const clicked = getSlot(arr, index);

    // Shift+click: quick move
    if (shiftKey) {
      if (!isSlotEmpty(clicked)) {
        dispatch({ type: 'QUICK_MOVE', source, index });
      }
      return;
    }

    if (heldItem && !isSlotEmpty(heldItem)) {
      if (button === 2) {
        // Right click: place 1
        if (isSlotEmpty(clicked) || clicked.itemId === heldItem.itemId) {
          if (clicked.count < MAX_STACK) {
            dispatch({ type: 'PLACE_ONE', source, index, itemId: heldItem.itemId });
            setHeldItem(heldItem.count <= 1 ? null : { ...heldItem, count: heldItem.count - 1 });
          }
        }
      } else {
        // Left click: place all or swap
        if (isSlotEmpty(clicked)) {
          dispatch({ type: 'CLICK_SLOT', source, index, heldItem });
          setHeldItem(null);
        } else if (clicked.itemId === heldItem.itemId) {
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
      if (!isSlotEmpty(clicked)) {
        if (button === 2) {
          // Right click: pick up half
          const half = Math.ceil(clicked.count / 2);
          dispatch({ type: 'PICK_HALF', source, index });
          setHeldItem({ itemId: clicked.itemId, count: half });
        } else {
          // Left click: pick up all
          dispatch({ type: 'CLICK_SLOT', source, index, heldItem: null });
          setHeldItem({ ...clicked });
        }
      }
    }
  }, [heldItem]);

  // Drag end: distribute held item across slots
  const handleDragEnd = useCallback((slots: { source: 'hotbar' | 'backpack'; index: number }[], button: number) => {
    const held = heldItemRef.current;
    if (!held || isSlotEmpty(held) || slots.length === 0) return;
    if (button === 0) {
      dispatch({ type: 'DISTRIBUTE_LEFT', slots, heldItem: held });
      const perSlot = Math.floor(held.count / slots.length);
      const distributed = perSlot * slots.length;
      const leftover = held.count - distributed;
      setHeldItem(leftover > 0 ? { ...held, count: leftover } : null);
    } else if (button === 2) {
      dispatch({ type: 'DISTRIBUTE_RIGHT', slots, heldItem: held });
      const used = Math.min(held.count, slots.length);
      const leftover = held.count - used;
      setHeldItem(leftover > 0 ? { ...held, count: leftover } : null);
    }
  }, []);

  // Close backpack: drop held item back into first empty slot, then lock pointer
  const closeBackpack = useCallback(() => {
    if (heldItem && !isSlotEmpty(heldItem)) {
      dispatch({ type: 'ADD_TO_BACKPACK', itemId: heldItem.itemId, count: heldItem.count });
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

    // Wire player inventory callbacks
    engine.getPlayer().setGetSelectedItemId(() => {
      const slot = hotbarRef.current[selectedSlotRef.current];
      return slot?.itemId ?? EMPTY_ITEM_ID;
    });

    // Wire item pickup: add to backpack when entity manager collects a drop
    engine.setOnItemPickup((itemId, count) => {
      // Check if there's space in backpack or hotbar
      const canFit = (slot: Slot) =>
        (isSlotEmpty(slot)) || (slot.itemId === itemId && slot.count < 64);
      const hasSpace =
        backpackRef.current.some(canFit) || hotbarRef.current.some(canFit);
      if (hasSpace) {
        dispatch({ type: 'ADD_TO_BACKPACK', itemId, count });
        return true;
      }
      return false;
    });

    engine.start();
    return () => { engine.dispose(); engineRef.current = null; };
  }, []);

  // Sync uiOpen
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.getPlayer().uiOpen = isBackpackOpen || showSettings || isChatOpen;
  }, [isBackpackOpen, showSettings, isChatOpen]);

  // Keyboard handler using key binding system
  useEffect(() => {
    const kb = DEFAULT_KEYBINDS;

    const onKey = (e: KeyboardEvent) => {
      // ESC: close UIs in priority order (chat > backpack > settings), or open settings
      if (isKey(e, kb.settings)) {
        e.preventDefault();
        if (isChatOpenRef.current) {
          setIsChatOpen(false);
          setTimeout(() => engineRef.current?.requestPointerLock(), 50);
        } else if (isBackpackOpenRef.current) {
          if (heldItemRef.current && !isSlotEmpty(heldItemRef.current)) {
            dispatch({ type: 'ADD_TO_BACKPACK', itemId: heldItemRef.current.itemId, count: heldItemRef.current.count });
            setHeldItem(null);
          }
          setIsBackpackOpen(false);
          setTimeout(() => engineRef.current?.requestPointerLock(), 50);
        } else if (showSettingsRef.current) {
          setShowSettings(false);
          setTimeout(() => engineRef.current?.requestPointerLock(), 50);
        } else {
          engineRef.current?.exitPointerLock();
          setShowSettings(true);
        }
        return;
      }

      // When chat is open, block all other keybindings
      if (isChatOpenRef.current) {
        return;
      }

      // Open inventory
      if (isKey(e, kb.openInventory)) {
        e.preventDefault();
        setIsBackpackOpen(prev => {
          if (!prev) {
            engineRef.current?.exitPointerLock();
            setBackpackTab('inventory');
          } else {
            if (heldItemRef.current && !isSlotEmpty(heldItemRef.current)) {
              dispatch({ type: 'ADD_TO_BACKPACK', itemId: heldItemRef.current.itemId, count: heldItemRef.current.count });
              setHeldItem(null);
            }
            setTimeout(() => engineRef.current?.requestPointerLock(), 50);
          }
          return !prev;
        });
        return;
      }

      // Debug overlay
      if (isKey(e, kb.debugOverlay)) {
        e.preventDefault();
        setShowDebug(prev => !prev);
        return;
      }

      // Open chat (T) - only when backpack is closed
      if (isKey(e, kb.openChat) && !isChatOpen && !isBackpackOpenRef.current) {
        e.preventDefault();
        setIsChatOpen(true);
        engineRef.current?.exitPointerLock();
        return;
      }

      // Throw item (Q)
      if (isKey(e, kb.throwItem)) {
        e.preventDefault();
        const throwCount = e.ctrlKey ? 64 : 1;
        const held = heldItemRef.current;

        if (held && !isSlotEmpty(held)) {
          // Throw from cursor
          const count = Math.min(throwCount, held.count);
          engineRef.current?.throwItem(held.itemId, count);
          const remaining = held.count - count;
          setHeldItem(remaining > 0 ? { ...held, count: remaining } : null);
        } else if (hoveredSlotRef.current) {
          // Throw from hovered slot (when backpack is open)
          const { source, index } = hoveredSlotRef.current;
          const arr = source === 'hotbar' ? hotbarRef.current : backpackRef.current;
          const slot = arr[index];
          if (slot && !isSlotEmpty(slot)) {
            const count = Math.min(throwCount, slot.count);
            engineRef.current?.throwItem(slot.itemId, count);
            dispatch({ type: 'REMOVE_FROM_SLOT', source, index, count });
          }
        } else if (!isBackpackOpenRef.current) {
          // Throw from selected hotbar slot (when backpack is closed)
          const slot = hotbarRef.current[selectedSlotRef.current];
          if (slot && !isSlotEmpty(slot)) {
            const count = Math.min(throwCount, slot.count);
            engineRef.current?.throwItem(slot.itemId, count);
            dispatch({ type: 'REMOVE_FROM_SLOT', source: 'hotbar', index: selectedSlotRef.current, count });
          }
        }
        return;
      }

      // Hotbar selection (1-9)
      for (let i = 1; i <= 9; i++) {
        const binding = kb[`hotbar${i}` as keyof typeof kb];
        if (isKey(e, binding)) {
          setSelectedSlot(i - 1);
          return;
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Chat handlers
  const addChatMessage = useCallback((sender: string, text: string) => {
    setChatMessages(prev => [...prev, { sender, text, time: Date.now() }]);
  }, []);

  const handleChatSend = useCallback((text: string) => {
    if (text.startsWith('/')) {
      // Command
      const engine = engineRef.current;
      if (!engine) return;
      const player = engine.getPlayer();
      executeCommand(text, {
        addMessage: addChatMessage,
        giveItem: (itemId, count) => {
          dispatch({ type: 'ADD_TO_BACKPACK', itemId, count });
        },
        teleport: (x, y, z) => {
          player.position.set(x, y, z);
        },
        clearInventory: () => {
          // Reset both hotbar and backpack to empty
          for (let i = 0; i < 9; i++) {
            dispatch({ type: 'DELETE_ITEM', source: 'hotbar', index: i });
          }
          for (let i = 0; i < 36; i++) {
            dispatch({ type: 'DELETE_ITEM', source: 'backpack', index: i });
          }
        },
        killEntities: () => {
          engine.getWorld(); // entities are managed by engine
          // Kill all entities through entity manager
          const entities = engine.getPlayer()['entityManager']?.getEntities?.();
          if (entities) {
            for (let i = entities.length - 1; i >= 0; i--) {
              if (!entities[i].constructor.name.includes('DroppedItem')) {
                entities[i].hp = 0;
              }
            }
          }
        },
        getPlayerPos: () => {
          const p = player.position;
          return { x: p.x, y: p.y, z: p.z };
        },
        setWireframe: (enabled: boolean) => {
          engine.setWireframe(enabled);
        },
      });
    } else {
      addChatMessage('Player', text);
    }
  }, [addChatMessage]);

  const handleChatClose = useCallback(() => {
    setIsChatOpen(false);
    setTimeout(() => engineRef.current?.requestPointerLock(), 50);
  }, []);

  // Scroll wheel
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (isBackpackOpenRef.current || isChatOpenRef.current) return;
      setSelectedSlot(prev => {
        const dir = e.deltaY > 0 ? 1 : -1;
        return ((prev + dir) % 9 + 9) % 9;
      });
    };
    document.addEventListener('wheel', onWheel, { passive: true });
    return () => document.removeEventListener('wheel', onWheel);
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
        onSlotClick={(i, button, shiftKey) => handleSlotClick('hotbar', i, button, shiftKey)}
      />

      {isBackpackOpen && (
        <Backpack
          hotbar={inv.hotbar}
          backpack={inv.backpack}
          selected={selectedSlot}
          tab={backpackTab}
          onTabChange={setBackpackTab}
          heldItem={heldItem}
          onSlotClick={handleSlotClick}
          onDragEnd={handleDragEnd}
          onHoverSlot={setHoveredSlot}
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

      <Chat
        messages={chatMessages}
        onSend={handleChatSend}
        visible={isChatOpen}
        onClose={handleChatClose}
      />

      {/* Debug overlay */}
      {showDebug && (
        <DebugOverlay fps={fps} x={playerPos.x} y={playerPos.y} z={playerPos.z} />
      )}

      {/* Held item following cursor */}
      {heldItem && !isSlotEmpty(heldItem) && (
        <div
          className="held-item"
          style={{
            left: mousePos.x,
            top: mousePos.y,
          }}
        >
          <BlockCube itemId={heldItem.itemId} size={24} />
          {heldItem.count > 1 && (
            <span className="count">{heldItem.count}</span>
          )}
        </div>
      )}
    </div>
  );
}
