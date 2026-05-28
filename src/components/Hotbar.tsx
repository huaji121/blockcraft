import { BlockType, BLOCK_DATA } from '../game/blocks';
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
            {slot.type !== 0 && data.texture && (
              <img
                src={data.texture}
                alt={data.name}
                draggable={false}
                className={slot.type === BlockType.GRASS ? 'grass-tint' : undefined}
              />
            )}
            {slot.count > 1 && <span className="count">{slot.count}</span>}
          </div>
        );
      })}
    </div>
  );
}
