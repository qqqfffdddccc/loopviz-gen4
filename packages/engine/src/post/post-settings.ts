import { clamp, type SlotKind } from "@loopviz/mod-api";

export interface PostSettings {
  /** 0..1 */
  grain: number;
  /** 0..1: от мелкого плёночного к крупному мягкому. */
  grainSize: number;
  /** 0..1 */
  vignette: number;
  /** 0..1 */
  bloomStrength: number;
  /** 0..1: от тугого ореола к широкому. */
  bloomRadius: number;
  /** 0..1 на слот: сколько света слот отдаёт в bloom. */
  slotGlow: Record<SlotKind, number>;
}

export const DEFAULT_POST_SETTINGS: PostSettings = {
  grain: 0.3,
  grainSize: 0.2,
  vignette: 0.35,
  bloomStrength: 0.7,
  bloomRadius: 0.45,
  slotGlow: { hero: 0.9, midi: 0.6, wave: 0.5, overlay: 0 },
};

export const BLOOM_LEVELS = 6;
export const GRAIN_FPS = 24;
/** Высота кадра, при которой зерно равно одному пикселю. Выше зерно укрупняется пропорционально. */
export const GRAIN_REFERENCE_HEIGHT = 1920;

/**
 * Веса уровней mip-цепочки: гауссов колокол с центром по радиусу.
 * Сумма равна 1, поэтому радиус меняет только форму ореола, а не его яркость.
 */
export function bloomWeights(radius: number, levels = BLOOM_LEVELS): number[] {
  const center = clamp(radius, 0, 1);
  const raw = Array.from({ length: levels }, (_, i) => {
    const t = levels > 1 ? i / (levels - 1) : 0;
    return Math.exp(-(((t - center) / 0.4) ** 2));
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

/** Целочисленный номер кадра зерна: одно и то же t всегда даёт то же зерно. */
export function grainSeed(t: number): number {
  const frame = Math.floor(Math.max(0, t) * GRAIN_FPS);
  return frame % 1048576;
}

const GRAIN_SIZE_MIN = 0.5;
const GRAIN_SIZE_MAX = 3;

/** Размер ячейки зерна до округления к пикселю; grainSize 0.2 даёт 1 px при высоте 1920. */
function rawGrainCell(outputHeight: number, grainSize: number): number {
  const scale = GRAIN_SIZE_MIN + (GRAIN_SIZE_MAX - GRAIN_SIZE_MIN) * clamp(grainSize, 0, 1);
  return (outputHeight / GRAIN_REFERENCE_HEIGHT) * scale;
}

/** Размер ячейки зерна в пикселях выхода. */
export function grainCellSize(outputHeight: number, grainSize = DEFAULT_POST_SETTINGS.grainSize): number {
  return Math.max(1, rawGrainCell(outputHeight, grainSize));
}

/**
 * Ячейка мельче пикселя невозможна, поэтому её эмулируем ослаблением: усреднение k×k
 * независимых зёрен уменьшает разброс в k раз. Так 1080p и 4K выглядят одинаково.
 */
export function grainAmplitudeScale(outputHeight: number, grainSize = DEFAULT_POST_SETTINGS.grainSize): number {
  return Math.min(1, rawGrainCell(outputHeight, grainSize));
}
