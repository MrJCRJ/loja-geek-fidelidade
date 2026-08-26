type Props = {
  value: string;
  label: string;
  maxLength?: number;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"] as const;

export function PinPad({ value, label, maxLength = 8, onChange, onSubmit, onCancel }: Props) {
  const press = (key: (typeof KEYS)[number]) => {
    if (key === "⌫") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === "OK") {
      onSubmit();
      return;
    }
    if (value.length >= maxLength) return;
    onChange(value + key);
  };

  return (
    <div className="pin-pad" role="group" aria-label={label}>
      <p className="pin-pad-label">{label}</p>
      <div className="pin-pad-dots" aria-live="polite">
        {Array.from({ length: Math.max(4, value.length || 4) }, (_, i) => (
          <span key={i} className={`pin-pad-dot ${i < value.length ? "on" : ""}`} />
        ))}
      </div>
      <div className="pin-pad-grid">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`pin-pad-key ${key === "OK" ? "ok" : ""} ${key === "⌫" ? "back" : ""}`}
            onClick={() => press(key)}
          >
            {key}
          </button>
        ))}
      </div>
      {onCancel ? (
        <button className="btn ghost pin-pad-cancel" type="button" onClick={onCancel}>
          Cancelar
        </button>
      ) : null}
    </div>
  );
}
