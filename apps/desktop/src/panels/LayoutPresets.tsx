import { useState, type FormEvent } from "react";
import { BUILTIN_LAYOUT_PRESETS, layoutMatchesPreset, type LayoutPreset } from "@loopviz/engine";
import { useLayoutPresets } from "../state/layout-presets-store";
import { useAppStore } from "../state/store";
import { Checkbox } from "../ui/Checkbox";
import { TextField } from "../ui/TextField";

interface PresetRowProps {
  preset: LayoutPreset;
  active: boolean;
  onApply: () => void;
  onRemove?: () => void;
}

function PresetRow({ preset, active, onApply, onRemove }: PresetRowProps) {
  return (
    <div className="preset-row">
      <Checkbox checked={active} label={preset.name} onChange={onApply} />
      {onRemove ? (
        <button type="button" className="preset-remove" aria-label={`Удалить пресет ${preset.name}`} onClick={onRemove}>
          [×]
        </button>
      ) : null}
    </div>
  );
}

function SavePreset() {
  const [name, setName] = useState("");
  const save = useLayoutPresets((s) => s.save);
  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (!name.trim()) return;
    save(name, useAppStore.getState().layout);
    setName("");
  };
  return (
    <form className="preset-save" onSubmit={onSubmit}>
      <TextField label="ИМЯ ПРЕСЕТА" value={name} onChange={setName} />
      <button type="submit" className="file-button" disabled={!name.trim()}>
        [+] СОХРАНИТЬ РАСКЛАДКУ
      </button>
    </form>
  );
}

export function LayoutPresets() {
  const layout = useAppStore((s) => s.layout);
  const apply = useAppStore((s) => s.applyLayoutPreset);
  const user = useLayoutPresets((s) => s.user);
  const remove = useLayoutPresets((s) => s.remove);
  return (
    <>
      <div className="preset-list" role="group" aria-label="Пресеты раскладки">
        {BUILTIN_LAYOUT_PRESETS.map((preset) => (
          <PresetRow key={preset.id} preset={preset} active={layoutMatchesPreset(layout, preset)} onApply={() => apply(preset)} />
        ))}
        {user.map((preset) => (
          <PresetRow
            key={preset.id}
            preset={preset}
            active={layoutMatchesPreset(layout, preset)}
            onApply={() => apply(preset)}
            onRemove={() => remove(preset.id)}
          />
        ))}
      </div>
      <SavePreset />
    </>
  );
}
