import { assertNever } from "@loopviz/mod-api";

export interface Fragment {
  startSec: number;
  endSec: number;
}

export type DurationMode =
  | { mode: "repeats"; repeats: number }
  | { mode: "seconds"; seconds: number };

export interface Timeline {
  bpm: number;
  beatsPerBar: number;
  fragment: Fragment;
  snapToBars: boolean;
  duration: DurationMode;
}

export const DEFAULT_BPM = 120;
export const DEFAULT_BEATS_PER_BAR = 4;

export function createTimeline(overrides: Partial<Timeline> = {}): Timeline {
  const base: Timeline = {
    bpm: DEFAULT_BPM,
    beatsPerBar: DEFAULT_BEATS_PER_BAR,
    fragment: { startSec: 0, endSec: 0 },
    snapToBars: true,
    duration: { mode: "repeats", repeats: 1 },
    ...overrides,
  };
  if (!overrides.fragment) {
    const bar = secondsPerBar(base);
    base.fragment = { startSec: 0, endSec: bar * 4 };
  }
  return base;
}

export function secondsPerBeat(tl: Pick<Timeline, "bpm">): number {
  return 60 / Math.max(1, tl.bpm);
}

export function secondsPerBar(tl: Pick<Timeline, "bpm" | "beatsPerBar">): number {
  return secondsPerBeat(tl) * Math.max(1, tl.beatsPerBar);
}

export function fragmentLength(tl: Timeline): number {
  return Math.max(0, tl.fragment.endSec - tl.fragment.startSec);
}

export function fragmentBars(tl: Timeline): number {
  return fragmentLength(tl) / secondsPerBar(tl);
}

export function totalDuration(tl: Timeline): number {
  const mode = tl.duration;
  switch (mode.mode) {
    case "repeats":
      return fragmentLength(tl) * Math.max(1, Math.round(mode.repeats));
    case "seconds":
      return Math.max(0, mode.seconds);
    default:
      return assertNever(mode);
  }
}

/** Время ролика t -> время исходника внутри фрагмента. Фрагмент нулевой длины даёт его начало. */
export function mapVideoTimeToSourceTime(tl: Timeline, t: number): number {
  const length = fragmentLength(tl);
  if (length <= 0) return tl.fragment.startSec;
  const local = ((t % length) + length) % length;
  return tl.fragment.startSec + local;
}

export function loopTimeAt(tl: Timeline, t: number): number {
  return mapVideoTimeToSourceTime(tl, t) - tl.fragment.startSec;
}

/** Доли такта и бита от нуля исходника: сетка тактов не зависит от фрагмента. */
export function beatAtSource(tl: Timeline, sourceSec: number): number {
  return sourceSec / secondsPerBeat(tl);
}

export function barAtSource(tl: Timeline, sourceSec: number): number {
  return sourceSec / secondsPerBar(tl);
}

export function beatAt(tl: Timeline, t: number): number {
  return beatAtSource(tl, mapVideoTimeToSourceTime(tl, t));
}

export function barAt(tl: Timeline, t: number): number {
  return barAtSource(tl, mapVideoTimeToSourceTime(tl, t));
}

export function snapToBar(tl: Pick<Timeline, "bpm" | "beatsPerBar">, sec: number): number {
  const bar = secondsPerBar(tl);
  return Math.round(sec / bar) * bar;
}

/**
 * Прижимает границы к тактам. Конец, вылезающий за `extent`, уходит на последний целый такт.
 * Результат всегда не короче одного такта, если в `extent` вообще помещается такт.
 */
export function snapFragment(tl: Pick<Timeline, "bpm" | "beatsPerBar">, fragment: Fragment, extent: number): Fragment {
  const bar = secondsPerBar(tl);
  const lastBar = Math.floor(extent / bar + 1e-9) * bar;
  if (lastBar < bar) return { startSec: 0, endSec: Math.max(0, extent) };

  let startSec = Math.min(snapToBar(tl, Math.max(0, fragment.startSec)), lastBar - bar);
  let endSec = Math.min(snapToBar(tl, fragment.endSec), lastBar);
  if (endSec <= startSec) endSec = Math.min(startSec + bar, lastBar);
  if (endSec <= startSec) startSec = endSec - bar;
  return { startSec, endSec };
}

export function clampFragment(fragment: Fragment, extent: number): Fragment {
  const startSec = Math.min(Math.max(0, fragment.startSec), extent);
  const endSec = Math.min(Math.max(startSec, fragment.endSec), extent);
  return { startSec, endSec };
}

/** Границы тактов внутри [fromSec, toSec], в секундах. */
export function barLines(tl: Pick<Timeline, "bpm" | "beatsPerBar">, fromSec: number, toSec: number, everyBars = 1): number[] {
  const step = secondsPerBar(tl) * Math.max(1, everyBars);
  const lines: number[] = [];
  for (let i = Math.ceil(fromSec / step - 1e-9); i * step <= toSec + 1e-9; i++) lines.push(i * step || 0);
  return lines;
}
