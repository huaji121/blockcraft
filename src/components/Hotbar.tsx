import { type Slot, isSlotEmpty } from '../game/items';
import { BlockCube } from './BlockCube';
import './Inventory.css';

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
          {!isSlotEmpty(slot) && <BlockCube itemId={slot.itemId} size={22} />}
          {slot.count > 1 && <span className="count">{slot.count}</span>}
        </div>
      ))}
    </div>
  );
}
