import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  buildTheme,
  clampToGamut,
  hexToOklch,
  linearToHex,
  linearToOklch,
  oklchToHex,
  oklchToLinear,
  type ThemeSettings,
} from "./theme";
import { DEFAULT_PRESET_ID, THEME_PRESETS, findPreset, matchPreset } from "./theme-presets";

const inUnit = (rgb: readonly number[]): boolean => rgb.every((c) => c >= 0 && c <= 1);

function sweep(): ThemeSettings[] {
  const out: ThemeSettings[] = [];
  for (let h = 0; h < 360; h += 30) {
    for (const c of [0, 0.08, 0.2, 0.32]) {
      for (const l of [0.3, 0.6, 0.9]) {
        for (const paperTint of [0, 1]) out.push({ accent: { l, c, h }, paperTint, glow: paperTint });
      }
    }
  }
  return out;
}

describe("clampToGamut", () => {
  it("урезает chroma вне sRGB и сохраняет L и H", () => {
    const wild = { l: 0.7, c: 0.4, h: 150 };
    const clamped = clampToGamut(wild);
    expect(clamped.c).toBeLessThan(wild.c);
    expect(clamped.l).toBeCloseTo(wild.l, 2);
    expect(clamped.h).toBeCloseTo(wild.h, 0);
    expect(inUnit(oklchToLinear(wild))).toBe(true);
  });

  it("не трогает цвет внутри gamut", () => {
    const safe = { l: 0.7, c: 0.05, h: 40 };
    expect(clampToGamut(safe).c).toBeCloseTo(safe.c, 5);
  });
});

describe("buildTheme", () => {
  it("bg остаётся светлой бумагой, ink тёмный, все каналы в 0..1", () => {
    for (const settings of sweep()) {
      const theme = buildTheme(settings);
      expect(linearToOklch(theme.bg).l).toBeGreaterThan(0.94);
      expect(linearToOklch(theme.ink).l).toBeLessThan(0.35);
      for (const color of [theme.bg, theme.ink, theme.accent, theme.accentGlow]) expect(inUnit(color)).toBe(true);
    }
  });

  it("accentGlow светлее акцента, если у акцента есть запас по L", () => {
    for (const preset of THEME_PRESETS) {
      const theme = buildTheme(preset);
      expect(linearToOklch(theme.accentGlow).l).toBeGreaterThan(linearToOklch(theme.accent).l);
    }
  });

  it("paperTint=0 даёт нейтральную бумагу, paperTint=1 сдвигает её к оттенку акцента", () => {
    const accent = { l: 0.6, c: 0.2, h: 265 };
    const neutral = linearToOklch(buildTheme({ accent, paperTint: 0, glow: 0.5 }).bg);
    const tinted = linearToOklch(buildTheme({ accent, paperTint: 1, glow: 0.5 }).bg);
    expect(neutral.c).toBeLessThan(0.002);
    expect(tinted.c).toBeGreaterThan(0.008);
    expect(Math.abs(tinted.h - 265)).toBeLessThan(8);
  });

  it("детерминирован и совпадает с DEFAULT_THEME для пресета по умолчанию", () => {
    const preset = findPreset(DEFAULT_PRESET_ID);
    expect(preset).toBeDefined();
    if (preset) expect(buildTheme(preset)).toEqual(DEFAULT_THEME);
  });
});

describe("пресеты", () => {
  it("7 штук с уникальными id, находятся по id и по настройкам", () => {
    expect(THEME_PRESETS).toHaveLength(7);
    expect(new Set(THEME_PRESETS.map((p) => p.id)).size).toBe(7);
    for (const preset of THEME_PRESETS) {
      expect(findPreset(preset.id)).toBe(preset);
      expect(matchPreset({ accent: { ...preset.accent }, paperTint: preset.paperTint, glow: preset.glow })).toBe(preset);
    }
  });

  it("hex -> OKLCH -> hex возвращает тот же цвет", () => {
    for (const preset of THEME_PRESETS) {
      const hex = oklchToHex(preset.accent);
      const back = hexToOklch(hex);
      expect(back).toBeDefined();
      if (back) expect(oklchToHex(back)).toBe(hex);
    }
  });

  it("линейный RGB акцента совпадает с hex", () => {
    for (const preset of THEME_PRESETS) {
      expect(linearToHex(oklchToLinear(preset.accent))).toBe(oklchToHex(preset.accent));
    }
  });
});

describe("hexToOklch", () => {
  it("читает короткую запись и отвергает мусор", () => {
    expect(hexToOklch("#fff")?.l).toBeCloseTo(1, 2);
    expect(hexToOklch("не цвет")).toBeUndefined();
  });
});
