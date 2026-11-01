import type { ParamSchema, ParamValues } from "./params";
import type { ModuleContext, SurfaceKind } from "./context";

export const API_VERSION = 1;

export type SlotKind = "hero" | "midi" | "wave" | "overlay";

export type Rgb = readonly [number, number, number];

export interface Theme {
  /** Все цвета: линейный RGB, компоненты 0..1. */
  bg: Rgb;
  ink: Rgb;
  accent: Rgb;
  accentGlow: Rgb;
  grain: number;
}

export interface NoteEvent {
  pitch: number;
  velocity: number;
  /** Секунды от начала ролика. */
  start: number;
  end: number;
  track: number;
}

export interface FrameInput {
  t: number;
  loopT: number;
  beat: number;
  bar: number;
  bpm: number;
  audio: { rms: number; bands: Float32Array; spectrum: Float32Array; onset: number };
  midi: { active: NoteEvent[]; window: NoteEvent[]; range: [number, number] };
  wave: { peaks: Float32Array; progress: number };
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
  dispose(): void;
}

export interface ModManifest {
  id: string;
  name: string;
  slot: SlotKind;
  version: string;
  apiVersion: number;
  entry: string;
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}
