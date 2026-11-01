import { describe, expect, it } from "vitest";
import type { NoteEvent } from "@loopviz/mod-api";
import { createMidiModel, createMidiQuery, withTrackSelected } from "./midi-model";

const note = (pitch: number, start: number, end: number, track = 0): NoteEvent => ({
  pitch,
  velocity: 0.8,
  start,
  end,
  track,
});

const model = () =>
  createMidiModel({
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    tracks: [
      { index: 0, name: "meta", notes: [] },
      { index: 1, name: "chords", notes: [note(60, 0, 2, 1), note(64, 0, 2, 1), note(67, 2, 4, 1)] },
      { index: 2, name: "lead", notes: [note(72, 3.5, 3.75, 2), note(74, 0.5, 0.75, 2)] },
    ],
  });

describe("createMidiModel", () => {
  it("drops empty tracks, merges notes sorted by start", () => {
    const m = model();
    expect(m.tracks.map((t) => [t.index, t.name, t.noteCount, t.selected])).toEqual([
      [1, "chords", 3, true],
      [2, "lead", 2, true],
    ]);
    const starts = m.notes.map((n) => n.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe("createMidiQuery", () => {
  it("finds active notes at an instant, end exclusive", () => {
    const query = createMidiQuery(model());
    expect(query.activeNotesAt(1).map((n) => n.pitch).sort()).toEqual([60, 64]);
    expect(query.activeNotesAt(2).map((n) => n.pitch)).toEqual([67]);
    expect(query.activeNotesAt(0.6).map((n) => n.pitch).sort()).toEqual([60, 64, 74]);
    expect(query.activeNotesAt(10)).toEqual([]);
  });

  it("returns notes overlapping a window, including long notes started earlier", () => {
    const query = createMidiQuery(model());
    expect(query.notesInWindow(1.9, 2.1).map((n) => n.pitch).sort()).toEqual([60, 64, 67]);
    expect(query.notesInWindow(2.5, 3.4).map((n) => n.pitch)).toEqual([67]);
    expect(query.notesInWindow(4, 5)).toEqual([]);
  });

  it("respects track selection and applies the offset to every note", () => {
    const m = withTrackSelected(model(), 1, false);
    const query = createMidiQuery(m, 0.25);
    expect(query.noteCount).toBe(2);
    expect(query.range).toEqual([72, 74]);
    expect(query.notesInWindow(0, 1).map((n) => [n.pitch, n.start])).toEqual([[74, 0.75]]);
    expect(query.activeNotesAt(3.8).map((n) => n.pitch)).toEqual([72]);
  });

  it("agrees with a linear scan on a dense random set", () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const notes = Array.from({ length: 400 }, () => {
      const start = random() * 60;
      return note(30 + Math.floor(random() * 60), start, start + 0.05 + random() * 6);
    });
    const m = createMidiModel({ tempo: null, timeSignature: null, tracks: [{ index: 0, name: "r", notes }] });
    const query = createMidiQuery(m);
    for (const [t0, t1] of [
      [0, 1],
      [10, 10.5],
      [33.3, 40],
      [59, 70],
    ] as const) {
      const expected = notes.filter((n) => n.start < t1 && n.end > t0).length;
      expect(query.notesInWindow(t0, t1)).toHaveLength(expected);
    }
    expect(query.activeNotesAt(25)).toHaveLength(notes.filter((n) => n.start <= 25 && n.end > 25).length);
  });

  it("falls back to a default range without notes", () => {
    const m = createMidiModel({ tempo: null, timeSignature: null, tracks: [] });
    expect(createMidiQuery(m).range).toEqual([36, 84]);
  });
});
