import { registry } from "../runtime/registry";
import { ALL_SLOTS, SLOT_LABELS } from "../state/slots";
import { useAppStore } from "../state/store";
import { Checkbox } from "../ui/Checkbox";
import { Section } from "../ui/Section";
import { ParamControl } from "./inspector/ParamControl";

function ParamList() {
  const slot = useAppStore((s) => s.selectedSlot);
  const moduleId = useAppStore((s) => s.moduleIds[slot]);
  const resetParams = useAppStore((s) => s.resetParams);
  const module = moduleId ? registry.get(moduleId) : undefined;
  if (!moduleId || !module) return <p className="muted">СЛОТ ПУСТ</p>;
  return (
    <div className="inspector-params" key={moduleId}>
      <p className="muted module-name">{module.name}</p>
      {Object.entries(module.params).map(([name, descriptor]) => (
        <ParamControl key={name} slot={slot} moduleId={moduleId} name={name} descriptor={descriptor} />
      ))}
      <button type="button" className="reset-button" onClick={() => resetParams(slot)}>
        [↺] СБРОСИТЬ ПО УМОЛЧАНИЮ
      </button>
    </div>
  );
}

export function RightPanel() {
  const selected = useAppStore((s) => s.selectedSlot);
  const selectSlot = useAppStore((s) => s.selectSlot);
  return (
    <aside className="panel panel-right" aria-label="Инспектор">
      <Section title="ИНСПЕКТОР">
        {ALL_SLOTS.map((slot) => (
          <Checkbox key={slot} checked={slot === selected} label={SLOT_LABELS[slot]} onChange={() => selectSlot(slot)} />
        ))}
        <ParamList />
      </Section>
    </aside>
  );
}
