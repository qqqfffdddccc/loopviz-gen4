export const MAX_PETALS = 48;

export interface PetalSeed {
  index: number;
  x: number;
  v0: number;
  /** 0 дальний план, 1 ближний. */
  depth: number;
  sizeRoll: number;
  opacityRoll: number;
  squashRoll: number;
  rotation: number;
  swayX: number;
  swayY: number;
  phaseX: number;
  phaseY: number;
  phaseR: number;
  harmonicX: number;
  harmonicY: number;
  fallCycles: number;
  accentRoll: number;
}

export interface PetalOptions {
  aspect: number;
  /** Амплитуда качания, 0..1. */
  drift: number;
  /** Множитель размера. */
  size: number;
  /** Сила размытия вне фокуса, 0..1. */
  dof: number;
  /** Плоскость фокуса по глубине, 0..1. */
  focus: number;
}

export interface PetalState {
  x: number;
  y: number;
  radius: number;
  blur: number;
  rotation: number;
  squash: number;
  opacity: number;
}

const TAU = Math.PI * 2;
const VERTICAL_MARGIN = 1.3;
const EDGE_FADE = 0.14;

/** Целочисленный хэш (lowbias32), результат 0..1. Одинаков на любой платформе. */
export function hash01(index: number, salt: number): number {
  let h = (Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Зёрна лепестков: зависят только от индекса. Порядок от ближних к дальним, так их накладывает шейдер. */
export function petalSeeds(count: number = MAX_PETALS): PetalSeed[] {
  const seeds: PetalSeed[] = [];
  for (let i = 0; i < count; i++) {
    const depth = hash01(i, 1);
    seeds.push({
      index: i,
      x: hash01(i, 2) - 0.5,
      v0: hash01(i, 3),
      depth,
      sizeRoll: hash01(i, 4),
      opacityRoll: hash01(i, 5),
      squashRoll: hash01(i, 6),
      rotation: hash01(i, 7) * TAU,
      swayX: 0.5 + hash01(i, 8),
      swayY: 0.5 + hash01(i, 9),
      phaseX: hash01(i, 10),
      phaseY: hash01(i, 11),
      phaseR: hash01(i, 12),
      harmonicX: hash01(i, 13) < 0.5 ? 1 : 2,
      harmonicY: hash01(i, 14) < 0.5 ? 1 : 2,
      fallCycles: depth > 0.6 ? 2 : 1,
      accentRoll: hash01(i, 15),
    });
  }
  return seeds.sort((a, b) => b.depth - a.depth || a.index - b.index);
}

/**
 * Замкнутое движение лепестка как функция фазы петли (0..1, целое число оборотов). Состояния между кадрами нет:
 * при phase = 0 и phase = 1 получается одна и та же картина.
 */
export function petalState(seed: PetalSeed, phase: number, options: PetalOptions): PetalState {
  const { aspect, drift, size, dof, focus } = options;

  const v = fract(seed.v0 - seed.fallCycles * phase);
  const swayAmount = drift * 0.07 * (0.6 + seed.depth);
  const x =
    seed.x * (aspect + 0.3) + swayAmount * seed.swayX * Math.sin(TAU * (seed.harmonicX * phase + seed.phaseX));
  const y =
    (v - 0.5) * VERTICAL_MARGIN +
    drift * 0.03 * seed.swayY * Math.sin(TAU * (seed.harmonicY * phase + seed.phaseY));

  const radius = size * (0.03 + 0.06 * seed.sizeRoll) * (0.5 + 1.3 * seed.depth);
  const blur = 0.003 + dof * 0.12 * Math.abs(seed.depth - focus);
  const edge = smooth(0, EDGE_FADE, v) * smooth(1, 1 - EDGE_FADE, v);
  const opacity = (0.45 + 0.5 * seed.opacityRoll) * edge;

  return {
    x,
    y,
    radius,
    blur,
    rotation: seed.rotation + 0.9 * Math.sin(TAU * (phase + seed.phaseR)),
    squash: 0.5 + 0.25 * seed.squashRoll,
    opacity,
  };
}

/** Вспышка акцентного лепестка: чётные на доле, нечётные на восьмой после неё. 0..1. */
export function beatPulse(beat: number, index: number, decay = 5): number {
  return Math.exp(-decay * fract(beat + (index % 2) * 0.5));
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function smooth(edge0: number, edge1: number, x: number): number {
  const k = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return k * k * (3 - 2 * k);
}
