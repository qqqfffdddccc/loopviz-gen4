import { MAX_FEATHER, ratioOf, type ZoneKind } from "@loopviz/engine";
import type { SlotKind } from "@loopviz/mod-api";
import { SLOT_LABELS } from "../state/slots";
import { useAppStore } from "../state/store";
import { Checkbox } from "../ui/Checkbox";
import { dropMark, type DropMark } from "../ui/reorder";
import { Section } from "../ui/Section";
import { Slider } from "../ui/Slider";
import { useReorder, type ReorderHandleProps } from "../ui/useReorder";
import { LayoutPresets } from "./LayoutPresets";

function GlowSlider({ slot }: { slot: SlotKind }) {
  const glow = useAppStore((s) => s.post.slotGlow[slot]);
  const setSlotGlow = useAppStore((s) => s.setSlotGlow);
  return <Slider label="СВЕЧЕНИЕ" value={glow} min={0} max={1} step={0.01} onChange={(value) => setSlotGlow(slot, value)} />;
}

interface ZoneRowProps {
  zone: ZoneKind;
  mark: DropMark;
  handle: ReorderHandleProps;
}

function ZoneRow({ zone, mark, handle }: ZoneRowProps) {
  const hidden = useAppStore((s) => s.layout.hidden.includes(zone));
  const ratio = useAppStore((s) => ratioOf(s.layout, zone));
  const setZoneHidden = useAppStore((s) => s.setZoneHidden);
  const setZoneRatio = useAppStore((s) => s.setZoneRatio);
  return (
    <div className={mark ? `zone-row ${mark}` : "zone-row"} data-reorder-row>
      <div className="zone-head">
        <button type="button" className="grab-handle" aria-label={`Перетащить зону ${SLOT_LABELS[zone]}`} {...handle}>
          ≡
        </button>
        <Checkbox checked={!hidden} label={SLOT_LABELS[zone]} onChange={(visible) => setZoneHidden(zone, !visible)} />
      </div>
      <Slider label="ДОЛЯ" value={ratio} min={0.05} max={1} step={0.01} onChange={(value) => setZoneRatio(zone, value)} />
      <GlowSlider slot={zone} />
    </div>
  );
}

function ZoneRows() {
  const order = useAppStore((s) => s.layout.order);
  const moveZone = useAppStore((s) => s.moveZone);
  const { containerRef, drag, handleProps } = useReorder(moveZone);
  return (
    <div className="zone-rows" ref={containerRef}>
      {order.map((zone, index) => (
        <ZoneRow key={zone} zone={zone} mark={dropMark(drag, index)} handle={handleProps(index)} />
      ))}
    </div>
  );
}

function EdgeControls() {
  const gap = useAppStore((s) => s.gap);
  const feather = useAppStore((s) => s.feather);
  const setGap = useAppStore((s) => s.setGap);
  const setFeather = useAppStore((s) => s.setFeather);
  return (
    <>
      <Slider label="ОТСТУП" value={gap} min={0} max={48} step={1} format={(v) => `${Math.round(v)} PX`} onChange={setGap} />
      <Slider
        label="РАСТУШЁВКА"
        value={feather}
        min={0}
        max={MAX_FEATHER}
        step={0.005}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={setFeather}
      />
    </>
  );
}

export function LayoutSection() {
  return (
    <Section title="РАСКЛАДКА">
      <LayoutPresets />
      <ZoneRows />
      <div className="zone-row">
        <span className="bar-title">{SLOT_LABELS.overlay}</span>
        <GlowSlider slot="overlay" />
      </div>
      <EdgeControls />
    </Section>
  );
}
