import type { FrameInput } from "@loopviz/mod-api";

export const ANALYSIS_FPS = 60;
export const FFT_SIZE = 2048;
export const BAND_COUNT = 8;
export const SPECTRUM_BINS = 64;
export const WAVE_POINTS = 4096;
export const BAND_MIN_HZ = 30;
export const BAND_MAX_HZ = 16000;

/** Все массивы плоские: кадр i лежит в [i * stride, (i + 1) * stride). */
export interface AudioAnalysis {
  fps: number;
  sampleRate: number;
  duration: number;
  frameCount: number;
  rms: Float32Array;
  onset: Float32Array;
  /** frameCount * BAND_COUNT */
  bands: Float32Array;
  /** frameCount * SPECTRUM_BINS */
  spectrum: Float32Array;
  /** Пары [min, max], длина 2 * WAVE_POINTS. */
  peaks: Float32Array;
}

export type AudioSample = FrameInput["audio"];

export function analysisBuffers(analysis: AudioAnalysis): ArrayBuffer[] {
  return [analysis.rms, analysis.onset, analysis.bands, analysis.spectrum, analysis.peaks].map(
    (array) => array.buffer as ArrayBuffer,
  );
}

export function createAudioSample(): AudioSample {
  return { rms: 0, onset: 0, bands: new Float32Array(BAND_COUNT), spectrum: new Float32Array(SPECTRUM_BINS) };
}

function lerpRows(source: Float32Array, stride: number, i0: number, i1: number, k: number, out: Float32Array): void {
  for (let j = 0; j < stride; j++) {
    const a = source[i0 * stride + j] ?? 0;
    const b = source[i1 * stride + j] ?? 0;
    out[j] = a + (b - a) * k;
  }
}

/** Линейная интерполяция между кадрами анализа. Вне диапазона отдаёт крайние кадры. */
export function sampleAnalysis(analysis: AudioAnalysis, timeSec: number, out: AudioSample = createAudioSample()): AudioSample {
  const position = Math.min(Math.max(timeSec * analysis.fps, 0), analysis.frameCount - 1);
  const i0 = Math.floor(position);
  const i1 = Math.min(i0 + 1, analysis.frameCount - 1);
  const k = position - i0;
  const scalar = (source: Float32Array): number => {
    const a = source[i0] ?? 0;
    const b = source[i1] ?? 0;
    return a + (b - a) * k;
  };
  out.rms = scalar(analysis.rms);
  out.onset = scalar(analysis.onset);
  lerpRows(analysis.bands, BAND_COUNT, i0, i1, k, out.bands);
  lerpRows(analysis.spectrum, SPECTRUM_BINS, i0, i1, k, out.spectrum);
  return out;
}
