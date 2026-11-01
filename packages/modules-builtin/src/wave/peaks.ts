/** Поле, в которое пишутся пары [min, max]. */
export type PeakPairs = Float32Array;

/**
 * Пара [min, max] пиков вокруг дробной точки `center` шириной `width` (в точках массива).
 * Шире одной точки берёт крайние значения, уже одной интерполирует соседние, чтобы кривая не ступенчатела.
 */
export function samplePeaksInto(peaks: Float32Array, center: number, width: number, out: PeakPairs, index: number): void {
  const points = peaks.length / 2;
  if (points === 0) {
    out[index * 2] = 0;
    out[index * 2 + 1] = 0;
    return;
  }
  const half = Math.max(width, 0) / 2;
  const from = center - half;
  const to = center + half;
  if (to - from >= 1) {
    let min = 0;
    let max = 0;
    const first = Math.max(0, Math.floor(from));
    const last = Math.min(points - 1, Math.ceil(to) - 1);
    for (let i = first; i <= last; i++) {
      min = Math.min(min, peaks[i * 2] ?? 0);
      max = Math.max(max, peaks[i * 2 + 1] ?? 0);
    }
    out[index * 2] = min;
    out[index * 2 + 1] = max;
    return;
  }
  const position = Math.min(Math.max(center - 0.5, 0), points - 1);
  const i0 = Math.floor(position);
  const i1 = Math.min(i0 + 1, points - 1);
  const k = position - i0;
  const mix = (offset: number): number => {
    const a = peaks[i0 * 2 + offset] ?? 0;
    const b = peaks[i1 * 2 + offset] ?? 0;
    return a + (b - a) * k;
  };
  out[index * 2] = mix(0);
  out[index * 2 + 1] = mix(1);
}

/** Пики фрагмента, пересчитанные в `columns` столбцов. `start`/`end` в долях файла. Пустой фрагмент даёт весь файл. */
export function sliceFragmentPeaks(
  peaks: Float32Array,
  fragment: { start: number; end: number },
  columns: number,
  out: PeakPairs = new Float32Array(columns * 2),
): PeakPairs {
  const points = peaks.length / 2;
  const valid = fragment.end > fragment.start;
  const startPoint = (valid ? fragment.start : 0) * points;
  const span = ((valid ? fragment.end : 1) - (valid ? fragment.start : 0)) * points;
  const width = span / columns;
  for (let i = 0; i < columns; i++) samplePeaksInto(peaks, startPoint + (i + 0.5) * width, width, out, i);
  return out;
}

/** Доля пройденного пути внутри фрагмента, 0..1. */
export function fragmentProgress(progress: number, fragment: { start: number; end: number }): number {
  const length = fragment.end - fragment.start;
  if (length <= 0) return Math.min(1, Math.max(0, progress));
  return Math.min(1, Math.max(0, (progress - fragment.start) / length));
}

/**
 * Пики окна вокруг позиции внутри фрагмента. Позиции в долях фрагмента (могут выходить за 0..1):
 * за краем окно продолжается с другого конца фрагмента, как зацикленный ролик.
 */
export function sliceWrappedPeaks(
  peaks: Float32Array,
  fragment: { start: number; end: number },
  window: { from: number; to: number },
  columns: number,
  out: PeakPairs = new Float32Array(columns * 2),
): PeakPairs {
  const points = peaks.length / 2;
  const valid = fragment.end > fragment.start;
  const start = valid ? fragment.start : 0;
  const length = valid ? fragment.end - fragment.start : 1;
  const width = ((window.to - window.from) / columns) * length * points;
  for (let i = 0; i < columns; i++) {
    const rel = window.from + ((window.to - window.from) * (i + 0.5)) / columns;
    const wrapped = ((rel % 1) + 1) % 1;
    samplePeaksInto(peaks, (start + wrapped * length) * points, width, out, i);
  }
  return out;
}

/** Симметричная амплитуда столбца: больший из |min| и max. */
export function amplitudeAt(pairs: PeakPairs, index: number): number {
  return Math.max(Math.abs(pairs[index * 2] ?? 0), Math.abs(pairs[index * 2 + 1] ?? 0));
}

/** Трёхточечное сглаживание амплитуд. `amount` 0..1: доля соседей в итоговом значении. */
export function smoothAmplitudes(values: Float32Array, amount: number): Float32Array {
  const result = new Float32Array(values.length);
  const side = amount / 3;
  for (let i = 0; i < values.length; i++) {
    const prev = values[Math.max(0, i - 1)] ?? 0;
    const next = values[Math.min(values.length - 1, i + 1)] ?? 0;
    result[i] = (values[i] ?? 0) * (1 - side * 2) + (prev + next) * side;
  }
  return result;
}

export function amplitudes(pairs: PeakPairs): Float32Array {
  const result = new Float32Array(pairs.length / 2);
  for (let i = 0; i < result.length; i++) result[i] = amplitudeAt(pairs, i);
  return result;
}

const MAX_GAIN = 8;
const GAIN_FLOOR = 0.02;

/** Множитель, который растягивает самый громкий пик файла до полной высоты. Тихие файлы не превращаются в шум благодаря потолку. */
export function peakGain(peaks: Float32Array): number {
  let top = 0;
  for (let i = 0; i < peaks.length; i++) top = Math.max(top, Math.abs(peaks[i] ?? 0));
  return Math.min(MAX_GAIN, 1 / Math.max(top, GAIN_FLOOR));
}

export function scaled(values: Float32Array, gain: number): Float32Array {
  return values.map((value) => Math.min(1, value * gain));
}
