import { useId } from "react";
import { isModModuleId } from "@loopviz/engine";
import type { SlotKind } from "@loopviz/mod-api";
import { useModsStore } from "../mods/mods-store";
import { registry } from "../runtime/registry";
import { ALL_SLOTS, SLOT_LABELS } from "../state/slots";
import { useAppStore } from "../state/store";
import { Section } from "../ui/Section";
import { ModsBlock } from "./ModsBlock";

/** Встроенные модули идут первыми, моды после них. */
function optionsFor(slot: SlotKind): { id: string; label: string }[] {
  const all = registry.list(slot);
  const builtin = all.filter((module) => !isModModuleId(module.id));
  const mods = all.filter((module) => isModModuleId(module.id));
  return [
    ...builtin.map((module) => ({ id: module.id, label: module.name })),
    ...mods.map((module) => ({ id: module.id, label: `${module.name} ·mod` })),
  ];
}

function ModuleSelect({ slot }: { slot: SlotKind }) {
  const id = useId();
  const value = useAppStore((s) => s.moduleIds[slot]);
  const setModule = useAppStore((s) => s.setModule);
  const selectSlot = useAppStore((s) => s.selectSlot);
  // Список читается из реестра, который меняется при загрузке модов: версия заставляет его перечитать.
  useModsStore((s) => s.version);
  const options = optionsFor(slot);
  const missing = value !== null && !options.some((option) => option.id === value);
  return (
    <div className="field">
      <label htmlFor={id}>{SLOT_LABELS[slot]}</label>
      <select
        id={id}
        value={value ?? ""}
        onFocus={() => selectSlot(slot)}
        onChange={(event) => setModule(slot, event.target.value || null)}
      >
        <option value="">— НЕТ —</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
        {missing ? <option value={value}>{value} (не загружен)</option> : null}
      </select>
    </div>
  );
}

export function ModulesSection() {
  return (
    <Section title="МОДУЛИ">
      {ALL_SLOTS.map((slot) => (
        <ModuleSelect key={slot} slot={slot} />
      ))}
      <ModsBlock />
    </Section>
  );
}
