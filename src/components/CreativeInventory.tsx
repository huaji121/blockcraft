import { BLOCK_DATA, ALL_BLOCKS } from '../game/blocks';
import './Inventory.css';

interface Props {
  onSelect: (blockType: number) => void;
  onBack: () => void;
}

export function CreativeInventory({ onSelect, onBack }: Props) {
  return (
    <div className="inv-overlay" onClick={onBack}>
      <div className="inv-panel" onClick={(e) => e.stopPropagation()}>
        <div className="inv-title">Creative Inventory</div>

        <div className="creative-grid-wrap">
          <div className="inv-grid inv-grid-6">
            {ALL_BLOCKS.map((bt) => {
              const data = BLOCK_DATA[bt];
              return (
                <div
                  key={bt}
                  className="inv-slot"
                  title={data.name}
                  onClick={() => onSelect(bt)}
                >
                  {data.texture && (
                    <img src={data.texture} alt={data.name} draggable={false} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button className="inv-btn" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
