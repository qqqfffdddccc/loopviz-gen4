import type { FrameInput, Theme } from "@loopviz/mod-api";
import { BAND_COUNT, SPECTRUM_BINS, WAVE_POINTS } from "./analysis-types";
import { DEFAULT_THEME } from "./theme";

export interface IdleFrameOptions {
  t: number;
  width: number;
  height: number;
  dpr?: number;
  bpm?: number;
  theme?: Theme;
}

/** Кадр-заглушка для тестов и пустых слотов. Живой кадр собирает `buildFrameInput`. */
export function createIdleFrame(options: IdleFrameOptions): FrameInput {
  const { t, width, height, dpr = 1, bpm = 120, theme = DEFAULT_THEME } = options;
  const beat = (t * bpm) / 60;
  return {
    t,
    loopT: t,
    beat,
    bar: beat / 4,
    bpm,
    audio: { rms: 0, bands: new Float32Array(BAND_COUNT), spectrum: new Float32Array(SPECTRUM_BINS), onset: 0 },
    midi: { active: [], window: [], range: [36, 84], lookbehind: 0.5, lookahead: 2 },
    wave: { peaks: new Float32Array(WAVE_POINTS * 2), progress: 0 },
    theme,
    size: { w: width, h: height, dpr },
  };
}
