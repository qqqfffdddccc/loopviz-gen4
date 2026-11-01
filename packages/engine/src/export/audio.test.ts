import { describe, expect, it } from "vitest";
import { buildExportAudio, exportSampleCount } from "./audio";
import { encodeWav } from "./wav";

const RATE = 48000;

function sine(seconds: number, freq: number, rate = RATE): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = 0.8 * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

function maxStep(data: Float32Array, from: number, to: number): number {
  let max = 0;
  for (let i = Math.max(1, from); i < Math.min(to, data.length); i++) max = Math.max(max, Math.abs((data[i] ?? 0) - (data[i - 1] ?? 0)));
  return max;
}

describe("buildExportAudio", () => {
  it("даёт ровно round(total * rate) отсчётов", () => {
    const channel = sine(2, 440);
    for (const total of [4, 3.3333, 0.5, 5.00001]) {
      const [out] = buildExportAudio({ channels: [channel], sampleRate: RATE, startSec: 0, endSec: 2, totalSec: total });
      expect(out?.length).toBe(exportSampleCount(total, RATE));
    }
  });

  it("сохраняет число каналов и повторяет фрагмент без правок вдали от стыков", () => {
    const left = sine(4, 220);
    const right = sine(4, 330);
    const out = buildExportAudio({ channels: [left, right], sampleRate: RATE, startSec: 1, endSec: 2, totalSec: 3 });
    expect(out).toHaveLength(2);
    const length = RATE;
    const mid = Math.round(length / 2);
    expect(out[0]?.[mid]).toBe(left[RATE + mid]);
    expect(out[1]?.[length + mid]).toBe(right[RATE + mid]);
    expect(out[0]?.[2 * length + mid]).toBe(left[RATE + mid]);
  });

  it("укорачивает последнюю копию, если длительность не кратна фрагменту", () => {
    const channel = sine(2, 440);
    const [out] = buildExportAudio({ channels: [channel], sampleRate: RATE, startSec: 0.5, endSec: 1.5, totalSec: 1.5 });
    expect(out?.length).toBe(1.5 * RATE);
    expect(out?.[RATE + 1000]).toBe(channel[0.5 * RATE + 1000]);
  });

  it("сглаживает стык кроссфейдом, когда по сторонам хватает материала", () => {
    const channel = sine(3, 997);
    const options = { channels: [channel], sampleRate: RATE, startSec: 1, endSec: 1.0123, totalSec: 0.0123 * 4 };
    const [hard] = buildExportAudio({ ...options, crossfadeSec: 0 });
    const [soft] = buildExportAudio(options);
    const seam = Math.round(0.0123 * RATE);
    const half = Math.round(0.0025 * RATE);
    const hardStep = maxStep(hard ?? new Float32Array(), seam - half, seam + half);
    const softStep = maxStep(soft ?? new Float32Array(), seam - half, seam + half);
    expect(softStep).toBeLessThan(hardStep);
    expect(softStep).toBeLessThan(0.15);
  });

  it("не трогает края окна: непрерывность с материалом по обе стороны", () => {
    const channel = sine(3, 500);
    const length = Math.round(0.2 * RATE);
    const [out] = buildExportAudio({ channels: [channel], sampleRate: RATE, startSec: 1, endSec: 1.2, totalSec: 0.6 });
    const half = Math.floor(Math.round(0.005 * RATE) / 2);
    const data = out ?? new Float32Array();
    expect(data[length - half - 1]).toBeCloseTo(channel[RATE + length - half - 1] ?? 0, 5);
    expect(data[length + half + 1]).toBeCloseTo(channel[RATE + half + 1] ?? 0, 5);
  });

  it("у края файла оставляет бесшовное периодическое повторение", () => {
    const channel = sine(2, 440);
    const [out] = buildExportAudio({ channels: [channel], sampleRate: RATE, startSec: 0, endSec: 2, totalSec: 6 });
    const data = out ?? new Float32Array();
    expect(data.length).toBe(6 * RATE);
    expect(data[2 * RATE]).toBe(channel[0]);
    expect(data[2 * RATE - 1]).toBe(channel[2 * RATE - 1]);
    expect(maxStep(data, 2 * RATE - 50, 2 * RATE + 50)).toBeLessThan(0.08);
  });

  it("пустой фрагмент даёт тишину нужной длины", () => {
    const [out] = buildExportAudio({ channels: [sine(1, 440)], sampleRate: RATE, startSec: 0.5, endSec: 0.5, totalSec: 1 });
    expect(out?.length).toBe(RATE);
    expect(out?.every((v) => v === 0)).toBe(true);
  });
});

describe("encodeWav", () => {
  const readText = (bytes: Uint8Array, at: number, len: number): string =>
    String.fromCharCode(...bytes.subarray(at, at + len));

  it("пишет корректный заголовок PCM16", () => {
    const bytes = encodeWav([new Float32Array([0, 1, -1, 0.5]), new Float32Array([0, 0, 0, 0])], 44100, "pcm16");
    const view = new DataView(bytes.buffer);
    expect(readText(bytes, 0, 4)).toBe("RIFF");
    expect(readText(bytes, 8, 4)).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(4 * 2 * 2);
    expect(bytes.length).toBe(44 + 16);
    expect(view.getInt16(44 + 4, true)).toBe(32767);
    expect(view.getInt16(44 + 8, true)).toBe(-32768);
  });

  it("пишет float32 и прижимает pcm16 к диапазону", () => {
    const float = encodeWav([new Float32Array([0.25, -0.5])], 48000, "float32");
    const view = new DataView(float.buffer);
    expect(view.getUint16(20, true)).toBe(3);
    expect(view.getFloat32(44, true)).toBeCloseTo(0.25);
    expect(view.getFloat32(48, true)).toBeCloseTo(-0.5);
    const clipped = new DataView(encodeWav([new Float32Array([4, -4])], 48000).buffer);
    expect(clipped.getInt16(44, true)).toBe(32767);
    expect(clipped.getInt16(46, true)).toBe(-32768);
  });
});
