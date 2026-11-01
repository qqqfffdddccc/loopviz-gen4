import type { FrameInput, Theme } from "@loopviz/mod-api";
import { DEFAULT_THEME } from "./theme";

export interface IdleFrameOptions {
  t: number;
  width: number;
  height: number;
  dpr?: number;
  bpm?: number;
  theme?: Theme;
}

/** Кадр без аудио и MIDI. Данные появятся на этапе 2, тип FrameInput уже финальный. */
export function createIdleFrame(options: IdleFrameOptions): FrameInput {
  const { t, width, height, dpr = 1, bpm = 120, theme = DEFAULT_THEME } = options;
  const beat = (t * bpm) / 60;
  return {
    t,
    loopT: t,
    beat,
    bar: beat / 4,
    bpm,
    audio: { rms: 0, bands: new Float32Array(8), spectrum: new Float32Array(1024), onset: 0 },
    midi: { active: [], window: [], range: [36, 84] },
    wave: { peaks: new Float32Array(4096), progress: 0 },
    theme,
    size: { w: width, h: height, dpr },
  };
}
