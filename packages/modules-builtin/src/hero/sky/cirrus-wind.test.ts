import { describe, expect, it } from "vitest";
import { buildWindTrack, seamBlend, windDrift } from "./cirrus-wind";

const DURATION = 20;
const PER_SEC = 50;

/** Пики с ударами каждые 0.5 с на тихом фоне. */
function makePeaks(): Float32Array {
  const count = DURATION * PER_SEC;
  const peaks = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const phase = (i / PER_SEC) % 0.5;
    const level = 0.08 + (phase < 0.06 ? 0.7 : 0);
    peaks[2 * i] = -level;
    peaks[2 * i + 1] = level;
  }
  return peaks;
}

describe("buildWindTrack", () => {
  it("не строится по слишком короткому или беззвучному входу", () => {
    expect(buildWindTrack(new Float32Array(4), 10)).toBeNull();
    expect(buildWindTrack(makePeaks(), 0)).toBeNull();
  });

  it("детерминирован", () => {
    const a = buildWindTrack(makePeaks(), DURATION);
    const b = buildWindTrack(makePeaks(), DURATION);
    expect(a).toEqual(b);
  });
});

describe("windDrift", () => {
  const track = buildWindTrack(makePeaks(), DURATION);

  it("без трека равен времени", () => {
    expect(windDrift(null, 3.5, 1, 1)).toBe(3.5);
    expect(windDrift(null, -2, 1, 1)).toBe(0);
  });

  it("при нулевой реакции и без порывов равен времени", () => {
    for (const t of [0, 1.3, 7.77, 19.9, 25]) {
      expect(windDrift(track, t, 0, 0)).toBeCloseTo(t, 6);
    }
  });

  it("не убывает по времени при любой реакции", () => {
    for (const reaction of [0, 0.5, 1]) {
      let prev = -Infinity;
      for (let t = 0; t <= DURATION + 3; t += 0.013) {
        const value = windDrift(track, t, reaction, 1);
        expect(value).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = value;
      }
    }
  });

  it("порывы после онсетов добавляют смещение", () => {
    const calm = windDrift(track, 10, 0, 0);
    const gusty = windDrift(track, 10, 0, 1);
    expect(gusty).toBeGreaterThan(calm);
  });

  it("не зависит от порядка вызовов", () => {
    const forward = [2, 5, 9].map((t) => windDrift(track, t, 0.7, 0.5));
    const backward = [9, 5, 2].map((t) => windDrift(track, t, 0.7, 0.5)).reverse();
    expect(backward).toEqual(forward);
  });
});

describe("seamBlend", () => {
  const track = buildWindTrack(makePeaks(), DURATION);
  const start = 4;
  const end = 12;

  it("вне окна вес нулевой, у конца единичный", () => {
    expect(seamBlend(start, start, end)?.weight).toBe(0);
    expect(seamBlend(8, start, end)?.weight).toBe(0);
    expect(seamBlend(end, start, end)?.weight).toBe(1);
  });

  it("вес растёт монотонно в окне", () => {
    let prev = 0;
    for (let t = start; t <= end; t += 0.01) {
      const weight = seamBlend(t, start, end)?.weight ?? 0;
      expect(weight).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = weight;
    }
  });

  it("смешанный дрейф непрерывен на стыке повтора", () => {
    const blended = (t: number): number => {
      const seam = seamBlend(t, start, end);
      if (!seam) return Number.NaN;
      const a = windDrift(track, t, 0.6, 0.6);
      const b = windDrift(track, seam.shiftedT, 0.6, 0.6);
      return a + (b - a) * seam.weight;
    };
    expect(blended(end)).toBeCloseTo(blended(start), 9);
  });

  it("вырожденный фрагмент не даёт сшивки", () => {
    expect(seamBlend(5, 5, 5)).toBeNull();
    expect(seamBlend(5, 6, 4)).toBeNull();
  });
});
