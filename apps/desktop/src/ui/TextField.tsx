import { useId } from "react";

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function TextField({ label, value, onChange }: TextFieldProps) {
  const id = useId();
  return (
    <div className="field text-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} spellCheck={false} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
