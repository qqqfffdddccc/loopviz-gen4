import { describe, expect, it } from "vitest";
import { LOOP_BEATS, MAX_PLANES, planeLayout, smootherstep, type PlanesOptions } from "./planes-motion";

const options: PlanesOptions = { aspect: 1.1, count: 9, softness: 0.55, tilt: 0.28, step: 0.7, push: 0 };

describe("planeLayout", () => {
  it("детерминирован", () => {
    expect(planeLayout(7.37, options)).toEqual(planeLayout(7.37, options));
  });

  it("всегда отдаёт MAX_PLANES записей, лишние погашены по count", () => {
    const layout = planeLayout(3.2, { ...options, count: 5 });
    expect(layout).toHaveLength(MAX_PLANES);
    layout.forEach((plane, i) => {
      if (i >= 5) expect(plane.intensity).toBe(0);
    });
    expect(layout.slice(0, 5).some((plane) => plane.intensity > 0)).toBe(true);
  });

  it("значения конечны, интенсивность в 0..1", () => {
    for (let beat = -3; beat < 40; beat += 0.37) {
      for (const plane of planeLayout(beat, options)) {
        for (const value of Object.values(plane)) expect(Number.isFinite(value)).toBe(true);
        expect(plane.intensity).toBeGreaterThanOrEqual(0);
        expect(plane.intensity).toBeLessThanOrEqual(1);
        expect(plane.depth).toBeGreaterThanOrEqual(0);
        expect(plane.depth).toBeLessThan(1);
      }
    }
  });

  it("замыкается на стыке лупа", () => {
    for (const beat of [0, 2.3, 9.75, 15.9]) {
      const a = planeLayout(beat, options);
      const b = planeLayout(beat + LOOP_BEATS, options);
      a.forEach((plane, i) => {
        const other = b[i];
        expect(other?.cx).toBeCloseTo(plane.cx, 6);
        expect(other?.cy).toBeCloseTo(plane.cy, 6);
        expect(other?.hw).toBeCloseTo(plane.hw, 6);
        expect(other?.angle).toBeCloseTo(plane.angle, 6);
        expect(other?.intensity).toBeCloseTo(plane.intensity, 6);
      });
    }
  });

  it("непрерывен на границе доли", () => {
    const before = planeLayout(5 - 1e-6, options);
    const after = planeLayout(5 + 1e-6, options);
    before.forEach((plane, i) => {
      expect(after[i]?.cx).toBeCloseTo(plane.cx, 3);
      expect(after[i]?.angle).toBeCloseTo(plane.angle, 3);
    });
  });

  it("при step = 1 движение сосредоточено в середине доли", () => {
    const stepped = { ...options, step: 1 };
    const travel = (from: number, to: number): number =>
      planeLayout(to, stepped).reduce((sum, plane, i) => sum + Math.abs(plane.cx - (planeLayout(from, stepped)[i]?.cx ?? 0)), 0);
    expect(travel(4.0, 4.1)).toBeLessThan(travel(4.45, 4.55));
  });

  it("smootherstep симметричен и ограничен", () => {
    expect(smootherstep(-1)).toBe(0);
    expect(smootherstep(2)).toBe(1);
    expect(smootherstep(0.5)).toBeCloseTo(0.5, 6);
  });

  it("бас сдвигает плоскости по глубине", () => {
    const base = planeLayout(6, options);
    const pushed = planeLayout(6, { ...options, push: 0.03 });
    expect(pushed.some((plane, i) => plane.depth !== base[i]?.depth)).toBe(true);
  });
});
