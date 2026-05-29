import { BlockType, BLOCK_DATA } from '../game/blocks';
import { BlockCube } from './BlockCube';
import './Inventory.css';

interface Slot {
  type: BlockType;
  count: number;
}

interface Props {
  slots: Slot[];
  selected: number;
  onSlotClick: (index: number) => void;
}

export function Hotbar({ slots, selected, onSlotClick }: Props) {
  return (
    <div className="hotbar">
      {slots.map((slot, i) => {
        const data = BLOCK_DATA[slot.type];
        return (
          <div
            key={i}
            className={`inv-slot ${i === selected ? 'selected' : ''}`}
            onClick={() => onSlotClick(i)}
          >
            {slot.type !== 0 && <BlockCube blockType={slot.type} size={22} />}
            {slot.count > 1 && <span className="count">{slot.count}</span>}
          </div>
        );
      })}
    </div>
  );
}
