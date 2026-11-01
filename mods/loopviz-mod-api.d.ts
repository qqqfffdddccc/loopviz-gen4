// Типы для авторов модов LoopViz. Версия контракта: apiVersion 1.
// Подключение в JS-файле мода:
//   /** @param {import("../loopviz-mod-api").ModApi} api */
//   export default function (api) { ... }
// Файл ведётся вручную по packages/mod-api; тест author-types.test.ts сверяет его с кодом.
// Для типов three нужен пакет @types/three рядом с модом (необязательно, мод работает и без него).

import type * as THREE from "three";

export declare const API_VERSION = 1;

export type SlotKind = "hero" | "midi" | "wave" | "overlay";
export type SurfaceKind = "webgl" | "canvas2d";

/** Цвета темы: линейный RGB, компоненты 0..1. */
export type Rgb = readonly [number, number, number];

export interface Theme {
  bg: Rgb;
  ink: Rgb;
  accent: Rgb;
  accentGlow: Rgb;
  grain: number;
  /** Сила свечения темы, 0..1. */
  glow: number;
}

export interface NoteEvent {
  pitch: number;
  /** 0..1 */
  velocity: number;
  /** Секунды на часах лупа (как FrameInput.loopT). У нот окна на стыке лупа значения могут выходить за 0..длину лупа. */
  start: number;
  end: number;
  track: number;
}

export interface FrameInput {
  /** Секунды от начала ролика. */
  t: number;
  /** Секунды от начала фрагмента, 0..длина фрагмента. */
  loopT: number;
  /** Дробные доли и такты по времени исходника. */
  beat: number;
  bar: number;
  bpm: number;
  /** Всё в 0..1. bands: 8 полос, spectrum: 64 лог-полосы 30 Гц..16 кГц. */
  audio: { rms: number; bands: Float32Array; spectrum: Float32Array; onset: number };
  /** window покрывает [loopT - lookbehind, loopT + lookahead] с учётом зацикливания фрагмента. */
  midi: {
    active: NoteEvent[];
    window: NoteEvent[];
    range: [number, number];
    lookbehind: number;
    lookahead: number;
  };
  /**
   * peaks: пары [min, max] по всему файлу, длина 2 * точек. progress: позиция исходника в файле, 0..1.
   * fragment: границы выбранного фрагмента в тех же долях файла.
   */
  wave: { peaks: Float32Array; progress: number; fragment: { start: number; end: number } };
  theme: Theme;
  /** Размер текущего кадра в пикселях (превью или экспорт) и коэффициент dpr. */
  size: { w: number; h: number; dpr: number };
}

export type ParamValue = number | string | boolean;
export type ParamValues = Record<string, ParamValue>;

