import { hash01 } from "../petal-motion";
import type { FragmentSpan, Onset } from "../ring-schedule";

export const MAX_NODES = 48;
export const MAX_BOXES = 24;
export const MAX_LINKS = 32;

const TAU = Math.PI * 2;
const GOLDEN_X = 0.7548776662466927;
const GOLDEN_Y = 0.5698402909980532;
/** Периодичность идентификаторов в долях: 16 долей = 4 такта, делится на периоды слотов 2, 4 и 8. */
const ID_PERIOD_BEATS = 16;
const SLOT_PERIODS = [4, 8, 2, 8, 4, 8] as const;
const SPECTRUM_HIGH_FROM = 34;
const SPECTRUM_BINS = 64;

export const BOX_LIFE_SEC = 1.9;

export interface NodeSeed {
  index: number;
  x01: number;
  y01: number;
  /** 0 дальний, 1 ближний. */
  depth: number;
  sizeRoll: number;
  /** Рамка может встать только на заметный узел. */
  boxable: boolean;
  phaseX: number;
  phaseY: number;
  harmonicX: number;
  harmonicY: number;
  swayX: number;
  swayY: number;
  twinkleBin: number;
  twinklePhase: number;
  glowRoll: number;
  boxW: number;
  boxH: number;
  ticks: boolean;
}

export interface NodeState {
  x: number;
  y: number;
  radius: number;
}

export interface NodeOptions {
  aspect: number;
  /** Амплитуда дрейфа, 0..1. */
  drift: number;
}

export interface BoxBirth {
  id: number;
  /** Секунды с рождения рамки. */
  age: number;
  life: number;
  strength: number;
}

export interface BoxState {
  node: number;
  x: number;
  y: number;
  halfW: number;
  halfH: number;
  alpha: number;
  /** Вспышка рождения 0..1. */
  flash: number;
  /** 1 если у рамки есть метки координат. */
  ticks: number;
}

