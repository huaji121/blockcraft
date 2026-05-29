import './Inventory.css';

export interface GameSettings {
  fpsLimit: number;
  chunksPerFrame: number;
  renderDistance: number;
}

interface Props {
  settings: GameSettings;
  onChange: (settings: GameSettings) => void;
  onClose: () => void;
}

export function Settings({ settings, onChange, onClose }: Props) {
  const update = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="inv-overlay" onClick={onClose}>
      <div className="inv-panel settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="inv-title">Settings</div>

        <div className="settings-row">
          <label>FPS Limit: {settings.fpsLimit === 0 ? 'Unlimited' : settings.fpsLimit}</label>
          <input
            type="range"
            min={0}
            max={240}
            step={10}
            value={settings.fpsLimit}
            onChange={(e) => update('fpsLimit', Number(e.target.value))}
          />
        </div>

        <div className="settings-row">
          <label>Chunks/Frame: {settings.chunksPerFrame}</label>
          <input
            type="range"
            min={1}
            max={32}
            step={1}
            value={settings.chunksPerFrame}
            onChange={(e) => update('chunksPerFrame', Number(e.target.value))}
          />
        </div>

        <div className="settings-row">
          <label>Render Distance: {settings.renderDistance}</label>
          <input
            type="range"
            min={2}
            max={16}
            step={1}
            value={settings.renderDistance}
            onChange={(e) => update('renderDistance', Number(e.target.value))}
          />
        </div>

        <button className="inv-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
