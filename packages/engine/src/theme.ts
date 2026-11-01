import { srgbToLinear, type Theme } from "@loopviz/mod-api";

const fromHex = (r: number, g: number, b: number): readonly [number, number, number] => [
  srgbToLinear(r / 255),
  srgbToLinear(g / 255),
  srgbToLinear(b / 255),
];

export const DEFAULT_THEME: Theme = {
  bg: fromHex(244, 241, 234),
  ink: fromHex(42, 42, 46),
  accent: fromHex(255, 94, 48),
  accentGlow: fromHex(255, 150, 96),
  grain: 0.05,
};
