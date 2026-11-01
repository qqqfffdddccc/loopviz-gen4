import { BUILTIN_LAYOUT_PRESETS } from "../layout-presets";
import { DEFAULT_FEATHER } from "../layout-feather";
import { DEFAULT_LAYOUT } from "../layout";
import { DEFAULT_POST_SETTINGS } from "../post/post-settings";
import { DEFAULT_THEME_SETTINGS } from "../theme";
import { createTimeline } from "../timeline";
import { DEFAULT_PROJECT_NAME, type ProjectState } from "./types";

export const MIN_BPM = 20;
export const MAX_BPM = 300;
export const MAX_BEATS_PER_BAR = 16;
export const MAX_MIDI_OFFSET_MS = 1000;
export const MAX_REPEATS = 999;
export const MIN_SECONDS = 0.1;
export const MAX_SECONDS = 3600;

const CLASSIC = BUILTIN_LAYOUT_PRESETS[0] ?? { id: "classic", name: "КЛАССИКА", layout: DEFAULT_LAYOUT };

/** Пустой проект. Выбор модулей приложение подставляет само из реестра. */
export function defaultProjectState(): ProjectState {
  const timeline = createTimeline();
  return {
    name: DEFAULT_PROJECT_NAME,
    media: { audio: null, midi: null },
    source: { bpm: timeline.bpm, beatsPerBar: timeline.beatsPerBar, midiOffsetMs: 0, selectedTracks: null },
    timeline: { fragment: timeline.fragment, snap: timeline.snapToBars, duration: timeline.duration },
    modules: {
      selected: { hero: null, midi: null, wave: null, overlay: null },
      params: { hero: {}, midi: {}, wave: {}, overlay: {} },
    },
    layout: { layout: DEFAULT_LAYOUT, basePreset: CLASSIC, gap: 0, feather: DEFAULT_FEATHER },
    theme: DEFAULT_THEME_SETTINGS,
    post: DEFAULT_POST_SETTINGS,
    export: { resolution: "1080p", fps: 60, codec: "h264", fileName: "" },
  };
}
