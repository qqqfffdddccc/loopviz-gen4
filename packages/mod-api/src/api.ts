import type * as THREE from "three";
import type { ModuleDefinition, Rgb, defineModule } from "./types";

/**
 * Всё, что мод получает от приложения. Моды грузятся из blob URL и не могут импортировать пакеты,
 * поэтому entry экспортирует `export default function (api) { return api.defineModule(meta, build) }`.
 */
export interface ModApi {
  /** Версия контракта. Должна совпадать с `apiVersion` манифеста. */
  readonly API_VERSION: number;
  readonly defineModule: typeof defineModule;
  /** Тот же экземпляр three, которым рендерит приложение: материалы и текстуры совместимы с общим renderer. */
  readonly THREE: typeof THREE;
  clamp(value: number, min: number, max: number): number;
  lerp(a: number, b: number, k: number): number;
  smoothstep(edge0: number, edge1: number, x: number): number;
  srgbToLinear(c: number): number;
  linearToSrgb(c: number): number;
  /** Цвет темы (линейный RGB) в строку `rgba(...)` для canvas2d. */
  linearToCss(rgb: Rgb, alpha?: number): string;
  readonly glsl: {
    /** hash12, hash22, gnoise, fbm, rot2: вставьте в начало фрагментного шейдера. */
    readonly noise: string;
    /** Вершинный шейдер полноэкранного прохода (varying vec2 vUv); совпадает с `ctx.helpers.fullscreenVertex`. */
    readonly fullscreenVertex: string;
  };
  /** Имена шрифтов, которые приложение поставляет с собой. */
  readonly fonts: readonly string[];
}

/** Сигнатура default-экспорта entry-файла мода. */
export type ModEntry = (api: ModApi) => ModuleDefinition;
