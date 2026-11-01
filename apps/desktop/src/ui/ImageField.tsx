import { useId, useState } from "react";
import { readImageAsDataUrl } from "../runtime/image-file";

interface ImageFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ImageField({ label, value, onChange }: ImageFieldProps) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const pick = (file: File | undefined): void => {
    if (!file) return;
    readImageAsDataUrl(file).then(
      (dataUrl) => {
        setError(null);
        onChange(dataUrl);
      },
      (reason: unknown) => setError(reason instanceof Error ? reason.message : "Ошибка чтения файла"),
    );
  };
  return (
    <div className="field image-field">
      <label htmlFor={id}>{label}</label>
      <span className="image-actions">
        <label className="file-button" htmlFor={id}>
          [+] {value ? "ЗАМЕНИТЬ" : "ВЫБРАТЬ"}
        </label>
        {value ? (
          <button type="button" onClick={() => onChange("")}>
            [ ] УБРАТЬ
          </button>
        ) : null}
      </span>
      {value ? <img className="image-thumb" src={value} alt="" /> : null}
      {error ? <span className="notice">{error}</span> : null}
      <input
        id={id}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        onChange={(event) => {
          pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
