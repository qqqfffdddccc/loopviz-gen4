const BEATS_PER_BAR = 4;
const BEAT_WEIGHT = 0.5;
const BEAT_DECAY = 6;
const FIRST_BEAT_GAIN = 1;
const OTHER_BEAT_GAIN = 0.6;

/** Огибающая удара доли: мгновенный подъём в начале доли и экспоненциальный спад. Первая доля такта сильнее. */
export function beatPulse(beat: number, beatsPerBar = BEATS_PER_BAR, decay = BEAT_DECAY): number {
  if (!Number.isFinite(beat)) return 0;
  const index = Math.floor(beat);
  const phase = beat - index;
  const slot = ((index % beatsPerBar) + beatsPerBar) % beatsPerBar;
  const gain = slot === 0 ? FIRST_BEAT_GAIN : OTHER_BEAT_GAIN;
  return gain * Math.exp(-phase * decay);
}

/** Импульс гало и паргелиев 0..1: сильнее из онсета анализа и приглушённой сетки долей, чтобы без онсетов небо не замирало. */
export function haloPulse(onset: number, beat: number): number {
  const hit = Math.min(1, Math.max(0, Number.isFinite(onset) ? onset : 0));
  return Math.min(1, Math.max(hit, beatPulse(beat) * BEAT_WEIGHT));
}

/** Средний уровень верхних полос 0..1: питает мерцание лучей. */
export function highBandLevel(bands: ArrayLike<number>, count = 3): number {
  const n = bands.length;
  if (n === 0) return 0;
  const take = Math.min(count, n);
  let sum = 0;
  for (let i = n - take; i < n; i++) sum += bands[i] ?? 0;
  return Math.min(1, Math.max(0, sum / take));
}
