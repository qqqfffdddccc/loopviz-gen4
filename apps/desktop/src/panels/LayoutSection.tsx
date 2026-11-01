import { ZONE_KINDS, ratioOf, type ZoneKind } from "@loopviz/engine";
import type { SlotKind } from "@loopviz/mod-api";
import { SLOT_LABELS } from "../state/slots";
import { useAppStore } from "../state/store";
import { Checkbox } from "../ui/Checkbox";
import { Section } from "../ui/Section";
import { Slider } from "../ui/Slider";

function GlowSlider({ slot }: { slot: SlotKind }) {
  const glow = useAppStore((s) => s.post.slotGlow[slot]);
  const setSlotGlow = useAppStore((s) => s.setSlotGlow);
  return <Slider label="СВЕЧЕНИЕ" value={glow} min={0} max={1} step={0.01} onChange={(value) => setSlotGlow(slot, value)} />;
}

function ZoneRow({ zone }: { zone: ZoneKind }) {
  const hidden = useAppStore((s) => s.layout.hidden.includes(zone));
  const ratio = useAppStore((s) => ratioOf(s.layout, zone));
  const setZoneHidden = useAppStore((s) => s.setZoneHidden);
  const setZoneRatio = useAppStore((s) => s.setZoneRatio);
  return (
    <div className="zone-row">
      <Checkbox checked={!hidden} label={SLOT_LABELS[zone]} onChange={(visible) => setZoneHidden(zone, !visible)} />
      <Slider label="ДОЛЯ" value={ratio} min={0.05} max={1} step={0.01} onChange={(value) => setZoneRatio(zone, value)} />
      <GlowSlider slot={zone} />
    </div>
  );
}

export function LayoutSection() {
  return (
    <Section title="РАСКЛАДКА">
      {ZONE_KINDS.map((zone) => (
        <ZoneRow key={zone} zone={zone} />
      ))}
      <div className="zone-row">
        <span className="bar-title">{SLOT_LABELS.overlay}</span>
        <GlowSlider slot="overlay" />
      </div>
    </Section>
  );
}
