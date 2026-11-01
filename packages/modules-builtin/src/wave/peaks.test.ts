import { describe, expect, it } from "vitest";
import { pulseWeight } from "./dots";
import { amplitudes, fragmentProgress, peakGain, samplePeaksInto, scaled, sliceFragmentPeaks, sliceWrappedPeaks, smoothAmplitudes } from "./peaks";

/** Пики, у которых точка i равна [-i / n, i / n]: рост виден по любому срезу. */
function ramp(points: number): Float32Array {
  const peaks = new Float32Array(points * 2);
  for (let i = 0; i < points; i++) {
    peaks[i * 2] = -i / points;
    peaks[i * 2 + 1] = i / points;
  }
  return peaks;
}

describe("sliceFragmentPeaks", () => {
  it("returns the whole file for a full-range fragment", () => {
    const out = sliceFragmentPeaks(ramp(100), { start: 0, end: 1 }, 10);
    expect(out).toHaveLength(20);
    expect(out[19]).toBeCloseTo(0.99, 6);
    expect(out[0]).toBeCloseTo(-0.09, 6);
  });

  it("covers only the fragment", () => {
    const out = sliceFragmentPeaks(ramp(100), { start: 0.5, end: 0.6 }, 5);
    for (let i = 0; i < 5; i++) {
      expect(out[i * 2 + 1]).toBeGreaterThanOrEqual(0.5);
      expect(out[i * 2 + 1]).toBeLessThan(0.61);
    }
  });

  it("interpolates when the fragment is zoomed deeper than the data", () => {
    const out = sliceFragmentPeaks(ramp(100), { start: 0.5, end: 0.52 }, 40);
    for (let i = 1; i < 40; i++) expect(out[i * 2 + 1] ?? 0).toBeGreaterThanOrEqual(out[(i - 1) * 2 + 1] ?? 0);
    expect(new Set(Array.from(out).filter((_, i) => i % 2 === 1)).size).toBeGreaterThan(2);
  });

  it("falls back to the whole file for an empty fragment", () => {
    const out = sliceFragmentPeaks(ramp(100), { start: 0.3, end: 0.3 }, 4);
    expect(out[7]).toBeGreaterThan(0.7);
  });

  it("survives an empty peaks array", () => {
    const out = sliceFragmentPeaks(new Float32Array(0), { start: 0, end: 1 }, 4);
    expect(Array.from(out)).toEqual(new Array(8).fill(0));
  });
});

describe("samplePeaksInto", () => {
  it("takes extremes over a wide bin", () => {
    const out = new Float32Array(2);
    samplePeaksInto(ramp(100), 50, 20, out, 0);
    expect(out[0]).toBeCloseTo(-0.59, 6);
    expect(out[1]).toBeCloseTo(0.59, 6);
  });
});

describe("sliceWrappedPeaks", () => {
  it("continues from the fragment start after the end", () => {
    const fragment = { start: 0.2, end: 0.4 };
    const out = sliceWrappedPeaks(ramp(100), fragment, { from: 0.9, to: 1.1 }, 4);
    const values = Array.from({ length: 4 }, (_, i) => out[i * 2 + 1] ?? 0);
    expect(values[0]).toBeGreaterThan(0.36);
    expect(values[3]).toBeLessThan(0.24);
  });

  it("wraps negative positions to the end of the fragment", () => {
    const out = sliceWrappedPeaks(ramp(100), { start: 0.2, end: 0.4 }, { from: -0.1, to: 0 }, 2);
    expect(out[1]).toBeGreaterThan(0.36);
  });
});

describe("fragmentProgress", () => {
  it("normalizes progress inside the fragment and clamps", () => {
    const fragment = { start: 0.2, end: 0.6 };
    expect(fragmentProgress(0.4, fragment)).toBeCloseTo(0.5, 9);
    expect(fragmentProgress(0.1, fragment)).toBe(0);
    expect(fragmentProgress(0.9, fragment)).toBe(1);
    expect(fragmentProgress(0.3, { start: 0.5, end: 0.5 })).toBeCloseTo(0.3, 9);
  });
});

describe("amplitudes and smoothing", () => {
  it("takes the larger absolute extreme", () => {
    const pairs = Float32Array.from([-0.8, 0.3, -0.1, 0.5]);
    expect(Array.from(amplitudes(pairs)).map((v) => +v.toFixed(2))).toEqual([0.8, 0.5]);
  });

  it("leaves a flat signal untouched and spreads a spike", () => {
    expect(Array.from(smoothAmplitudes(Float32Array.from([1, 1, 1]), 1))).toEqual([1, 1, 1]);
    const spiked = smoothAmplitudes(Float32Array.from([0, 1, 0]), 0.6);
    expect(spiked[1]).toBeLessThan(1);
    expect(spiked[0]).toBeGreaterThan(0);
  });
});

describe("pulseWeight", () => {
  it("is 1 under the playhead and falls off with distance", () => {
    expect(pulseWeight(0, 0.1)).toBe(1);
    expect(pulseWeight(0.1, 0.1)).toBeCloseTo(Math.exp(-1), 9);
    expect(pulseWeight(0.5, 0.1)).toBeLessThan(1e-6);
  });
});

describe("peakGain", () => {
  it("stretches the loudest peak to full height", () => {
    expect(peakGain(Float32Array.from([-0.25, 0.5, -0.1, 0.2]))).toBeCloseTo(2, 9);
  });

  it("caps the gain on near-silent files", () => {
    expect(peakGain(new Float32Array(8))).toBe(8);
    expect(peakGain(Float32Array.from([0, 0.001]))).toBe(8);
  });

  it("scales values and clamps at 1", () => {
    expect(Array.from(scaled(Float32Array.from([0.2, 0.7]), 2))).toEqual([expect.closeTo(0.4, 6), 1]);
  });
});
