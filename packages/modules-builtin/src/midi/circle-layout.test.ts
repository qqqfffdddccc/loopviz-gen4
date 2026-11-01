import { describe, expect, it } from "vitest";
import type { NoteEvent } from "@loopviz/mod-api";
import { circleAngle, circlePoint, circleSlot, collectVoices, pitchClassOf, sortAroundCircle } from "./circle-layout";

const note = (pitch: number, start: number, end: number, velocity = 1): NoteEvent => ({ pitch, velocity, start, end, track: 0 });

describe("pitchClassOf", () => {
  it("wraps pitches into 0..11", () => {
    expect(pitchClassOf(60)).toBe(0);
    expect(pitchClassOf(71)).toBe(11);
    expect(pitchClassOf(-1)).toBe(11);
  });
});

describe("circleSlot", () => {
  it("keeps chromatic order", () => {
    expect([0, 1, 2, 11].map((pc) => circleSlot(pc, "ХРОМАТИКА"))).toEqual([0, 1, 2, 11]);
  });

  it("walks the circle of fifths: C G D A", () => {
    const order = [0, 7, 2, 9].map((pc) => circleSlot(pc, "КВИНТЫ"));
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("is a permutation of 12 slots", () => {
    const slots = Array.from({ length: 12 }, (_, pc) => circleSlot(pc, "КВИНТЫ"));
    expect([...slots].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });
});

describe("circle geometry", () => {
  it("puts C at the top and the next slot clockwise", () => {
    expect(circleAngle(0, "ХРОМАТИКА")).toBeCloseTo(-Math.PI / 2, 9);
    const [x, y] = circlePoint([100, 100], 50, 0, "ХРОМАТИКА");
    expect(x).toBeCloseTo(100, 6);
    expect(y).toBeCloseTo(50, 6);
    const [nx, ny] = circlePoint([100, 100], 50, 3, "ХРОМАТИКА");
    expect(nx).toBeCloseTo(150, 6);
    expect(ny).toBeCloseTo(100, 6);
  });

  it("places every point on the radius", () => {
    for (let pc = 0; pc < 12; pc++) {
      const [x, y] = circlePoint([10, 20], 30, pc, "КВИНТЫ");
      expect(Math.hypot(x - 10, y - 20)).toBeCloseTo(30, 6);
    }
  });
});

describe("collectVoices", () => {
  it("keeps the hottest note per pitch class and drops cold ones", () => {
    const notes = [note(60, 0, 1), note(72, 0.5, 1.5), note(64, 0, 0.1), note(67, 5, 6)];
    const voices = collectVoices(notes, 0.6, 0.5);
    const classes = voices.map((v) => v.pitchClass).sort((a, b) => a - b);
    expect(classes).toEqual([0]);
    expect(voices[0]?.pitch).toBe(72);
  });

  it("keeps recently released notes until they fade", () => {
    const voices = collectVoices([note(64, 0, 0.1)], 0.2, 0.5);
    expect(voices).toHaveLength(1);
    expect(voices[0]?.heat).toBeGreaterThan(0);
  });
});

describe("sortAroundCircle", () => {
  it("orders voices by their slot", () => {
    const voices = [0, 7, 2].map((pitchClass) => ({ pitchClass, pitch: 60 + pitchClass, velocity: 1, heat: 1 }));
    expect(sortAroundCircle(voices, "КВИНТЫ").map((v) => v.pitchClass)).toEqual([0, 7, 2]);
    expect(sortAroundCircle(voices, "ХРОМАТИКА").map((v) => v.pitchClass)).toEqual([0, 2, 7]);
  });
});
