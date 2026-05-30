import { useRef } from 'react';
import { type Slot, EMPTY_ITEM_ID, isSlotEmpty, ITEM_REGISTRY } from '../game/items';
import { BlockCube } from './BlockCube';
import './Inventory.css';

export type BackpackTab = 'inventory' | 'creative';

interface Props {
  hotbar: Slot[];
  backpack: Slot[];
  selected: number;
  tab: BackpackTab;
  onTabChange: (tab: BackpackTab) => void;
  heldItem: Slot | null;
  onSlotClick: (source: 'hotbar' | 'backpack', index: number, button: number, shiftKey: boolean) => void;
  onDragEnd: (slots: { source: 'hotbar' | 'backpack'; index: number }[], button: number) => void;
  onHoverSlot: (slot: { source: 'hotbar' | 'backpack'; index: number } | null) => void;
  onClose: () => void;
}

export const DELETE_SLOT_INDEX = -100;

function slotKey(source: string, index: number): string {
  return `${source}:${index}`;
}

export function Backpack({
  hotbar, backpack, selected,
  tab, onTabChange, heldItem,
  onSlotClick, onDragEnd, onHoverSlot, onClose,
}: Props) {
  const dragRef = useRef({
    active: false,
    button: 0,
    visited: new Set<string>(),
    slots: [] as { source: 'hotbar' | 'backpack'; index: number }[],
  });

  const handleMouseDown = (e: React.MouseEvent, source: 'hotbar' | 'backpack', index: number) => {
    e.preventDefault();
    e.stopPropagation();

    // If holding an item and not shift-clicking, start drag (defer click to mouseup)
    if (heldItem && !isSlotEmpty(heldItem) && !e.shiftKey && index >= 0) {
      dragRef.current = {
        active: true,
        button: e.button,
        visited: new Set([slotKey(source, index)]),
        slots: [{ source, index }],
      };
      return; // Don't call onSlotClick yet
    }

    // No drag: handle click immediately
    onSlotClick(source, index, e.button, e.shiftKey);
  };

  const handleMouseEnter = (source: 'hotbar' | 'backpack', index: number) => {
    onHoverSlot({ source, index });
    const drag = dragRef.current;
    if (!drag.active || index < 0) return;
    const key = slotKey(source, index);
    if (drag.visited.has(key)) return;
    drag.visited.add(key);
    drag.slots.push({ source, index });
  };

  const handleMouseLeave = () => {
    onHoverSlot(null);
  };

  const handleMouseUp = () => {
    const drag = dragRef.current;
    if (!drag.active) return;
    drag.active = false;

    if (drag.slots.length > 1) {
      // Dragged over multiple slots: distribute
      onDragEnd(drag.slots, drag.button);
    } else {
      // Single click (no drag): handle normally
      const { source, index } = drag.slots[0];
      onSlotClick(source, index, drag.button, false);
    }
  };

  const renderSlot = (slot: Slot) => (
    <>
      {!isSlotEmpty(slot) && <BlockCube itemId={slot.itemId} size={22} />}
      {slot.count > 1 && <span className="count">{slot.count}</span>}
    </>
  );

  // Creative tab: all items from registry
  const allItems = ITEM_REGISTRY.allItems;

  return (
    <div className="inv-overlay" onClick={onClose} onMouseUp={handleMouseUp}>
      <div className="inv-panel" onClick={(e) => e.stopPropagation()}>
        <div className="inv-tabs">
          <button className={`inv-tab ${tab === 'inventory' ? 'active' : ''}`} onClick={() => onTabChange('inventory')}>Inventory</button>
          <button className={`inv-tab ${tab === 'creative' ? 'active' : ''}`} onClick={() => onTabChange('creative')}>Creative</button>
        </div>

        <div className="backpack-body">
          {tab === 'inventory' ? (
            <>
              <div className="inv-grid inv-grid-9">
                {backpack.map((slot, i) => (
                  <div key={`bp-${i}`} className="inv-slot" onMouseDown={(e) => handleMouseDown(e, 'backpack', i)} onMouseEnter={() => handleMouseEnter('backpack', i)} onMouseLeave={handleMouseLeave} onContextMenu={(e) => e.preventDefault()}>
                    {renderSlot(slot)}
                  </div>
                ))}
              </div>
              <div className="backpack-divider" />
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <div className="inv-slot delete-slot" title="Delete" onMouseDown={(e) => handleMouseDown(e, 'backpack', DELETE_SLOT_INDEX)} onMouseEnter={() => onHoverSlot(null)} onMouseLeave={handleMouseLeave} onContextMenu={(e) => e.preventDefault()}>
                  <span className="delete-x">✕</span>
                </div>
                <div className="inv-grid inv-grid-9" style={{ flex: 1 }}>
                  {hotbar.map((slot, i) => (
                    <div key={`hb-${i}`} className={`inv-slot ${i === selected ? 'selected' : ''}`} onMouseDown={(e) => handleMouseDown(e, 'hotbar', i)} onMouseEnter={() => handleMouseEnter('hotbar', i)} onMouseLeave={handleMouseLeave} onContextMenu={(e) => e.preventDefault()}>
                      {renderSlot(slot)}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="creative-grid-wrap">
                <div className="inv-grid inv-grid-9">
                  {allItems.map((item) => (
                    <div key={item.id} className="inv-slot" onMouseDown={(e) => handleMouseDown(e, 'backpack', -1 - item.id)} onMouseLeave={handleMouseLeave} onContextMenu={(e) => e.preventDefault()}>
                      <BlockCube itemId={item.id} size={22} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="backpack-divider" />
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <div className="inv-slot delete-slot" title="Delete" onMouseDown={(e) => handleMouseDown(e, 'backpack', DELETE_SLOT_INDEX)} onMouseEnter={() => onHoverSlot(null)} onMouseLeave={handleMouseLeave} onContextMenu={(e) => e.preventDefault()}>
                  <span className="delete-x">✕</span>
                </div>
                <div className="inv-grid inv-grid-9" style={{ flex: 1 }}>
                  {hotbar.map((slot, i) => (
                    <div key={`hb-${i}`} className={`inv-slot ${i === selected ? 'selected' : ''}`} onMouseDown={(e) => handleMouseDown(e, 'hotbar', i)} onMouseEnter={() => handleMouseEnter('hotbar', i)} onMouseLeave={handleMouseLeave} onContextMenu={(e) => e.preventDefault()}>
                      {renderSlot(slot)}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <button className="inv-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
