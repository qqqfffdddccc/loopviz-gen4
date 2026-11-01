/** Индекс, на который встанет строка `from`, если отпустить указатель на высоте `y`. Центры строк идут сверху вниз. */
export function dropIndex(centers: readonly number[], from: number, y: number): number {
  let index = 0;
  centers.forEach((center, i) => {
    if (i !== from && center < y) index++;
  });
  return index;
}

export interface ReorderDrag {
  from: number;
  to: number;
}

export type DropMark = "dragging" | "drop-before" | "drop-after" | null;

/** Какой отметкой подсвечивается строка `index` во время перетаскивания. */
export function dropMark(drag: ReorderDrag | null, index: number): DropMark {
  if (!drag) return null;
  if (index === drag.from) return "dragging";
  if (index === drag.to && drag.to < drag.from) return "drop-before";
  if (index === drag.to && drag.to > drag.from) return "drop-after";
  return null;
}
