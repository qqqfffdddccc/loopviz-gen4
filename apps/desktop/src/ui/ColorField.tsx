import { useId } from "react";

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const id = useId();
  return (
    <div className="field color-field">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{value.toUpperCase()}</output>
      <input id={id} type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
