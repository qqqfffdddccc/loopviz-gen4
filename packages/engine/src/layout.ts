import { assertNever, type SlotKind } from "@loopviz/mod-api";

export type ZoneKind = Exclude<SlotKind, "overlay">;

export const ZONE_KINDS: readonly ZoneKind[] = ["hero", "midi", "wave"];

export interface Layout {
  order: ZoneKind[];
  ratios: number[];
  hidden: ZoneKind[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SlotRect extends Rect {
  slot: ZoneKind;
}

export const DEFAULT_LAYOUT: Layout = {
  order: ["hero", "midi", "wave"],
  ratios: [0.5, 0.3, 0.2],
  hidden: [],
};

export function isZone(slot: SlotKind): slot is ZoneKind {
  switch (slot) {
    case "hero":
    case "midi":
    case "wave":
      return true;
    case "overlay":
      return false;
    default:
      return assertNever(slot);
  }
}

/**
 * Раскладывает видимые зоны сверху вниз. Границы округляются, поэтому зазоры
 * и прямоугольники всегда попадают на целые пиксели.
 */
export function computeSlotRects(layout: Layout, width: number, height: number, gap: number): SlotRect[] {
  const visible = layout.order
    .map((slot, index) => ({ slot, ratio: Math.max(0, layout.ratios[index] ?? 0) }))
    .filter(({ slot }) => !layout.hidden.includes(slot));
  if (visible.length === 0) return [];

  const total = visible.reduce((sum, zone) => sum + zone.ratio, 0);
  const shares = visible.map((zone) => (total > 0 ? zone.ratio / total : 1 / visible.length));
  const free = Math.max(0, height - gap * (visible.length - 1));

  let cursor = 0;
  let acc = 0;
  return visible.map(({ slot }, i) => {
    acc += shares[i] ?? 0;
    const isLast = i === visible.length - 1;
    const top = Math.round(cursor + i * gap);
    const bottom = isLast ? Math.round(height) : Math.round(acc * free + i * gap);
    cursor = acc * free;
    return { slot, x: 0, y: top, w: width, h: Math.max(0, bottom - top) };
  });
}

export function ratioOf(layout: Layout, zone: ZoneKind): number {
  return layout.ratios[layout.order.indexOf(zone)] ?? 0;
}

export function withRatio(layout: Layout, zone: ZoneKind, ratio: number): Layout {
  const index = layout.order.indexOf(zone);
  if (index < 0) return layout;
  const ratios = layout.ratios.slice();
  ratios[index] = Math.max(0, ratio);
  return { ...layout, ratios };
}

export function withHidden(layout: Layout, zone: ZoneKind, hidden: boolean): Layout {
  const rest = layout.hidden.filter((z) => z !== zone);
  return { ...layout, hidden: hidden ? [...rest, zone] : rest };
}
