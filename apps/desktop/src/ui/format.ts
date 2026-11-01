/** Число знаков после точки в записи шага: 0.05 даёт 2, 1 даёт 0. */
export function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}
