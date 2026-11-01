import { describe, expect, it } from "vitest";
import { SUSTAIN_HEAT, fadeOut, fitPitchRange, isSounding, noteHeat } from "./note-math";

describe("fitPitchRange", () => {
  it("pads the selected range on both sides", () => {
    expect(fitPitchRange([48, 72], 2)).toEqual([46, 74]);
  });

  it("widens a narrow range to at least an octave around its center", () => {
    const [low, high] = fitPitchRange([60, 62], 0);
    expect(high - low + 1).toBe(12);
    expect(low).toBeLessThanOrEqual(60);
    expect(high).toBeGreaterThanOrEqual(62);
  });

  it("handles a single pitch and ignores negative padding", () => {
    const [low, high] = fitPitchRange([60, 60], -3);
    expect(high - low + 1).toBe(12);
  });
});

describe("fadeOut", () => {
  it("runs from 1 to 0 and stays there", () => {
    expect(fadeOut(0, 1)).toBe(1);
    expect(fadeOut(0.5, 1)).toBeCloseTo(0.25, 6);
    expect(fadeOut(1, 1)).toBe(0);
    expect(fadeOut(5, 1)).toBe(0);
    expect(fadeOut(-1, 1)).toBe(1);
  });

  it("is zero for a degenerate duration", () => {
    expect(fadeOut(0, 0)).toBe(0);
  });
});

describe("noteHeat", () => {
  const note = { start: 1, end: 2 };
  const tail = 0.5;

  it("is dark before the hit and full at the hit", () => {
    expect(noteHeat(note, 0.99, tail)).toBe(0);
    expect(noteHeat(note, 1, tail)).toBe(1);
  });

  it("settles to the sustain level while the note is held", () => {
    expect(noteHeat(note, 1.9, tail)).toBeCloseTo(SUSTAIN_HEAT, 6);
  });

  it("is continuous at the release and then decays to zero", () => {
    const before = noteHeat(note, 2 - 1e-9, tail);
    const after = noteHeat(note, 2 + 1e-9, tail);
    expect(after).toBeCloseTo(before, 6);
    expect(noteHeat(note, 2.25, tail)).toBeLessThan(after);
    expect(noteHeat(note, 2.5, tail)).toBe(0);
    expect(noteHeat(note, 9, tail)).toBe(0);
  });

  it("decreases monotonically after the release", () => {
    let previous = noteHeat(note, 2, tail);
    for (let t = 2.05; t < 2.6; t += 0.05) {
      const heat = noteHeat(note, t, tail);
      expect(heat).toBeLessThanOrEqual(previous + 1e-12);
      previous = heat;
    }
  });

  it("gives the same value for the same inputs", () => {
    expect(noteHeat(note, 1.3, tail)).toBe(noteHeat(note, 1.3, tail));
  });
});

describe("isSounding", () => {
  it("is half-open on the end", () => {
    expect(isSounding({ start: 1, end: 2 }, 1)).toBe(true);
    expect(isSounding({ start: 1, end: 2 }, 2)).toBe(false);
  });
});
