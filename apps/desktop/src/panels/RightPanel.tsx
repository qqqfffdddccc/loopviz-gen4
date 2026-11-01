import { registry } from "../runtime/registry";
import { ALL_SLOTS, SLOT_LABELS } from "../state/slots";
import { useAppStore } from "../state/store";
import { Checkbox } from "../ui/Checkbox";
import { Section } from "../ui/Section";

function ParamList() {
  const slot = useAppStore((s) => s.selectedSlot);
  const moduleId = useAppStore((s) => s.moduleIds[slot]);
  const values = useAppStore((s) => s.params[slot]);
  const module = moduleId ? registry.get(moduleId) : undefined;
  if (!module) return <p className="muted">СЛОТ ПУСТ</p>;
  return (
    <dl className="param-list">
      {Object.entries(module.params).map(([key, descriptor]) => (
        <div key={key} className="param-row">
          <dt>{descriptor.label}</dt>
          <dd>{String(values[key] ?? descriptor.default)}</dd>
        </div>
      ))}
    </dl>
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
