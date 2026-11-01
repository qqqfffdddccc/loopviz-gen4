import type { CommonHelpers } from "./context";
import type { Rgb } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const k = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return k * k * (3 - 2 * k);
}

export const commonHelpers: CommonHelpers = { clamp, lerp, smoothstep };

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function linearToCss(rgb: Rgb, alpha = 1): string {
  const [r, g, b] = rgb.map((c) => Math.round(clamp(linearToSrgb(c), 0, 1) * 255));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
