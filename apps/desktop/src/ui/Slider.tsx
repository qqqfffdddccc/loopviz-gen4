import { useId, type CSSProperties } from "react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  /** CSS-градиент для дорожки, например шкала оттенка. */
  track?: string;
  onChange: (value: number) => void;
}

interface TrackStyle extends CSSProperties {
  "--track"?: string;
}

export function Slider({ label, value, min, max, step, format, track, onChange }: SliderProps) {
  const id = useId();
  const style: TrackStyle | undefined = track ? { "--track": track } : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        className={track ? "slider-track" : undefined}
        style={style}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
      <output htmlFor={id}>{format ? format(value) : value.toFixed(2)}</output>
    </div>
  );
}
