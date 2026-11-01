import { ratioOf, type Layout, type ZoneKind } from "./layout";
import { visibleShares, withSplit } from "./layout-edit";

export interface LayoutPreset {
  id: string;
  name: string;
  layout: Layout;
}

/** Скрытая зона хранит запасную долю, чтобы после показа она не оказалась нулевой. */
export const BUILTIN_LAYOUT_PRESETS: readonly LayoutPreset[] = [
  { id: "classic", name: "КЛАССИКА", layout: { order: ["hero", "midi", "wave"], ratios: [0.5, 0.3, 0.2], hidden: [] } },
  { id: "big-hero", name: "БОЛЬШОЙ ГЕРОЙ", layout: { order: ["hero", "midi", "wave"], ratios: [0.65, 0.2, 0.15], hidden: [] } },
  { id: "no-midi", name: "БЕЗ MIDI", layout: { order: ["hero", "midi", "wave"], ratios: [0.7, 0.2, 0.3], hidden: ["midi"] } },
  { id: "notes-top", name: "НОТЫ СВЕРХУ", layout: { order: ["midi", "hero", "wave"], ratios: [0.25, 0.55, 0.2], hidden: [] } },
];

const MATCH_EPS = 0.01;

function sameSet(a: readonly ZoneKind[], b: readonly ZoneKind[]): boolean {
  return a.length === b.length && a.every((zone) => b.includes(zone));
}

/** Совпадение по порядку, видимости и видимым долям; запасные доли скрытых зон не важны. */
export function layoutMatchesPreset(layout: Layout, preset: LayoutPreset): boolean {
  const other = preset.layout;
  if (!sameSet(layout.hidden, other.hidden)) return false;
  const mine = visibleShares(layout);
  const theirs = visibleShares(other);
  return mine.length === theirs.length && mine.every((zone, i) => zone.slot === theirs[i]?.slot && Math.abs(zone.share - (theirs[i]?.share ?? 0)) < MATCH_EPS);
}

/** Возвращает пару зон к пропорции пресета, сумма долей пары остаётся прежней. */
export function resetSplitToPreset(layout: Layout, upper: ZoneKind, lower: ZoneKind, preset: LayoutPreset): Layout {
  const a = ratioOf(preset.layout, upper);
  const b = ratioOf(preset.layout, lower);
  const shares = visibleShares(layout);
  const pair = (shares.find((z) => z.slot === upper)?.share ?? 0) + (shares.find((z) => z.slot === lower)?.share ?? 0);
  const fraction = a + b > 0 ? a / (a + b) : 0.5;
  return withSplit(layout, upper, lower, pair * fraction);
}
