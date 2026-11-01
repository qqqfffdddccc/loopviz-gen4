import { describe, expect, it } from "vitest";
import { Fft, hannWindow } from "./fft";

describe("Fft", () => {
  it("puts a sine on the expected bin", () => {
    const size = 1024;
    const bin = 37;
    const fft = new Fft(size);
    const re = new Float32Array(size);
    const im = new Float32Array(size);
    for (let i = 0; i < size; i++) re[i] = Math.sin((2 * Math.PI * bin * i) / size);
    fft.transform(re, im);
    const mags = Array.from({ length: size / 2 }, (_, k) => Math.hypot(re[k] ?? 0, im[k] ?? 0));
    const peak = mags.indexOf(Math.max(...mags));
    expect(peak).toBe(bin);
    expect(mags[bin]).toBeCloseTo(size / 2, 1);
    expect(mags[bin + 5]).toBeLessThan(1e-2);
  });

  it("matches a naive DFT on random input", () => {
    const size = 64;
    const fft = new Fft(size);
    const input = Float32Array.from({ length: size }, (_, i) => Math.sin(i * 1.3) + Math.cos(i * 0.37) * 0.5);
    const re = input.slice();
    const im = new Float32Array(size);
    fft.transform(re, im);
    for (const k of [0, 1, 7, 31, 32]) {
      let sr = 0;
      let si = 0;
      for (let n = 0; n < size; n++) {
        sr += (input[n] ?? 0) * Math.cos((2 * Math.PI * k * n) / size);
        si -= (input[n] ?? 0) * Math.sin((2 * Math.PI * k * n) / size);
      }
      expect(re[k]).toBeCloseTo(sr, 3);
      expect(im[k]).toBeCloseTo(si, 3);
    }
  });

  it("rejects non power-of-two sizes", () => {
    expect(() => new Fft(1000)).toThrow(/power of two/);
  });
});

describe("hannWindow", () => {
  it("starts at zero and peaks at the center", () => {
    const w = hannWindow(8);
    expect(w[0]).toBe(0);
    expect(w[4]).toBeCloseTo(1, 6);
  });
});
