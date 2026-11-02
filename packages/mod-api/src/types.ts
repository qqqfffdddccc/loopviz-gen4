import type { ParamSchema, ParamValues } from "./params";
import type { ModuleContext, SurfaceKind } from "./context";

export const API_VERSION = 1;

export const SLOT_KINDS = ["hero", "midi", "wave", "overlay"] as const;

export type SlotKind = (typeof SLOT_KINDS)[number];

export type Rgb = readonly [number, number, number];

export interface Theme {
  /** Все цвета: линейный RGB, компоненты 0..1. */
  bg: Rgb;
  ink: Rgb;
  accent: Rgb;
  accentGlow: Rgb;
  grain: number;
  /** Сила свечения темы, 0..1. Compositor масштабирует ею bloom. */
  glow: number;
}

export interface NoteEvent {
  pitch: number;
  /** 0..1 */
  velocity: number;
  /** Секунды на часах лупа (как `FrameInput.loopT`). У нот окна на стыке лупа значения могут выходить за 0..длину лупа. */
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
  /** Всё нормировано в 0..1. bands: 8 полос, spectrum: 64 лог-полосы 30 Гц..16 кГц. */
  audio: { rms: number; bands: Float32Array; spectrum: Float32Array; onset: number };
  /** `window` покрывает [loopT - lookbehind, loopT + lookahead] с учётом зацикливания фрагмента. */
  midi: {
    active: NoteEvent[];
    window: NoteEvent[];
    range: [number, number];
    lookbehind: number;
    lookahead: number;
  };
  /**
   * peaks: пары [min, max] по всему файлу, длина 2 * точек. progress: позиция исходника в файле, 0..1.
   * fragment: границы выбранного фрагмента в тех же долях файла, `start <= progress <= end` во время воспроизведения.
   */
  wave: { peaks: Float32Array; progress: number; fragment: { start: number; end: number } };
  theme: Theme;
  size: { w: number; h: number; dpr: number };
}

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
  /** Необязательно: дожидается ресурсов (шрифты, изображения) перед первым кадром экспорта. Превью его не ждёт. */
  prepare?(params: P): void | Promise<void>;
  dispose(): void;
}

/** Статические данные модуля: известны без создания экземпляра. */
export type ModuleMeta<P extends ParamValues = ParamValues> = Pick<
  VisualModule<P>,
  "id" | "slot" | "name" | "params" | "surface"
>;

export type ModuleBehavior<P extends ParamValues = ParamValues> = Omit<VisualModule<P>, keyof ModuleMeta>;

/** Фабрика плюс метаданные. Превью и экспорт вызывают `create` каждый для своего экземпляра. */
export interface ModuleDefinition<P extends ParamValues = ParamValues> extends ModuleMeta<P> {
  /** Не показывать в списке выбора. Модуль остаётся в реестре, чтобы старые проекты открывались. */
  hidden?: boolean;
  create(): VisualModule<P>;
}

/** `build` вызывается на каждый новый экземпляр, поэтому замыкание внутри него хранит состояние только этого экземпляра. */
export function defineModule<P extends ParamValues>(
  meta: ModuleMeta<P>,
  build: () => ModuleBehavior<P>,
): ModuleDefinition<P> {
  return { ...meta, create: () => ({ ...meta, ...build() }) };
}

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

export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}