export interface LinkState {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  alpha: number;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function smooth(edge0: number, edge1: number, x: number): number {
  const k = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return k * k * (3 - 2 * k);
}

/** Зёрна узлов зависят только от индекса: добавление узлов не двигает прежние. Позиции берутся из рассыпчатой последовательности. */
export function nodeSeeds(count: number): NodeSeed[] {
  const seeds: NodeSeed[] = [];
  const total = Math.min(MAX_NODES, Math.max(0, Math.round(count)));
  for (let i = 0; i < total; i++) {
    seeds.push({
      index: i,
      x01: fract(0.5 + (i + 1) * GOLDEN_X + (hash01(i, 21) - 0.5) * 0.1),
      y01: fract(0.5 + (i + 1) * GOLDEN_Y + (hash01(i, 22) - 0.5) * 0.1),
      depth: hash01(i, 1),
      sizeRoll: hash01(i, 2),
      boxable: hash01(i, 3) < 0.55,
      phaseX: hash01(i, 4),
      phaseY: hash01(i, 5),
      harmonicX: hash01(i, 6) < 0.7 ? 1 : 2,
      harmonicY: hash01(i, 7) < 0.7 ? 1 : 2,
      swayX: 0.5 + hash01(i, 8),
      swayY: 0.5 + hash01(i, 9),
      twinkleBin: SPECTRUM_HIGH_FROM + Math.floor(hash01(i, 10) * (SPECTRUM_BINS - SPECTRUM_HIGH_FROM)),
      twinklePhase: hash01(i, 11),
      glowRoll: hash01(i, 12),
      boxW: 0.85 + 0.3 * hash01(i, 13),
      boxH: 0.85 + 0.3 * hash01(i, 14),
      ticks: hash01(i, 15) < 0.45,
    });
  }
  return seeds;
}

/** Замкнутый дрейф: при phase = 0 и 1 одна и та же картина. */
export function nodeState(seed: NodeSeed, phase: number, options: NodeOptions): NodeState {
  const { aspect, drift } = options;
  const amp = drift * 0.05 * (0.5 + 0.8 * seed.depth);
  const x = (seed.x01 - 0.5) * aspect + amp * seed.swayX * Math.sin(TAU * (seed.harmonicX * phase + seed.phaseX));
  const y = (seed.y01 - 0.5) * 1.04 + amp * 0.8 * seed.swayY * Math.sin(TAU * (seed.harmonicY * phase + seed.phaseY));
  const radius = (0.0035 + 0.011 * seed.sizeRoll) * (0.55 + 0.75 * seed.depth);
  return { x, y, radius };
}

/** Яркость узла: дыхание от громкости, мерцание от верхов. Мелкие и дальние мерцают сильнее. */
export function nodeBrightness(seed: NodeSeed, phase: number, rms: number, spectrum: ArrayLike<number>, reaction: number): number {
  const base = 0.55 + 0.45 * seed.glowRoll;
  const slow = 0.88 + 0.12 * Math.sin(TAU * (2 * phase + seed.twinklePhase));
  const breath = 1 + reaction * 0.9 * clamp01(rms);
  const sparkle = clamp01(spectrum[seed.twinkleBin] ?? 0);
  const smallness = 1 - 0.65 * seed.sizeRoll;
  const twinkle = 1 + reaction * 2.2 * smallness * sparkle * sparkle;
  return base * slow * breath * twinkle;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lastIndexAtOrBefore(onsets: readonly Onset[], time: number, inclusive: boolean): number {
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
 * Рождения рамок по онсетам, от новых к старым. Идентификатор равен номеру онсета в списке файла, поэтому узел рамки
 * стабилен. Рождённые в конце фрагмента доживают после стыка петли (как у колец).
 */
export function onsetBirths(
  onsets: readonly Onset[],
  nowSec: number,
  lifeSec: number,
  span: FragmentSpan | null,
  max: number,
): BoxBirth[] {
  const births: BoxBirth[] = [];
  const notBefore = span ? span.start : -Infinity;

  for (let i = lastIndexAtOrBefore(onsets, nowSec, true); i >= 0 && births.length < max; i--) {
    const onset = onsets[i];
    if (!onset || onset.time < notBefore) break;
    const age = nowSec - onset.time;
    if (age > lifeSec) break;
    births.push({ id: i, age, life: lifeSec, strength: onset.strength });
  }

  const length = span ? span.end - span.start : 0;
  if (span && length > 0) {
    for (let i = lastIndexAtOrBefore(onsets, span.end, false); i >= 0 && births.length < max; i--) {
      const onset = onsets[i];
      if (!onset || onset.time < span.start) break;
      const age = nowSec - onset.time + length;
      if (age > lifeSec) break;
      if (onset.time <= nowSec) continue;
      births.push({ id: i, age, life: lifeSec, strength: onset.strength });
    }
  }
  return births;
}

/** Запасной источник без онсетов: рамка на каждую долю, сильнее на первой. */
export function beatBirths(beat: number, bpm: number, lifeSec: number, beatsPerBar: number, max: number): BoxBirth[] {
  const secPerBeat = 60 / Math.max(1, bpm);
  const births: BoxBirth[] = [];
  for (let k = Math.floor(beat); births.length < max; k--) {
    const age = (beat - k) * secPerBeat;
    if (age > lifeSec) break;
    const strong = (((k % beatsPerBar) + beatsPerBar) % beatsPerBar) === 0;
    const id = ((k % ID_PERIOD_BEATS) + ID_PERIOD_BEATS) % ID_PERIOD_BEATS;
    births.push({ id: 1000 + id, age, life: lifeSec, strength: strong ? 1 : 0.65 });
  }
  return births;
}

/**
 * Фоновые рамки: слоты со своими периодами в долях сами переходят от узла к узлу, даже когда ударов нет.
 * Периоды делят 16 долей, идентификаторы повторяются с петлёй.
 */
export function baselineBirths(beat: number, bpm: number, slots: number): BoxBirth[] {
  const secPerBeat = 60 / Math.max(1, bpm);
  const births: BoxBirth[] = [];
  for (let s = 0; s < slots; s++) {
    const period = SLOT_PERIODS[s % SLOT_PERIODS.length] ?? 4;
    const shifted = beat + hash01(s, 40) * period;
    const cycle = Math.floor(shifted / period);
    const local = shifted / period - cycle;
    const cycles = ID_PERIOD_BEATS / period;
    const id = 4000 + s * 64 + (((cycle % cycles) + cycles) % cycles);
    births.push({ id, age: local * period * secPerBeat, life: period * secPerBeat * 0.9, strength: 0.7 });
  }
  return births;
}

export interface BoxEnvelope {
  alpha: number;
  flash: number;
  /** Множитель размера: рамка схлопывается на узел. */
  lock: number;
}

export function boxEnvelope(age: number, life: number, strength: number): BoxEnvelope {
  const rise = smooth(0, 0.07, age);
  const fall = 1 - smooth(life * 0.5, life, age);
  return {
    alpha: rise * fall,
    flash: strength * Math.exp(-age * 7) * rise,
    lock: 1 + 0.9 * Math.exp(-age * 13),
  };
}

/** Ставит рамки на узлы. Узел определяется только идентификатором рождения, а не соседними рамками. */
export function placeBoxes(
  births: readonly BoxBirth[],
  seeds: readonly NodeSeed[],
  states: readonly NodeState[],
  limit: number,
): BoxState[] {
  const boxable: number[] = [];
  for (const seed of seeds) if (seed.boxable) boxable.push(seed.index);
  const pool = boxable.length > 0 ? boxable : seeds.map((seed) => seed.index);
  const boxes: BoxState[] = [];
  if (pool.length === 0) return boxes;

  for (const birth of births) {
    if (boxes.length >= limit) break;
    const nodeIndex = pool[Math.floor(hash01(birth.id, 31) * pool.length)] ?? 0;
    const seed = seeds[nodeIndex];
    const state = states[nodeIndex];
    if (!seed || !state) continue;
    const env = boxEnvelope(birth.age, birth.life, birth.strength);
    if (env.alpha <= 0.002) continue;
    const half = (0.026 + 3 * state.radius) * env.lock;
    boxes.push({
      node: nodeIndex,
      x: state.x,
      y: state.y,
      halfW: half * seed.boxW,
      halfH: half * seed.boxH,
      alpha: env.alpha * (0.55 + 0.45 * birth.strength),
      flash: env.flash,
      ticks: seed.ticks ? 1 : 0,
    });
  }
  return boxes;
}

/** Расстояние от центра рамки до границы вдоль направления (dx, dy), нормированного. */
function edgeReach(halfW: number, halfH: number, dx: number, dy: number): number {
  const tx = Math.abs(dx) > 1e-6 ? halfW / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 1e-6 ? halfH / Math.abs(dy) : Infinity;
  return Math.min(tx, ty);
}

/**
 * Связи между близкими рамками: от границы к границе, прозрачность по более слабой рамке и расстоянию.
 * Остаются самые короткие, не больше `max`.
 */
export function linkBoxes(boxes: readonly BoxState[], maxDist: number, max: number): LinkState[] {
  const candidates: (LinkState & { dist: number })[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    if (!a) continue;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      if (!b || a.node === b.node) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= maxDist || dist < 1e-4) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const startReach = edgeReach(a.halfW, a.halfH, nx, ny);
      const endReach = edgeReach(b.halfW, b.halfH, nx, ny);
      if (startReach + endReach >= dist) continue;
      const alpha = Math.min(a.alpha, b.alpha) * (1 - smooth(maxDist * 0.5, maxDist, dist));
      if (alpha <= 0.002) continue;
      candidates.push({
        ax: a.x + nx * startReach,
        ay: a.y + ny * startReach,
        bx: b.x - nx * endReach,
        by: b.y - ny * endReach,
        alpha,
        dist,
      });
    }
  }
  candidates.sort((p, q) => p.dist - q.dist);
  return candidates.slice(0, max).map(({ ax, ay, bx, by, alpha }) => ({ ax, ay, bx, by, alpha }));
}
