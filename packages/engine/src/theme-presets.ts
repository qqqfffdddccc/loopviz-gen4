import type { ThemeSettings } from "./theme";

export interface ThemePreset extends ThemeSettings {
  id: string;
  name: string;
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  { id: "ember", name: "EMBER", accent: { l: 0.7, c: 0.19, h: 40 }, paperTint: 0.5, glow: 0.6 },
  { id: "rose", name: "ROSE", accent: { l: 0.72, c: 0.16, h: 5 }, paperTint: 0.6, glow: 0.6 },
  { id: "ultramarine", name: "ULTRAMARINE", accent: { l: 0.5, c: 0.22, h: 265 }, paperTint: 0.5, glow: 0.7 },
  { id: "moss", name: "MOSS", accent: { l: 0.64, c: 0.14, h: 135 }, paperTint: 0.5, glow: 0.5 },
  { id: "amber", name: "AMBER", accent: { l: 0.82, c: 0.16, h: 78 }, paperTint: 0.6, glow: 0.6 },
  { id: "graphite-mono", name: "GRAPHITE MONO", accent: { l: 0.32, c: 0.006, h: 60 }, paperTint: 0, glow: 0.2 },
];

export const DEFAULT_PRESET_ID = "ember";

export function findPreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((preset) => preset.id === id);
}

/** Пресет, чьи настройки совпадают с текущими. Нужен, чтобы подсветить строку в списке. */
export function matchPreset(settings: ThemeSettings): ThemePreset | undefined {
  return THEME_PRESETS.find(
    (p) =>
      p.accent.l === settings.accent.l &&
      p.accent.c === settings.accent.c &&
      p.accent.h === settings.accent.h &&
      p.paperTint === settings.paperTint &&
      p.glow === settings.glow,
  );
}
