import type { NoteEvent } from "@loopviz/mod-api";

export interface MidiTrackInfo {
  /** Индекс трека в исходном файле. Совпадает с `NoteEvent.track`. */
  index: number;
  name: string;
  noteCount: number;
  selected: boolean;
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface MidiModel {
  tracks: MidiTrackInfo[];
  /** Все ноты всех треков, отсортированы по start. */
  notes: NoteEvent[];
  /** Первый темп файла или null. */
  tempo: number | null;
  timeSignature: TimeSignature | null;
}

export interface MidiQuery {
  readonly noteCount: number;
  readonly range: [number, number];
  /** Ноты, звучащие в момент t: start <= t < end. */
  activeNotesAt(t: number): NoteEvent[];
  /** Ноты, пересекающие [t0, t1): start < t1 и end > t0. */
  notesInWindow(t0: number, t1: number): NoteEvent[];
}

const DEFAULT_RANGE: [number, number] = [36, 84];

export function createMidiModel(input: {
  tracks: { index: number; name: string; notes: NoteEvent[] }[];
  tempo: number | null;
  timeSignature: TimeSignature | null;
}): MidiModel {
  const tracks = input.tracks.filter((t) => t.notes.length > 0);
  return {
    tracks: tracks.map(({ index, name, notes }) => ({ index, name, noteCount: notes.length, selected: true })),
    notes: tracks.flatMap((t) => t.notes).sort((a, b) => a.start - b.start || a.pitch - b.pitch),
    tempo: input.tempo,
    timeSignature: input.timeSignature,
  };
}

export function withTrackSelected(model: MidiModel, trackIndex: number, selected: boolean): MidiModel {
  return {
    ...model,
    tracks: model.tracks.map((t) => (t.index === trackIndex ? { ...t, selected } : t)),
  };
}

/** Первый индекс, где notes[i].start >= value. */
function lowerBound(notes: readonly NoteEvent[], value: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((notes[mid]?.start ?? Infinity) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Индекс для выбранных треков со смещением. Пересобирается при смене выбора или offset. */
export function createMidiQuery(model: MidiModel, offsetSec = 0): MidiQuery {
  const selected = new Set(model.tracks.filter((t) => t.selected).map((t) => t.index));
  const notes = model.notes
    .filter((n) => selected.has(n.track))
    .map((n) => ({ ...n, start: n.start + offsetSec, end: n.end + offsetSec }));

  let maxDuration = 0;
  let low = Infinity;
  let high = -Infinity;
  for (const note of notes) {
    maxDuration = Math.max(maxDuration, note.end - note.start);
    low = Math.min(low, note.pitch);
    high = Math.max(high, note.pitch);
  }
  const range: [number, number] = notes.length > 0 ? [low, high] : [...DEFAULT_RANGE];

  const notesInWindow = (t0: number, t1: number): NoteEvent[] => {
    const result: NoteEvent[] = [];
    for (let i = lowerBound(notes, t0 - maxDuration); i < notes.length; i++) {
      const note = notes[i];
      if (!note || note.start >= t1) break;
      if (note.end > t0) result.push(note);
    }
    return result;
  };

  return {
    noteCount: notes.length,
    range,
    notesInWindow,
    activeNotesAt(t) {
      const result: NoteEvent[] = [];
      for (let i = lowerBound(notes, t - maxDuration); i < notes.length; i++) {
        const note = notes[i];
        if (!note || note.start > t) break;
        if (note.end > t) result.push(note);
      }
      return result;
    },
  };
}
