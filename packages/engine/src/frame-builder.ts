import type { FrameInput, NoteEvent, Theme } from "@loopviz/mod-api";
import { BAND_COUNT, SPECTRUM_BINS, WAVE_POINTS, createAudioSample, sampleAnalysis, type AudioAnalysis } from "./analysis-types";
import type { MidiQuery } from "./midi-model";
import { barAtSource, beatAtSource, fragmentLength, mapVideoTimeToSourceTime, type Timeline } from "./timeline";

export const DEFAULT_LOOKAHEAD_SEC = 2;
export const DEFAULT_LOOKBEHIND_SEC = 0.5;

export interface FrameContext {
  analysis: AudioAnalysis | null;
  midi: MidiQuery | null;
  timeline: Timeline;
  theme: Theme;
  size: { w: number; h: number; dpr: number };
  lookaheadSec?: number;
  lookbehindSec?: number;
}

const EMPTY_PEAKS = new Float32Array(WAVE_POINTS * 2);
const DEFAULT_RANGE: [number, number] = [36, 84];

/**
 * Ноты окна [loopT - behind, loopT + ahead] с зацикливанием: часть окна за краем фрагмента
 * берётся с другого конца, времена остаются на непрерывной оси лупа.
 */
export function windowNotes(midi: MidiQuery, timeline: Timeline, loopT: number, behind: number, ahead: number): NoteEvent[] {
  const length = fragmentLength(timeline);
  const { startSec } = timeline.fragment;
  const lo = loopT - behind;
  const hi = loopT + ahead;
  if (length <= 0) return midi.notesInWindow(startSec + lo, startSec + hi).map((n) => shift(n, -startSec));

  const notes: NoteEvent[] = [];
  for (let copy = Math.floor(lo / length); copy <= Math.floor(hi / length); copy++) {
    const from = Math.max(lo, copy * length);
    const to = Math.min(hi, (copy + 1) * length);
    if (to <= from) continue;
    const sourceFrom = startSec + (from - copy * length);
    const sourceTo = startSec + (to - copy * length);
    for (const note of midi.notesInWindow(sourceFrom, sourceTo)) notes.push(shift(note, copy * length - startSec));
  }
  return notes;
}

function shift(note: NoteEvent, by: number): NoteEvent {
  return { ...note, start: note.start + by, end: note.end + by };
}

function toFraction(sec: number, extent: number): number {
  return extent > 0 ? Math.min(1, Math.max(0, sec / extent)) : 0;
}

/** Чистая функция от t и контекста: никаких часов и случайности, поэтому превью и экспорт совпадают. */
export function buildFrameInput(t: number, ctx: FrameContext): FrameInput {
  const { analysis, midi, timeline, theme, size } = ctx;
  const behind = ctx.lookbehindSec ?? DEFAULT_LOOKBEHIND_SEC;
  const ahead = ctx.lookaheadSec ?? DEFAULT_LOOKAHEAD_SEC;
  const sourceT = mapVideoTimeToSourceTime(timeline, t);
  const loopT = sourceT - timeline.fragment.startSec;

  const audio = analysis
    ? sampleAnalysis(analysis, sourceT)
    : { ...createAudioSample(), bands: new Float32Array(BAND_COUNT), spectrum: new Float32Array(SPECTRUM_BINS) };

  const progressBase = analysis ? analysis.duration : timeline.fragment.endSec;

  return {
    t,
    loopT,
    beat: beatAtSource(timeline, sourceT),
    bar: barAtSource(timeline, sourceT),
    bpm: timeline.bpm,
    audio,
    midi: {
      active: midi ? midi.activeNotesAt(sourceT).map((n) => shift(n, -timeline.fragment.startSec)) : [],
      window: midi ? windowNotes(midi, timeline, loopT, behind, ahead) : [],
      range: midi ? midi.range : [...DEFAULT_RANGE],
      lookbehind: behind,
      lookahead: ahead,
    },
    wave: {
      peaks: analysis?.peaks ?? EMPTY_PEAKS,
      progress: toFraction(sourceT, progressBase),
      fragment: {
        start: toFraction(timeline.fragment.startSec, progressBase),
        end: toFraction(timeline.fragment.endSec, progressBase),
      },
    },
    theme,
    size,
  };
}
