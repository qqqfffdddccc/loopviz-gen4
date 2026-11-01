import { useId } from "react";

interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}

export function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  const id = useId();
  const shown = options.includes(value) ? options : [value, ...options];
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {shown.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
