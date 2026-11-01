import { Fft, hannWindow } from "./fft";
import {
  ANALYSIS_FPS,
  BAND_COUNT,
  BAND_MAX_HZ,
  BAND_MIN_HZ,
  FFT_SIZE,
  SPECTRUM_BINS,
  WAVE_POINTS,
  type AudioAnalysis,
} from "./analysis-types";

const BAND_DB_FLOOR = -72;
const BAND_DB_CEIL = -6;
const RMS_DB_FLOOR = -48;
const ONSET_DECAY = 0.85;
const PEAK_RADIUS = 3;
const MEAN_RADIUS = 8;

export interface BinRange {
  lo: number;
  hi: number;
}

export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first;
  const mono = new Float32Array(first.length);
  for (const channel of channels) {
    for (let i = 0; i < mono.length; i++) mono[i] = (mono[i] ?? 0) + (channel[i] ?? 0);
  }
  const gain = 1 / channels.length;
  for (let i = 0; i < mono.length; i++) mono[i] = (mono[i] ?? 0) * gain;
  return mono;
}

export function bandEdges(count: number): number[] {
  const ratio = BAND_MAX_HZ / BAND_MIN_HZ;
  return Array.from({ length: count + 1 }, (_, i) => BAND_MIN_HZ * ratio ** (i / count));
}

/** Диапазон бинов (включительно) для каждой лог-полосы. В узкой полосе без бинов берётся ближайший к центру. */
export function bandBinRanges(count: number, sampleRate: number, fftSize: number = FFT_SIZE): BinRange[] {
  const binHz = sampleRate / fftSize;
  const maxBin = fftSize / 2;
  const edges = bandEdges(count);
  return Array.from({ length: count }, (_, i) => {
    const from = edges[i] ?? BAND_MIN_HZ;
    const to = edges[i + 1] ?? BAND_MAX_HZ;
    let lo = Math.ceil(from / binHz);
    let hi = Math.ceil(to / binHz) - 1;
    if (hi < lo) {
      lo = Math.round(Math.sqrt(from * to) / binHz);
      hi = lo;
    }
    return { lo: Math.min(Math.max(lo, 1), maxBin), hi: Math.min(Math.max(hi, 1), maxBin) };
  });
}

/** Плавный компрессор: быстро поднимает тихое, у потолка упирается мягко. */
export function softCompress(x: number): number {
  const c = Math.min(Math.max(x, 0), 1);
  return c * (2 - c);
}

function ampToUnit(amplitude: number, floorDb: number, ceilDb: number): number {
  const db = 20 * Math.log10(amplitude + 1e-9);
  return softCompress((db - floorDb) / (ceilDb - floorDb));
}

function rangeAmplitude(magnitude: Float32Array, range: BinRange): number {
  let sum = 0;
  for (let k = range.lo; k <= range.hi; k++) sum += (magnitude[k] ?? 0) ** 2;
  return Math.sqrt(sum / (range.hi - range.lo + 1));
}

export function computePeaks(mono: Float32Array, points: number = WAVE_POINTS): Float32Array {
  const peaks = new Float32Array(points * 2);
  const n = mono.length;
  if (n === 0) return peaks;
  for (let p = 0; p < points; p++) {
    const from = Math.min(n - 1, Math.floor((p * n) / points));
    const to = Math.max(from + 1, Math.min(n, Math.floor(((p + 1) * n) / points)));
    let min = Infinity;
    let max = -Infinity;
    for (let i = from; i < to; i++) {
      const v = mono[i] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks[p * 2] = min;
    peaks[p * 2 + 1] = max;
  }
  return peaks;
}

/** Положительный спектральный поток на log-сжатых амплитудах: сумма прироста по бинам. */
function fluxOf(previous: Float32Array, current: Float32Array): number {
  let flux = 0;
  for (let k = 1; k < current.length; k++) {
    const d = (current[k] ?? 0) - (previous[k] ?? 0);
    if (d > 0) flux += d;
  }
  return flux;
}

/** Локальные максимумы выше скользящего среднего. Хвост после пика затухает, чтобы импульс жил дольше одного кадра. */
export function pickOnsets(flux: Float32Array): Float32Array {
  const n = flux.length;
  const peaks = new Float32Array(n);
  const peakIndices: number[] = [];
  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, flux[i] ?? 0);
  if (max <= 0) return peaks;

  for (let i = 0; i < n; i++) {
    const value = flux[i] ?? 0;
    let isMax = true;
    for (let j = Math.max(0, i - PEAK_RADIUS); j <= Math.min(n - 1, i + PEAK_RADIUS); j++) {
      const other = flux[j] ?? 0;
      if (other > value || (other === value && j < i)) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - MEAN_RADIUS); j <= Math.min(n - 1, i + MEAN_RADIUS); j++) {
      sum += flux[j] ?? 0;
      count += 1;
    }
    if (value > (sum / count) * 1.5 + max * 0.05) peakIndices.push(i);
  }
  if (peakIndices.length === 0) return peaks;

  const strengths = peakIndices.map((i) => flux[i] ?? 0).sort((a, b) => a - b);
  const scale = strengths[Math.floor((strengths.length - 1) * 0.9)] ?? max;
  for (const i of peakIndices) peaks[i] = Math.min(1, (flux[i] ?? 0) / scale);

  const envelope = new Float32Array(n);
  let held = 0;
  for (let i = 0; i < n; i++) {
    held = Math.max(peaks[i] ?? 0, held * ONSET_DECAY);
    envelope[i] = held;
  }
  return envelope;
}

