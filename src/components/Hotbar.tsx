import { BlockType } from '../game/blocks';
import { BlockCube } from './BlockCube';
import './Inventory.css';

interface Slot {
  type: BlockType;
  count: number;
}

interface Props {
  slots: Slot[];
  selected: number;
  onSlotClick: (index: number, button: number, shiftKey: boolean) => void;
}

export function Hotbar({ slots, selected, onSlotClick }: Props) {
  return (
    <div className="hotbar">
      {slots.map((slot, i) => (
        <div
          key={i}
          className={`inv-slot ${i === selected ? 'selected' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); onSlotClick(i, e.button, e.shiftKey); }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {slot.type !== 0 && <BlockCube blockType={slot.type} size={22} />}
          {slot.count > 1 && <span className="count">{slot.count}</span>}
        </div>
      ))}
    </div>
  );
}
