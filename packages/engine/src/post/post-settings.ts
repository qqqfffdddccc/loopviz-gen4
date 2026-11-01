import { clamp, type SlotKind } from "@loopviz/mod-api";

export interface PostSettings {
  /** 0..1 */
  grain: number;
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

/** Размер ячейки зерна в пикселях выхода. */
export function grainCellSize(outputHeight: number): number {
  return Math.max(1, outputHeight / GRAIN_REFERENCE_HEIGHT);
}