export interface AnalyzeOptions {
  onProgress?: (fraction: number) => void;
}

export function analyzeAudio(
  channels: readonly Float32Array[],
  sampleRate: number,
  options: AnalyzeOptions = {},
): AudioAnalysis {
  const mono = mixToMono(channels);
  const duration = mono.length / sampleRate;
  const frameCount = Math.floor(duration * ANALYSIS_FPS) + 1;
  const bandRanges = bandBinRanges(BAND_COUNT, sampleRate);
  const spectrumRanges = bandBinRanges(SPECTRUM_BINS, sampleRate);
  const fft = new Fft(FFT_SIZE);
  const window = hannWindow(FFT_SIZE);
  const magnitudeScale = 4 / FFT_SIZE;
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const magnitude = new Float32Array(FFT_SIZE / 2 + 1);
  const logCurrent = new Float32Array(FFT_SIZE / 2 + 1);
  const logPrevious = new Float32Array(FFT_SIZE / 2 + 1);

  const rms = new Float32Array(frameCount);
  const bands = new Float32Array(frameCount * BAND_COUNT);
  const spectrum = new Float32Array(frameCount * SPECTRUM_BINS);
  const flux = new Float32Array(frameCount);
  const progressStep = Math.max(1, Math.floor(frameCount / 100));

  for (let frame = 0; frame < frameCount; frame++) {
    const center = Math.round((frame / ANALYSIS_FPS) * sampleRate);
    const origin = center - FFT_SIZE / 2;
    let energy = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const sample = mono[origin + i] ?? 0;
      energy += sample * sample;
      re[i] = sample * (window[i] ?? 0);
      im[i] = 0;
    }
    fft.transform(re, im);
    for (let k = 0; k < magnitude.length; k++) {
      magnitude[k] = Math.hypot(re[k] ?? 0, im[k] ?? 0) * magnitudeScale;
      logCurrent[k] = Math.log1p(100 * (magnitude[k] ?? 0));
    }

    rms[frame] = ampToUnit(Math.sqrt(energy / FFT_SIZE), RMS_DB_FLOOR, 0);
    bandRanges.forEach((range, b) => {
      bands[frame * BAND_COUNT + b] = ampToUnit(rangeAmplitude(magnitude, range), BAND_DB_FLOOR, BAND_DB_CEIL);
    });
    spectrumRanges.forEach((range, b) => {
      spectrum[frame * SPECTRUM_BINS + b] = ampToUnit(rangeAmplitude(magnitude, range), BAND_DB_FLOOR, BAND_DB_CEIL);
    });
    flux[frame] = frame === 0 ? 0 : fluxOf(logPrevious, logCurrent);
    logPrevious.set(logCurrent);

    if (frame % progressStep === 0) options.onProgress?.(frame / frameCount);
  }
  options.onProgress?.(1);

  return {
    fps: ANALYSIS_FPS,
    sampleRate,
    duration,
    frameCount,
    rms,
    onset: pickOnsets(flux),
    bands,
    spectrum,
    peaks: computePeaks(mono),
  };
}
