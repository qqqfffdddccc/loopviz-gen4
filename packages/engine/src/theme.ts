import { clampChroma, converter, formatHex, parse, type Oklch } from "culori";
import { clamp, type Rgb, type Theme } from "@loopviz/mod-api";
import { THEME_PRESETS } from "./theme-presets";

export interface OklchColor {
  l: number;
  c: number;
  h: number;
}

export interface ThemeSettings {
  accent: OklchColor;
  /** 0..1: насколько бумага и чернила уходят в оттенок акцента. */
  paperTint: number;
  /** 0..1: сила свечения. Осветляет accentGlow и усиливает bloom. */
  glow: number;
}

export const DEFAULT_GRAIN = 0.5;

const toLinear = converter("lrgb");
const toOklch = converter("oklch");

const PAPER_L = 0.968;
const PAPER_CHROMA_MAX = 0.016;
const INK_L = 0.255;
const INK_CHROMA_MIN = 0.004;
const INK_CHROMA_MAX = 0.02;

function wrapHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

/** Урезает chroma до границ sRGB, сохраняя L и H. */
export function clampToGamut(color: OklchColor): OklchColor {
  const input: Oklch = { mode: "oklch", l: clamp(color.l, 0, 1), c: Math.max(0, color.c), h: wrapHue(color.h) };
  const clamped = clampChroma(input, "oklch");
  return { l: clamped.l, c: clamped.c, h: clamped.h ?? input.h ?? 0 };
}

export function oklchToLinear(color: OklchColor): Rgb {
  const { r, g, b } = toLinear({ mode: "oklch", ...clampToGamut(color) });
  return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)];
}

export function linearToOklch(rgb: Rgb): OklchColor {
  const { l, c, h } = toOklch({ mode: "lrgb", r: rgb[0], g: rgb[1], b: rgb[2] });
  return { l, c, h: h ?? 0 };
}

export function oklchToHex(color: OklchColor): string {
  return formatHex({ mode: "oklch", ...clampToGamut(color) });
}

/** Принимает `#rrggbb` и `#rgb`. Для некорректной строки возвращает undefined. */
export function hexToOklch(hex: string): OklchColor | undefined {
  const parsed = parse(hex);
  if (!parsed) return undefined;
  const { l, c, h } = toOklch(parsed);
  return { l, c, h: h ?? 0 };
}

export function linearToHex(rgb: Rgb): string {
  return formatHex({ mode: "lrgb", r: rgb[0], g: rgb[1], b: rgb[2] });
}

export function buildTheme(settings: ThemeSettings, grain = DEFAULT_GRAIN): Theme {
  const { accent } = settings;
  const tint = clamp(settings.paperTint, 0, 1);
  const glow = clamp(settings.glow, 0, 1);
  const hue = wrapHue(accent.h);
  const chromaScale = Math.min(1, accent.c / 0.08);

  const bg = oklchToLinear({ l: PAPER_L, c: PAPER_CHROMA_MAX * tint * chromaScale, h: hue });
  const ink = oklchToLinear({ l: INK_L, c: INK_CHROMA_MIN + (INK_CHROMA_MAX - INK_CHROMA_MIN) * tint * chromaScale, h: hue });
  const base = clampToGamut(accent);
  // Глубокий насыщенный цвет теряет в gamut при росте L, поэтому chroma подтягиваем и клемпим после сдвига L.
  const glowColor = clampToGamut({
    l: Math.min(0.96, base.l + 0.07 + 0.09 * glow),
    c: base.c * (1.05 + 0.3 * glow),
    h: base.h,
  });

  return { bg, ink, accent: oklchToLinear(base), accentGlow: oklchToLinear(glowColor), grain, glow };
}

const ember = THEME_PRESETS[0];
if (!ember) throw new Error("THEME_PRESETS is empty");

export const DEFAULT_THEME_SETTINGS: ThemeSettings = { accent: ember.accent, paperTint: ember.paperTint, glow: ember.glow };

export const DEFAULT_THEME: Theme = buildTheme(DEFAULT_THEME_SETTINGS);
