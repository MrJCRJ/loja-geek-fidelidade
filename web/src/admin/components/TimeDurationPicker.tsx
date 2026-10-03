const MIN_MINUTES = 5;
const MAX_HOURS = 23;

type Props = {
  hours: number;
  minutes: number;
  onChange: (hours: number, minutes: number) => void;
};

function Wheel({
  value,
  options,
  onPick,
  label,
}: {
  value: number;
  options: number[];
  onPick: (n: number) => void;
  label: string;
}) {
  return (
    <div className="time-wheel-col">
      <span className="muted" style={{ fontSize: "0.75rem" }}>
        {label}
      </span>
      <div className="time-wheel" role="listbox" aria-label={label}>
        {options.map((n) => (
          <button
            key={n}
            type="button"
            className={`time-wheel-item ${n === value ? "on" : ""}`}
            onClick={() => onPick(n)}
          >
            {String(n).padStart(2, "0")}
          </button>
        ))}
      </div>
    </div>
  );
}

export function durationToSeconds(hours: number, minutes: number) {
  return hours * 3600 + minutes * 60;
}

export function TimeDurationPicker({ hours, minutes, onChange }: Props) {
  const hourOpts = Array.from({ length: MAX_HOURS + 1 }, (_, i) => i);
  const minOpts =
    hours === 0
      ? Array.from({ length: 60 - MIN_MINUTES }, (_, i) => i + MIN_MINUTES)
      : Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="time-wheels">
      <Wheel
        label="Hora"
        value={hours}
        options={hourOpts}
        onPick={(h) => {
          const m = h === 0 ? Math.max(MIN_MINUTES, minutes) : minutes;
          onChange(h, m);
        }}
      />
      <Wheel
        label="Min"
        value={minutes}
        options={minOpts}
        onPick={(m) => onChange(hours, m)}
      />
    </div>
  );
}
