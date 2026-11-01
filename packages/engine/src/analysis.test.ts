import { describe, expect, it } from "vitest";
import { analyzeAudio, bandBinRanges, bandEdges, computePeaks, mixToMono, softCompress } from "./analysis";
import { BAND_COUNT, WAVE_POINTS, createAudioSample, sampleAnalysis } from "./analysis-types";

const SR = 44100;

function sine(freq: number, seconds: number, amp = 0.8): Float32Array {
  return Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / SR));
}

function argmax(values: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if ((values[i] ?? 0) > (values[best] ?? 0)) best = i;
  return best;
}

describe("band mapping", () => {
  it("builds log-spaced edges from 30 Hz to 16 kHz", () => {
    const edges = bandEdges(BAND_COUNT);
    expect(edges).toHaveLength(BAND_COUNT + 1);
    expect(edges[0]).toBeCloseTo(30, 6);
    expect(edges[BAND_COUNT]).toBeCloseTo(16000, 3);
    const ratios = edges.slice(1).map((e, i) => e / (edges[i] ?? 1));
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0] ?? 0, 6);
  });

  it("gives every band at least one bin and keeps ranges ordered", () => {
    const ranges = bandBinRanges(64, SR);
    for (const { lo, hi } of ranges) expect(hi).toBeGreaterThanOrEqual(lo);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]?.lo ?? 0).toBeGreaterThanOrEqual(ranges[i - 1]?.lo ?? 0);
    }
  });
});

describe("softCompress", () => {
  it("is monotone, fixes 0 and 1 and boosts quiet values", () => {
    expect(softCompress(0)).toBe(0);
    expect(softCompress(1)).toBe(1);
    expect(softCompress(0.25)).toBeGreaterThan(0.25);
    expect(softCompress(0.6)).toBeLessThan(softCompress(0.7));
    expect(softCompress(3)).toBe(1);
  });
});

describe("analyzeAudio", () => {
  it("lights the band containing a sine and nothing far away", () => {
    const analysis = analyzeAudio([sine(1000, 1)], SR);
    const edges = bandEdges(BAND_COUNT);
    const expected = edges.findIndex((edge, i) => edge <= 1000 && 1000 < (edges[i + 1] ?? Infinity));
    const sample = sampleAnalysis(analysis, 0.5);

    expect(argmax(sample.bands)).toBe(expected);
    expect(sample.bands[expected]).toBeGreaterThan(0.8);
    expect(sample.bands[0]).toBeLessThan(0.05);
    expect(sample.bands[BAND_COUNT - 1]).toBeLessThan(0.05);
    expect(sample.rms).toBeGreaterThan(0.8);
  });

  it("returns zeros for silence", () => {
    const analysis = analyzeAudio([new Float32Array(SR)], SR);
    const sample = sampleAnalysis(analysis, 0.5);
    expect(sample.rms).toBe(0);
    expect(sample.onset).toBe(0);
    expect(Math.max(...sample.bands)).toBe(0);
  });

  it("produces a 60 fps grid and reports progress", () => {
    const progress: number[] = [];
    const analysis = analyzeAudio([sine(440, 2)], SR, { onProgress: (f) => progress.push(f) });
    expect(analysis.frameCount).toBe(121);
    expect(analysis.bands).toHaveLength(121 * BAND_COUNT);
    expect(analysis.peaks).toHaveLength(WAVE_POINTS * 2);
    expect(progress.at(-1)).toBe(1);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
  });

  it("detects clicks as onsets near their time", () => {
    const clicks = [0.5, 1.0, 1.5, 2.0];
    const signal = new Float32Array(SR * 3);
    for (const time of clicks) {
      const start = Math.round(time * SR);
      for (let i = 0; i < 200; i++) signal[start + i] = 0.9 * Math.sin(i * 0.9) * (1 - i / 200);
    }
    const analysis = analyzeAudio([signal], SR);
    for (const time of clicks) {
      const frame = Math.round(time * 60);
      const near = Math.max(...Array.from(analysis.onset.slice(frame - 2, frame + 3)));
      expect(near).toBeGreaterThan(0.6);
    }
    expect(analysis.onset[Math.round(0.75 * 60)] ?? 1).toBeLessThan(0.1);
    expect(analysis.onset[Math.round(2.75 * 60)] ?? 1).toBeLessThan(0.1);
  });
});

describe("sampleAnalysis", () => {
  it("interpolates linearly between frames and clamps outside", () => {
    const analysis = analyzeAudio([new Float32Array(SR)], SR);
    analysis.rms[10] = 0.2;
    analysis.rms[11] = 0.6;
    analysis.bands[10 * BAND_COUNT + 3] = 0;
    analysis.bands[11 * BAND_COUNT + 3] = 1;

    const out = createAudioSample();
    const sample = sampleAnalysis(analysis, 10.25 / 60, out);
    expect(sample).toBe(out);
    expect(sample.rms).toBeCloseTo(0.3, 6);
    expect(sample.bands[3]).toBeCloseTo(0.25, 6);

    analysis.rms[0] = 0.4;
    expect(sampleAnalysis(analysis, -5).rms).toBeCloseTo(0.4, 6);
    expect(sampleAnalysis(analysis, 999).rms).toBe(analysis.rms[analysis.frameCount - 1]);
  });
});

describe("helpers", () => {
  it("averages channels into mono", () => {
    const mono = mixToMono([Float32Array.of(1, 0, -1), Float32Array.of(0, 1, -1)]);
    expect(Array.from(mono)).toEqual([0.5, 0.5, -1]);
  });

  it("computes min/max peaks per point", () => {
    const peaks = computePeaks(Float32Array.of(0.1, -0.5, 0.9, 0.2), 2);
    expect(Array.from(peaks)).toEqual([expect.closeTo(-0.5, 5), expect.closeTo(0.1, 5), expect.closeTo(0.2, 5), expect.closeTo(0.9, 5)]);
  });
});
