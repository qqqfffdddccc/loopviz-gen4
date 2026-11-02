import { hash01 } from "../petal-motion";

export const MAX_PLANES = 12;
/** Длина петли движения в долях: 4 такта по 4 доли. Целое число долей на цикл замыкает картину на стыке лупа. */
export const LOOP_BEATS = 16;

const GOLDEN = 0.6180339887498949;
const NEAR_Z = 0.35;
const FAR_Z = 3;
const BAR_SHARE = 0.65;
const SHADE_SHARE = 0.3;

export interface PlanesOptions {
  /** Ширина зоны к высоте: плоскости раскладываются по ширине. */
  aspect: number;
  count: number;
  /** Размытие краёв, 0..1. */
  softness: number;
  /** Наклон полос от вертикали, радианы. */
  tilt: number;
  /** 0 плавный дрейф, 1 ступени на долях с мягким разгоном. */
  step: number;
  /** Добавка к фазе глубины от баса, доли цикла. */
  push: number;
}

export interface PlaneLayout {
  /** Центр в координатах heroCoord. */
  cx: number;
  cy: number;
  /** Полуширина и полувысота прямоугольника в тех же единицах. */
  hw: number;
  hh: number;
  angle: number;
  /** Ширина размытия края. */
  soft: number;
  /** 0..1: появление вдали и растворение вблизи. */
  intensity: number;
  /** 0 светлая плоскость, 1 приглушённая тень. */
  tone: number;
  /** 0 далеко, 1 вплотную к камере. */
  depth: number;
}

export function smootherstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function fract(x: number): number {
  return x - Math.floor(x);
}

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Точка схода: чуть выше центра и правее, к ней сходятся плоскости. */
export function vanishingPoint(aspect: number): { x: number; y: number } {
  return { x: 0.06 * aspect, y: 0.04 };
}

/**
 * Раскладка плоскостей как чистая функция доли такта. Движение по глубине идёт ровно на цикл за LOOP_BEATS долей,
 * поэтому `planeLayout(beat)` и `planeLayout(beat + LOOP_BEATS)` совпадают (при push = 0). Случайности нет: всё из хэша индекса.
 */
export function planeLayout(beat: number, options: PlanesOptions): PlaneLayout[] {
  const count = Math.round(Math.min(MAX_PLANES, Math.max(1, options.count)));
  const { aspect, softness, tilt, step, push } = options;
  const vp = vanishingPoint(aspect);

  const whole = Math.floor(beat);
  const frac = beat - whole;
  const eased = smootherstep(frac);
  const position = whole + frac + (eased - frac) * step;
  const slot = ((whole % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS;
  const nextSlot = (slot + 1) % LOOP_BEATS;

  const layout: PlaneLayout[] = [];
  for (let i = 0; i < MAX_PLANES; i++) {
    const phase = fract(fract(i * GOLDEN + 0.13) + position / LOOP_BEATS + push);
    const z = FAR_Z * Math.pow(NEAR_Z / FAR_Z, phase);
    const scale = 1 / z;

    const shiftX = (mix(hash01(i * LOOP_BEATS + slot, 21), hash01(i * LOOP_BEATS + nextSlot, 21), eased) - 0.5) * 0.5 * step;
    const turn = (mix(hash01(i * LOOP_BEATS + slot, 22), hash01(i * LOOP_BEATS + nextSlot, 22), eased) - 0.5) * 0.26 * step;
    const sway = Math.sin((position / LOOP_BEATS) * Math.PI * 2 + hash01(i, 5) * Math.PI * 2) * 0.06;

    const worldX = ((hash01(i, 1) * 2 - 1) * 0.62 + shiftX + sway) * aspect;
    const worldY = (hash01(i, 2) * 2 - 1) * 0.42;
    const bar = hash01(i, 3) < BAR_SHARE;
    const roll = hash01(i, 4);
    const hw0 = bar ? 0.025 + 0.07 * roll : 0.14 + 0.16 * roll;
    const hh0 = bar ? 0.32 + 0.38 * roll : 0.07 + 0.09 * roll;

    const cx = vp.x + worldX * scale;
    const cy = vp.y + worldY * scale;
    const fade = smooth(0, 0.2, phase) * (1 - smooth(0.7, 1, phase));
    const shaded = hash01(i, 6) < SHADE_SHARE;
    const base = softness * 0.075 + 0.008;

    layout.push({
      cx,
      cy,
      hw: hw0 * scale,
      hh: hh0 * scale,
      angle: tilt + (hash01(i, 7) - 0.5) * 0.22 + (cx - vp.x) * 0.16 + turn,
      soft: base * (0.45 + 0.55 * scale),
      intensity: i < count ? fade * (0.55 + 0.45 * hash01(i, 8)) : 0,
      tone: shaded ? 1 : 0,
      depth: phase,
    });
  }
  return layout;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
