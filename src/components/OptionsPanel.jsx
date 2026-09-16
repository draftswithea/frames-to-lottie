import "./OptionsPanel.css";

export default function OptionsPanel({ options, onChange }) {
  function update(key, value) {
    onChange({ ...options, [key]: value });
  }

  return (
    <div className="options">
      <div className="field">
        <label htmlFor="optSize">output size (px, square)</label>
        <input
          id="optSize"
          type="number"
          min={16}
          max={4000}
          value={options.size}
          onChange={(e) => update("size", parseInt(e.target.value, 10) || options.size)}
        />
      </div>
      <div className="field">
        <label htmlFor="optFr">frame rate (fps)</label>
        <input
          id="optFr"
          type="number"
          min={1}
          max={60}
          value={options.fr}
          onChange={(e) => update("fr", parseInt(e.target.value, 10) || options.fr)}
        />
      </div>
      <div className="field">
        <label htmlFor="optHold">hold per frame (ticks)</label>
        <input
          id="optHold"
          type="number"
          min={1}
          max={30}
          value={options.hold}
          onChange={(e) => update("hold", parseInt(e.target.value, 10) || options.hold)}
        />
      </div>
    </div>
  );
}