export interface SliderParam {
  kind: "slider";
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface ColorParam {
  kind: "color";
  label: string;
  /** Строго #rrggbb. */
  default: string;
}

export interface SelectParam {
  kind: "select";
  label: string;
  options: readonly string[];
  default: string;
}

export interface ToggleParam {
  kind: "toggle";
  label: string;
  default: boolean;
}

export interface FontParam {
  kind: "font";
  label: string;
  default: string;
}

export interface TextParam {
  kind: "text";
  label: string;
  default: string;
}

/** Значение: data URL изображения или пустая строка. */
export interface ImageParam {
  kind: "image";
  label: string;
  default: string;
}

export type ParamDescriptor = SliderParam | ColorParam | SelectParam | ToggleParam | FontParam | TextParam | ImageParam;

type DescriptorFor<V extends ParamValue> = V extends number
  ? SliderParam
  : V extends boolean
    ? ToggleParam
    : ColorParam | SelectParam | FontParam | TextParam | ImageParam;

export type ParamSchema<P extends ParamValues> = { [K in keyof P]: DescriptorFor<P[K]> };

export interface CommonHelpers {
  clamp(value: number, min: number, max: number): number;
  lerp(a: number, b: number, k: number): number;
  smoothstep(edge0: number, edge1: number, x: number): number;
}

export interface WebGLHelpers extends CommonHelpers {
  /** Вершинный шейдер полноэкранного прохода. Отдаёт varying vec2 vUv. */
  fullscreenVertex: string;
  /** Рисует материал на весь render target модуля. */
  renderFullscreenPass(material: THREE.ShaderMaterial): void;
}

export interface WebGLModuleContext {
  surface: "webgl";
  /** Общий renderer приложения: не меняйте его состояние за пределами своего render. */
  renderer: THREE.WebGLRenderer;
  target: THREE.WebGLRenderTarget;
  helpers: WebGLHelpers;
}

export interface Canvas2DModuleContext {
  surface: "canvas2d";
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  helpers: CommonHelpers;
}

export type ModuleContext = WebGLModuleContext | Canvas2DModuleContext;

export interface VisualModule<P extends ParamValues = ParamValues> {
  id: string;
  slot: SlotKind;
  name: string;
  params: ParamSchema<P>;
  surface: SurfaceKind;
  init(ctx: ModuleContext): void | Promise<void>;
  resize(w: number, h: number): void;
  render(frame: FrameInput, params: P): void;
  /**
   * Необязательно: ключ содержимого кадра. Если ключ и объект `params` те же, что на прошлом кадре,
   * host не вызывает `render` и не загружает поверхность в GPU заново: прежняя картинка остаётся.
   * Ключ обязан учитывать всё, от чего зависит рисунок, кроме размера поверхности и `params`
   * (цвета темы, производные от кадра тексты, готовность шрифтов и картинок). Без метода кадр рисуется всегда.
   */
  renderKey?(frame: FrameInput, params: P): string | number;
  /** Необязательно: дожидается ресурсов (шрифты, изображения) перед первым кадром экспорта. */
  prepare?(params: P): void | Promise<void>;
  dispose(): void;
}

/** Статические данные модуля: известны без создания экземпляра. */
export type ModuleMeta<P extends ParamValues = ParamValues> = Pick<
  VisualModule<P>,
  "id" | "slot" | "name" | "params" | "surface"
>;

export type ModuleBehavior<P extends ParamValues = ParamValues> = Omit<VisualModule<P>, keyof ModuleMeta>;

export interface ModuleDefinition<P extends ParamValues = ParamValues> extends ModuleMeta<P> {
  create(): VisualModule<P>;
}

export declare function defineModule<P extends ParamValues>(
  meta: ModuleMeta<P>,
  build: () => ModuleBehavior<P>,
): ModuleDefinition<P>;

export interface ModManifest {
  id: string;
  name: string;
  slot: SlotKind;
  version: string;
  apiVersion: number;
  entry: string;
  author?: string;
  description?: string;
}

/** Всё, что мод получает от приложения. */
export interface ModApi {
  readonly API_VERSION: number;
  readonly defineModule: typeof defineModule;
  /** Тот же экземпляр three, которым рендерит приложение. */
  readonly THREE: typeof THREE;
  clamp(value: number, min: number, max: number): number;
  lerp(a: number, b: number, k: number): number;
  smoothstep(edge0: number, edge1: number, x: number): number;
  srgbToLinear(c: number): number;
  linearToSrgb(c: number): number;
  /** Цвет темы (линейный RGB) в строку rgba(...) для canvas2d. */
  linearToCss(rgb: Rgb, alpha?: number): string;
  readonly glsl: {
    /** hash12, hash22, gnoise, fbm, rot2: вставьте в начало фрагментного шейдера. */
    readonly noise: string;
    /** Вершинный шейдер полноэкранного прохода (varying vec2 vUv). */
    readonly fullscreenVertex: string;
  };
  /** Имена шрифтов, которые приложение поставляет с собой. */
  readonly fonts: readonly string[];
}

/** Сигнатура default-экспорта entry-файла. */
export type ModEntry = (api: ModApi) => ModuleDefinition;
