export interface Onset {
  /** Секунды от начала исходника. */
  time: number;
  /** 0..1 относительно самого сильного удара файла. */
  strength: number;
}

export interface RingBirth {
  /** Секунды с момента рождения кольца. */
  age: number;
  strength: number;
}

const LOOKBACK_SEC = 0.05;
const MIN_GAP_SEC = 0.12;
const ABSOLUTE_FLUX_FLOOR = 0.015;

/**
 * Онсеты по огибающей пиков файла (пары [min, max]). Чистая функция от данных: результат кэшируют по массиву пиков.
 * Время точки i равно i / (точек в секунду), поэтому нужна длительность файла.
 *
 * @param sensitivity 0..1: выше значение, ниже порог.
 */
export function extractOnsets(peaks: Float32Array, durationSec: number, sensitivity: number): Onset[] {
  const count = Math.floor(peaks.length / 2);
  if (count < 8 || !(durationSec > 0)) return [];

  const env = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    env[i] = Math.max(Math.abs(peaks[2 * i] ?? 0), Math.abs(peaks[2 * i + 1] ?? 0));
  }

  const perSec = count / durationSec;
  const lookback = Math.max(2, Math.round(LOOKBACK_SEC * perSec));
  const gap = Math.max(2, Math.round(MIN_GAP_SEC * perSec));

  const prefix = new Float64Array(count + 1);
  for (let i = 0; i < count; i++) prefix[i + 1] = (prefix[i] ?? 0) + (env[i] ?? 0);

  const flux = new Float32Array(count);
  let maxFlux = 0;
  for (let i = 0; i < count; i++) {
    const from = Math.max(0, i - lookback);
    const mean = i > from ? ((prefix[i] ?? 0) - (prefix[from] ?? 0)) / (i - from) : 0;
    const value = Math.max(0, (env[i] ?? 0) - mean);
    flux[i] = value;
    if (value > maxFlux) maxFlux = value;
  }
  if (maxFlux <= ABSOLUTE_FLUX_FLOOR) return [];

  const k = Math.min(1, Math.max(0, sensitivity));
  const threshold = Math.max(ABSOLUTE_FLUX_FLOOR, maxFlux * (0.55 - 0.45 * k));
  const onsets: Onset[] = [];
  let last = -Infinity;
  for (let i = 0; i < count; i++) {
    const value = flux[i] ?? 0;
    if (value < threshold) continue;
    let isPeak = true;
    for (let j = Math.max(0, i - gap); j <= Math.min(count - 1, i + gap); j++) {
      const other = flux[j] ?? 0;
      if (other > value || (other === value && j < i)) {
        isPeak = false;
        break;
      }
    }
    if (!isPeak || i - last < gap) continue;
    last = i;
    onsets.push({ time: i / perSec, strength: Math.min(1, value / maxFlux) });
  }
  return onsets;
}

/** Длительность исходного файла из кадра: progress = sourceT / duration. Нулевой progress или упёршийся в 1 не годятся. */
export function estimateDuration(sourceSec: number, progress: number): number | null {
  if (!(progress > 1e-6) || progress >= 1) return null;
  return Math.round((sourceSec / progress) * 1000) / 1000;
}

export interface FragmentSpan {
  /** Секунды исходника. */
  start: number;
  end: number;
}

function lastIndexBefore(onsets: readonly Onset[], time: number, inclusive: boolean): number {
  let lo = 0;
  let hi = onsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const value = onsets[mid]?.time ?? Infinity;
    if (inclusive ? value <= time : value < time) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/**
 * Кольца, живые в момент `nowSec`, от новых к старым. Онсеты берутся только из фрагмента. Кольца, рождённые в конце
 * фрагмента, доживают в начале следующего прохода (возраст считается через длину фрагмента), поэтому петля бесшовная.
 * Без `span` (фрагмент неизвестен) берётся всё до `nowSec`.
 */
export function activeRings(
  onsets: readonly Onset[],
  nowSec: number,
  lifeSec: number,
  span: FragmentSpan | null,
  max: number,
): RingBirth[] {
  const rings: RingBirth[] = [];
  const notBefore = span ? span.start : -Infinity;

  for (let i = lastIndexBefore(onsets, nowSec, true); i >= 0 && rings.length < max; i--) {
    const onset = onsets[i];
    if (!onset || onset.time < notBefore) break;
    const age = nowSec - onset.time;
    if (age > lifeSec) break;
    rings.push({ age, strength: onset.strength });
  }

  const length = span ? span.end - span.start : 0;
  if (span && length > 0) {
    for (let i = lastIndexBefore(onsets, span.end, false); i >= 0 && rings.length < max; i--) {
      const onset = onsets[i];
      if (!onset || onset.time < span.start) break;
      const age = nowSec - onset.time + length;
      if (age > lifeSec) break;
      if (onset.time <= nowSec) continue;
      rings.push({ age, strength: onset.strength });
    }
  }
  return rings;
}

/** Кольцо на каждую долю такта, сильнее на первой доле. Сетка тактов замкнута, поэтому петля бесшовная. */
export function beatRings(beat: number, bpm: number, lifeSec: number, beatsPerBar: number, max: number): RingBirth[] {
  const secPerBeat = 60 / Math.max(1, bpm);
  const newest = Math.floor(beat);
  const rings: RingBirth[] = [];
  for (let k = newest; rings.length < max; k--) {
    const age = (beat - k) * secPerBeat;
    if (age > lifeSec) break;
    const strong = ((k % beatsPerBar) + beatsPerBar) % beatsPerBar === 0;
    rings.push({ age, strength: strong ? 1 : 0.6 });
  }
  return rings;
}
