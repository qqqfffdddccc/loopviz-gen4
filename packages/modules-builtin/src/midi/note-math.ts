import type { NoteEvent } from "@loopviz/mod-api";

export const MIN_PITCH_ROWS = 12;

/** Диапазон высот выбранных нот с запасом, не уже одной октавы. Границы включительно. */
export function fitPitchRange(range: readonly [number, number], padding: number, minRows = MIN_PITCH_ROWS): [number, number] {
  const pad = Math.max(0, Math.round(padding));
  let low = Math.min(range[0], range[1]) - pad;
  let high = Math.max(range[0], range[1]) + pad;
  const missing = minRows - (high - low + 1);
  if (missing > 0) {
    low -= Math.floor(missing / 2);
    high += Math.ceil(missing / 2);
  }
  return [low, high];
}

/** 1 в нуле, 0 при `duration` и дальше, плавный выход в ноль. */
export function fadeOut(elapsed: number, duration: number): number {
  if (duration <= 0) return 0;
  const x = Math.min(1, Math.max(0, elapsed / duration));
  return (1 - x) * (1 - x);
}

export const SUSTAIN_HEAT = 0.55;

/**
 * Накал ноты в момент t: вспышка в момент удара, затем ровное свечение пока нота держится,
 * после отпускания плавный спад за `tail` секунд. Функция только от времён, без состояния.
 */
export function noteHeat(note: Pick<NoteEvent, "start" | "end">, t: number, tail: number): number {
  const age = t - note.start;
  if (age < 0) return 0;
  const flash = tail * 0.6;
  if (t < note.end) return SUSTAIN_HEAT + (1 - SUSTAIN_HEAT) * fadeOut(age, flash);
  const held = SUSTAIN_HEAT + (1 - SUSTAIN_HEAT) * fadeOut(note.end - note.start, flash);
  return held * fadeOut(t - note.end, tail);
}

export function isSounding(note: Pick<NoteEvent, "start" | "end">, t: number): boolean {
  return note.start <= t && t < note.end;
}
