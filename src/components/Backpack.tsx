import { BlockType, BLOCK_DATA } from '../game/blocks';
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
  onOpenCreative: () => void;
}

export function Backpack({
  hotbar, backpack, selected,
  onSlotClick, onClose, onOpenCreative,
}: Props) {
  return (
    <div className="inv-overlay" onClick={onClose}>
      <div className="inv-panel" onClick={(e) => e.stopPropagation()}>
        <div className="inv-title">Backpack</div>
        <button className="inv-btn" onClick={onOpenCreative}>
          Creative Inventory
        </button>

        <div className="backpack-body">
          {/* Backpack grid: 3 rows x 9 */}
          <div className="inv-grid inv-grid-9">
            {backpack.map((slot, i) => {
              const data = BLOCK_DATA[slot.type];
              return (
                <div
                  key={`bp-${i}`}
                  className="inv-slot"
                  onClick={() => onSlotClick('backpack', i)}
                >
                  {slot.type !== 0 && data.texture && (
                    <img src={data.texture} alt={data.name} draggable={false} />
                  )}
                  {slot.count > 1 && <span className="count">{slot.count}</span>}
                </div>
              );
            })}
          </div>

          <div className="backpack-divider" />

          {/* Hotbar row */}
          <div className="inv-grid inv-grid-9">
            {hotbar.map((slot, i) => {
              const data = BLOCK_DATA[slot.type];
              return (
                <div
                  key={`hb-${i}`}
                  className={`inv-slot ${i === selected ? 'selected' : ''}`}
                  onClick={() => onSlotClick('hotbar', i)}
                >
                  {slot.type !== 0 && data.texture && (
                    <img src={data.texture} alt={data.name} draggable={false} />
                  )}
                  {slot.count > 1 && <span className="count">{slot.count}</span>}
                </div>
              );
            })}
          </div>
        </div>

        <button className="inv-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
