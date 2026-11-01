import { useId } from "react";
import type { SlotKind } from "@loopviz/mod-api";
import { registry } from "../runtime/registry";
import { ALL_SLOTS, SLOT_LABELS } from "../state/slots";
import { useAppStore } from "../state/store";
import { Section } from "../ui/Section";

function ModuleSelect({ slot }: { slot: SlotKind }) {
  const id = useId();
  const value = useAppStore((s) => s.moduleIds[slot]);
  const setModule = useAppStore((s) => s.setModule);
  const selectSlot = useAppStore((s) => s.selectSlot);
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
        {registry.list(slot).map((module) => (
          <option key={module.id} value={module.id}>
            {module.name}
          </option>
        ))}
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
    </Section>
  );
}
