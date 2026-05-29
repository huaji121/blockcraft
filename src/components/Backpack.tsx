import { useState } from 'react';
import { BlockType, BLOCK_DATA, ALL_BLOCKS } from '../game/blocks';
import { BlockCube } from './BlockCube';
import './Inventory.css';

interface Slot {
  type: BlockType;
  count: number;
}

interface Props {
  hotbar: Slot[];
  backpack: Slot[];
  selected: number;
  onSlotClick: (source: 'hotbar' | 'backpack', index: number) => void;
  onClose: () => void;
}

export function Backpack({
  hotbar, backpack, selected,
  onSlotClick, onClose,
}: Props) {
  const [tab, setTab] = useState<'inventory' | 'creative'>('inventory');

  const renderSlot = (slot: Slot) => {
    const data = BLOCK_DATA[slot.type];
    return (
      <>
        {slot.type !== 0 && <BlockCube blockType={slot.type} size={22} />}
        {slot.count > 1 && <span className="count">{slot.count}</span>}
      </>
    );
  };

  return (
    <div className="inv-overlay" onClick={onClose}>
      <div className="inv-panel" onClick={(e) => e.stopPropagation()}>
        {/* Tabs */}
        <div className="inv-tabs">
          <button
            className={`inv-tab ${tab === 'inventory' ? 'active' : ''}`}
            onClick={() => setTab('inventory')}
          >
            Inventory
          </button>
          <button
            className={`inv-tab ${tab === 'creative' ? 'active' : ''}`}
            onClick={() => setTab('creative')}
          >
            Creative
          </button>
        </div>

        <div className="backpack-body">
          {tab === 'inventory' ? (
            <>
              {/* Backpack grid: 3 rows x 9 */}
              <div className="inv-grid inv-grid-9">
                {backpack.map((slot, i) => (
                  <div
                    key={`bp-${i}`}
                    className="inv-slot"
                    onClick={() => onSlotClick('backpack', i)}
                  >
                    {renderSlot(slot)}
                  </div>
                ))}
              </div>

              <div className="backpack-divider" />

              {/* Hotbar row */}
              <div className="inv-grid inv-grid-9">
                {hotbar.map((slot, i) => (
                  <div
                    key={`hb-${i}`}
                    className={`inv-slot ${i === selected ? 'selected' : ''}`}
                    onClick={() => onSlotClick('hotbar', i)}
                  >
                    {renderSlot(slot)}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Creative grid: all block types */}
              <div className="creative-grid-wrap">
                <div className="inv-grid inv-grid-9">
                  {ALL_BLOCKS.map((bt) => {
                    const data = BLOCK_DATA[bt];
                    return (
                      <div
                        key={bt}
                        className="inv-slot"
                        title={data.name}
                        onClick={() => onSlotClick('backpack', -1 - bt)}
                      >
                        <BlockCube blockType={bt} size={22} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="backpack-divider" />

              {/* Hotbar row */}
              <div className="inv-grid inv-grid-9">
                {hotbar.map((slot, i) => (
                  <div
                    key={`hb-${i}`}
                    className={`inv-slot ${i === selected ? 'selected' : ''}`}
                    onClick={() => onSlotClick('hotbar', i)}
                  >
                    {renderSlot(slot)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <button className="inv-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
