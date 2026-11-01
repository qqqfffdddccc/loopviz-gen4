import {
  clampFragment,
  mapVideoTimeToSourceTime,
  secondsPerBar,
  snapFragment,
  snapToBar,
  type Fragment,
  type Timeline,
} from "./timeline";

export type FragmentHit = "start" | "end" | "inside" | "outside";
export type FragmentEdge = "start" | "end";

/** Самый короткий фрагмент при свободном (без прилипания) перетаскивании краёв. */
export const MIN_FRAGMENT_SEC = 0.05;

/** Что находится под курсором: край выделения (в пределах `edgePx`), его середина или пустое место. */
export function hitTestFragment(fragment: Fragment, sec: number, extent: number, widthPx: number, edgePx: number): FragmentHit {
  const tolerance = (edgePx * extent) / Math.max(1, widthPx);
  const toStart = Math.abs(sec - fragment.startSec);
  const toEnd = Math.abs(sec - fragment.endSec);
  if (Math.min(toStart, toEnd) <= tolerance) return toStart <= toEnd ? "start" : "end";
  return sec > fragment.startSec && sec < fragment.endSec ? "inside" : "outside";
}

/** Двигает один край в `sec`. С прилипанием край встаёт на такт, фрагмент не короче такта. */
export function dragFragmentEdge(tl: Timeline, fragment: Fragment, edge: FragmentEdge, sec: number, extent: number): Fragment {
  const minLength = tl.snapToBars ? secondsPerBar(tl) : MIN_FRAGMENT_SEC;
  const raw: Fragment =
    edge === "start"
      ? { startSec: Math.min(sec, fragment.endSec - minLength), endSec: fragment.endSec }
      : { startSec: fragment.startSec, endSec: Math.max(sec, fragment.startSec + minLength) };
  return tl.snapToBars ? snapFragment(tl, raw, extent) : clampFragment(raw, extent);
}

/** Сдвигает фрагмент целиком, длина сохраняется. С прилипанием начало встаёт на такт. */
export function moveFragment(tl: Timeline, fragment: Fragment, deltaSec: number, extent: number): Fragment {
  const length = fragment.endSec - fragment.startSec;
  const lastStart = Math.max(0, extent - length);
  let startSec = Math.min(Math.max(fragment.startSec + deltaSec, 0), lastStart);
  if (tl.snapToBars) {
    const bar = secondsPerBar(tl);
    startSec = Math.min(snapToBar(tl, startSec), Math.floor(lastStart / bar + 1e-9) * bar);
  }
  return { startSec, endSec: startSec + length };
}

/** Время ролика, при котором плейхед стоит на `sourceSec`. Вне фрагмента перемотка не имеет смысла. */
export function videoTimeForSource(fragment: Fragment, sourceSec: number): number | null {
  return sourceSec >= fragment.startSec && sourceSec <= fragment.endSec ? sourceSec - fragment.startSec : null;
}

/**
 * Новое время ролика после смены фрагмента. Плейхед, оставшийся внутри нового фрагмента,
 * продолжает с той же точки исходника, иначе воспроизведение идёт с начала.
 */
export function videoTimeAfterRefit(previous: Timeline, next: Timeline, t: number): number {
  const source = mapVideoTimeToSourceTime(previous, t);
  const { startSec, endSec } = next.fragment;
  return source >= startSec && source < endSec ? source - startSec : 0;
}
