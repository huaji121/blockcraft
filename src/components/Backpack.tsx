import { useState } from 'react';
import { BlockType, ALL_BLOCKS } from '../game/blocks';
import { BlockCube } from './BlockCube';
import './Inventory.css';

interface Slot {
  type: BlockType;
  count: number;
}

export type BackpackTab = 'inventory' | 'creative';

interface Props {
  hotbar: Slot[];
  backpack: Slot[];
  selected: number;
  tab: BackpackTab;
  onTabChange: (tab: BackpackTab) => void;
  onSlotClick: (source: 'hotbar' | 'backpack', index: number, button: number, shiftKey: boolean) => void;
  onClose: () => void;
}

export const DELETE_SLOT_INDEX = -100;

export function Backpack({
  hotbar, backpack, selected,
  tab, onTabChange,
  onSlotClick, onClose,
}: Props) {
  const handleMouseDown = (e: React.MouseEvent, source: 'hotbar' | 'backpack', index: number) => {
    e.preventDefault();
    e.stopPropagation();
    onSlotClick(source, index, e.button, e.shiftKey);
  };

  const renderSlot = (slot: Slot) => (
    <>
      {slot.type !== 0 && <BlockCube blockType={slot.type} size={22} />}
      {slot.count > 1 && <span className="count">{slot.count}</span>}
    </>
  );

  return (
    <div className="inv-overlay" onClick={onClose}>
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
                  <div key={`bp-${i}`} className="inv-slot" onMouseDown={(e) => handleMouseDown(e, 'backpack', i)} onContextMenu={(e) => e.preventDefault()}>
                    {renderSlot(slot)}
                  </div>
                ))}
              </div>
              <div className="backpack-divider" />
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <div className="inv-slot delete-slot" title="Delete" onMouseDown={(e) => handleMouseDown(e, 'backpack', DELETE_SLOT_INDEX)} onContextMenu={(e) => e.preventDefault()}>
                  <span className="delete-x">✕</span>
                </div>
                <div className="inv-grid inv-grid-9" style={{ flex: 1 }}>
                  {hotbar.map((slot, i) => (
                    <div key={`hb-${i}`} className={`inv-slot ${i === selected ? 'selected' : ''}`} onMouseDown={(e) => handleMouseDown(e, 'hotbar', i)} onContextMenu={(e) => e.preventDefault()}>
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
                  {ALL_BLOCKS.map((bt) => (
                    <div key={bt} className="inv-slot" onMouseDown={(e) => handleMouseDown(e, 'backpack', -1 - bt)} onContextMenu={(e) => e.preventDefault()}>
                      <BlockCube blockType={bt} size={22} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="backpack-divider" />
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <div className="inv-slot delete-slot" title="Delete" onMouseDown={(e) => handleMouseDown(e, 'backpack', DELETE_SLOT_INDEX)} onContextMenu={(e) => e.preventDefault()}>
                  <span className="delete-x">✕</span>
                </div>
                <div className="inv-grid inv-grid-9" style={{ flex: 1 }}>
                  {hotbar.map((slot, i) => (
                    <div key={`hb-${i}`} className={`inv-slot ${i === selected ? 'selected' : ''}`} onMouseDown={(e) => handleMouseDown(e, 'hotbar', i)} onContextMenu={(e) => e.preventDefault()}>
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
