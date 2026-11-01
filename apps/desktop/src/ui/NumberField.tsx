import { useId, useState } from "react";

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onCommit: (value: number) => void;
}

/** Пока пользователь печатает, показывает его текст. Значение уходит наружу, когда оно число в диапазоне. */
export function NumberField({ label, value, min, max, step = 1, suffix, onCommit }: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="field number-field">
      <label htmlFor={id}>{label}</label>
      <span className="number-input">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft ?? String(value)}
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = event.target.valueAsNumber;
            if (Number.isFinite(parsed) && parsed >= min && parsed <= max) onCommit(parsed);
          }}
          onBlur={() => setDraft(null)}
        />
        {suffix ? <span className="muted-inline">{suffix}</span> : null}
      </span>
    </div>
  );
}
