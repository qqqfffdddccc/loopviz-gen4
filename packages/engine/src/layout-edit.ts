import { ZONE_KINDS, type Layout, type SlotRect, type ZoneKind } from "./layout";

/** Наименьшая доля видимой зоны при перетаскивании разделителя. */
export const MIN_ZONE_SHARE = 0.1;

export interface Splitter {
  upper: ZoneKind;
  lower: ZoneKind;
  /** Середина промежутка между зонами, пиксели от верха. */
  y: number;
}

export interface ZoneShare {
  slot: ZoneKind;
  index: number;
  share: number;
}

/** Доли видимых зон в сумме дают единицу. Если все доли нулевые, зоны делят высоту поровну. */
export function visibleShares(layout: Layout): ZoneShare[] {
  const visible = layout.order
    .map((slot, index) => ({ slot, index, ratio: Math.max(0, layout.ratios[index] ?? 0) }))
    .filter(({ slot }) => !layout.hidden.includes(slot));
  const total = visible.reduce((sum, zone) => sum + zone.ratio, 0);
  return visible.map(({ slot, index, ratio }) => ({ slot, index, share: total > 0 ? ratio / total : 1 / visible.length }));
}

export function splittersOf(rects: readonly SlotRect[]): Splitter[] {
  const result: Splitter[] = [];
  for (let i = 0; i + 1 < rects.length; i++) {
    const upper = rects[i];
    const lower = rects[i + 1];
    if (!upper || !lower) continue;
    result.push({ upper: upper.slot, lower: lower.slot, y: (upper.y + upper.h + lower.y) / 2 });
  }
  return result;
}

/** Высота, которую делят зоны за вычетом отступов. Именно по ней пиксели перетаскивания переводятся в доли. */
export function freeHeight(height: number, gap: number, visibleCount: number): number {
  return Math.max(1, height - gap * Math.max(0, visibleCount - 1));
}

/**
 * Задаёт новую долю верхней зоны пары, нижняя забирает остаток. Сумма пары сохраняется,
 * остальные зоны не двигаются. Видимые доли записываются обратно в масштабе прежней суммы ratios.
 */
export function withSplit(layout: Layout, upper: ZoneKind, lower: ZoneKind, upperShare: number, minShare = MIN_ZONE_SHARE): Layout {
  const shares = visibleShares(layout);
  const a = shares.find((z) => z.slot === upper);
  const b = shares.find((z) => z.slot === lower);
  if (!a || !b) return layout;

  const pair = a.share + b.share;
  const min = Math.min(minShare, pair / 2);
  const nextUpper = Math.min(Math.max(upperShare, min), pair - min);
  const scale = layout.ratios.reduce((sum, ratio, i) => {
    const slot = layout.order[i];
    return slot && !layout.hidden.includes(slot) ? sum + Math.max(0, ratio) : sum;
  }, 0);
  const unit = scale > 0 ? scale : 1;

  const ratios = layout.ratios.slice();
  for (const zone of shares) {
    const share = zone.slot === upper ? nextUpper : zone.slot === lower ? pair - nextUpper : zone.share;
    ratios[zone.index] = share * unit;
  }
  return { ...layout, ratios };
}

export function dragSplitter(layout: Layout, upper: ZoneKind, lower: ZoneKind, deltaShare: number, minShare = MIN_ZONE_SHARE): Layout {
  const current = visibleShares(layout).find((z) => z.slot === upper)?.share;
  return current === undefined ? layout : withSplit(layout, upper, lower, current + deltaShare, minShare);
}

/** Переставляет зону вместе с её долей: размер зоны не меняется, меняется только место. */
export function moveZone(layout: Layout, from: number, to: number): Layout {
  const last = layout.order.length - 1;
  if (from < 0 || from > last || to < 0 || to > last || from === to) return layout;
  const order = layout.order.slice();
  const ratios = layout.ratios.slice();
  const [zone] = order.splice(from, 1);
  const [ratio] = ratios.splice(from, 1);
  if (zone === undefined || ratio === undefined) return layout;
  order.splice(to, 0, zone);
  ratios.splice(to, 0, ratio);
  return { ...layout, order, ratios };
}

/** Порядок и доли в layout всегда относятся ко всем трём зонам: проверка для данных из localStorage и проекта. */
export function parseLayout(value: unknown): Layout | null {
  if (typeof value !== "object" || value === null) return null;
  const { order, ratios, hidden } = value as Record<string, unknown>;
  if (!Array.isArray(order) || !Array.isArray(ratios) || !Array.isArray(hidden)) return null;
  const isZone = (item: unknown): item is ZoneKind => ZONE_KINDS.some((zone) => zone === item);
  if (!order.every(isZone) || !hidden.every(isZone)) return null;
  if (order.length !== ZONE_KINDS.length || new Set(order).size !== ZONE_KINDS.length) return null;
  if (ratios.length !== order.length || !ratios.every((r) => typeof r === "number" && Number.isFinite(r) && r >= 0)) return null;
  return { order, ratios: ratios as number[], hidden: [...new Set(hidden)] };
}
