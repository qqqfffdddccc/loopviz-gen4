interface CheckboxProps {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

export function Checkbox({ checked, label, onChange }: CheckboxProps) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} className="checkbox" onClick={() => onChange(!checked)}>
      <span className="checkbox-mark">{checked ? "[●]" : "[ ]"}</span> {label}
    </button>
  );
}
