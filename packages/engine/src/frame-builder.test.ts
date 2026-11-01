import { describe, expect, it } from "vitest";
import type { NoteEvent } from "@loopviz/mod-api";
import { BAND_COUNT, SPECTRUM_BINS, WAVE_POINTS, type AudioAnalysis } from "./analysis-types";
import { buildFrameInput, windowNotes, type FrameContext } from "./frame-builder";
import { createMidiModel, createMidiQuery } from "./midi-model";
import { DEFAULT_THEME } from "./theme";
import { createTimeline } from "./timeline";

const note = (pitch: number, start: number, end: number): NoteEvent => ({ pitch, velocity: 1, start, end, track: 0 });

function fakeAnalysis(): AudioAnalysis {
  const frameCount = 10 * 60 + 1;
  const rms = Float32Array.from({ length: frameCount }, (_, i) => i / (frameCount - 1));
  return {
    fps: 60,
    sampleRate: 44100,
    duration: 10,
    frameCount,
    rms,
    onset: new Float32Array(frameCount),
    bands: new Float32Array(frameCount * BAND_COUNT).fill(0.5),
    spectrum: new Float32Array(frameCount * SPECTRUM_BINS).fill(0.25),
    peaks: new Float32Array(WAVE_POINTS * 2),
  };
}

const query = createMidiQuery(
  createMidiModel({
    tempo: 120,
    timeSignature: null,
    tracks: [
      {
        index: 0,
        name: "t",
        notes: [note(60, 2.0, 2.5), note(62, 3.0, 3.5), note(64, 5.0, 5.5), note(65, 5.8, 6.4), note(67, 6.5, 7.0)],
      },
    ],
  }),
);

const context = (extra: Partial<FrameContext> = {}): FrameContext => ({
  analysis: fakeAnalysis(),
  midi: query,
  timeline: createTimeline({ fragment: { startSec: 2, endSec: 6 } }),
  theme: DEFAULT_THEME,
  size: { w: 540, h: 960, dpr: 1 },
  ...extra,
});

describe("buildFrameInput", () => {
  it("maps video time into the fragment and samples audio at source time", () => {
    const frame = buildFrameInput(5, context());
    expect(frame.t).toBe(5);
    expect(frame.loopT).toBe(1);
    expect(frame.audio.rms).toBeCloseTo(3 / 10, 3);
    expect(frame.beat).toBeCloseTo(6, 6);
    expect(frame.bar).toBeCloseTo(1.5, 6);
    expect(frame.wave.progress).toBeCloseTo(0.3, 6);
    expect(frame.audio.bands).toHaveLength(BAND_COUNT);
    expect(frame.audio.spectrum).toHaveLength(SPECTRUM_BINS);
  });

  it("is deterministic and does not depend on the wall clock", () => {
    const a = buildFrameInput(3.37, context());
    const b = buildFrameInput(3.37, context());
    expect(b).toEqual(a);
  });

  it("works without audio and midi", () => {
    const frame = buildFrameInput(1, context({ analysis: null, midi: null }));
    expect(frame.audio.rms).toBe(0);
    expect(frame.midi.window).toEqual([]);
    expect(frame.midi.range).toEqual([36, 84]);
    expect(frame.wave.peaks).toHaveLength(WAVE_POINTS * 2);
  });

  it("reports the fragment bounds as fractions of the file next to progress", () => {
    const frame = buildFrameInput(1, context());
    expect(frame.wave.fragment.start).toBeCloseTo(0.2, 6);
    expect(frame.wave.fragment.end).toBeCloseTo(0.6, 6);
    expect(frame.wave.progress).toBeGreaterThanOrEqual(frame.wave.fragment.start);
    expect(frame.wave.progress).toBeLessThanOrEqual(frame.wave.fragment.end);
  });

  it("reports active notes and window on the loop clock with default lookahead", () => {
    const frame = buildFrameInput(1.1, context());
    expect(frame.midi.lookahead).toBe(2);
    expect(frame.midi.lookbehind).toBe(0.5);
    expect(frame.midi.active.map((n) => n.pitch)).toEqual([62]);
    expect(frame.midi.active[0]?.start).toBeCloseTo(1, 6);
    expect(frame.midi.window.map((n) => n.pitch)).toEqual([62, 64]);
  });
});

describe("windowNotes loop wrapping", () => {
  const timeline = createTimeline({ fragment: { startSec: 2, endSec: 6 } });

  it("pulls notes from the loop start into the lookahead near the end", () => {
    const notes = windowNotes(query, timeline, 3.5, 0.5, 2);
    expect(notes.map((n) => [n.pitch, +n.start.toFixed(3)])).toEqual([
      [64, 3],
      [65, 3.8],
      [60, 4],
      [62, 5],
    ]);
  });

  it("pulls notes from the loop end into the lookbehind right after the start", () => {
    const notes = windowNotes(query, timeline, 0.25, 0.5, 1);
    expect(notes.map((n) => [n.pitch, +n.start.toFixed(3)])).toEqual([
      [65, -0.2],
      [60, 0],
      [62, 1],
    ]);
  });

  it("covers several loops when the window is longer than the fragment", () => {
    const short = createTimeline({ fragment: { startSec: 2, endSec: 4 } });
    const notes = windowNotes(query, short, 0, 0, 5);
    expect(notes.map((n) => n.pitch)).toEqual([60, 62, 60, 62, 60]);
    expect(notes.map((n) => n.start)).toEqual([0, 1, 2, 3, 4]);
  });
});
