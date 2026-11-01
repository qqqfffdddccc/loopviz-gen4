import { assertNever, SLOT_KINDS, type ParamValue, type ParamValues } from "@loopviz/mod-api";
import type { ExportCodec, ExportFps, ExportResolution } from "../export/plan";
import { parseLayout } from "../layout-edit";
import type { OklchColor, ThemeSettings } from "../theme";
import type { PostSettings } from "../post/post-settings";
import {
  MAX_BEATS_PER_BAR,
  MAX_BPM,
  MAX_MIDI_OFFSET_MS,
  MAX_REPEATS,
  MAX_SECONDS,
  MIN_BPM,
  MIN_SECONDS,
} from "./defaults";
import {
  isRaw,
  join,
  ProjectError,
  readBoolean,
  readEnum,
  readInt,
  readNumber,
  readObject,
  readString,
  type Raw,
} from "./read";
import type {
  MediaKind,
  MediaRef,
  ProjectExportSettings,
  ProjectLayout,
  ProjectModules,
  ProjectSource,
  ProjectState,
  ProjectTimeline,
} from "./types";

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const AUDIO_EXTENSIONS: readonly string[] = ["wav", "mp3", "flac", "aif", "aiff"];
const MIDI_EXTENSIONS: readonly string[] = ["mid", "midi"];
const RESOLUTIONS: readonly ExportResolution[] = ["1080p", "4k"];
const FPS_VALUES: readonly ExportFps[] = [30, 60];
const CODECS: readonly ExportCodec[] = ["h264", "hevc"];
const DURATION_MODES = ["repeats", "seconds"] as const;

export function allowedExtensions(kind: MediaKind): readonly string[] {
  switch (kind) {
    case "audio":
      return AUDIO_EXTENSIONS;
    case "midi":
      return MIDI_EXTENSIONS;
    default:
      return assertNever(kind);
  }
}

function parseMediaRef(value: unknown, kind: MediaKind, path: string): MediaRef | null {
  if (value === undefined) return null;
  if (!isRaw(value)) throw new ProjectError("ожидался объект", path);
  const name = readString(value, "name", path, "");
  const hash = readString(value, "hash", path, "");
  const ext = readString(value, "ext", path, "").toLowerCase();
  const size = readNumber(value, "size", path, 0, { min: 0, max: Number.MAX_SAFE_INTEGER });
  if (!name) throw new ProjectError("нужно имя файла", join(path, "name"));
  if (!HASH_PATTERN.test(hash)) throw new ProjectError("хеш должен быть sha256 в нижнем регистре", join(path, "hash"));
  if (!allowedExtensions(kind).includes(ext)) throw new ProjectError(`расширение .${ext} не подходит для ${kind}`, join(path, "ext"));
  return { name, hash, ext, size: Math.round(size) };
}

export function parseMedia(raw: Raw | undefined): ProjectState["media"] {
  const path = "media";
  const media = raw ?? {};
  return { audio: parseMediaRef(media["audio"], "audio", join(path, "audio")), midi: parseMediaRef(media["midi"], "midi", join(path, "midi")) };
}

function parseTrackList(value: unknown, path: string): number[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw new ProjectError("ожидался массив индексов", path);
  const indexes = value.map((item, i) => {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0) throw new ProjectError("ожидался индекс трека", join(path, i));
    return item;
  });
  return [...new Set(indexes)].sort((a, b) => a - b);
}

export function parseSource(raw: Raw | undefined, defaults: ProjectSource): ProjectSource {
  const path = "source";
  const source = raw ?? {};
  return {
    bpm: readNumber(source, "bpm", path, defaults.bpm, { min: MIN_BPM, max: MAX_BPM }),
    beatsPerBar: readInt(source, "beatsPerBar", path, defaults.beatsPerBar, { min: 1, max: MAX_BEATS_PER_BAR }),
    midiOffsetMs: readNumber(source, "midiOffsetMs", path, defaults.midiOffsetMs, { min: -MAX_MIDI_OFFSET_MS, max: MAX_MIDI_OFFSET_MS }),
    selectedTracks: parseTrackList(source["selectedTracks"], join(path, "selectedTracks")) ?? defaults.selectedTracks,
  };
}

export function parseTimeline(raw: Raw | undefined, defaults: ProjectTimeline): ProjectTimeline {
  const path = "timeline";
  const timeline = raw ?? {};
  const fragmentRaw = readObject(timeline, "fragment", path);
  const fragmentPath = join(path, "fragment");
  const startSec = readNumber(fragmentRaw ?? {}, "startSec", fragmentPath, defaults.fragment.startSec, { min: 0, max: Number.MAX_SAFE_INTEGER });
  const endSec = readNumber(fragmentRaw ?? {}, "endSec", fragmentPath, defaults.fragment.endSec, { min: 0, max: Number.MAX_SAFE_INTEGER });

  const defaultMode = defaults.duration.mode;
  const mode = readEnum(timeline, "durationMode", path, DURATION_MODES, defaultMode);
  const repeats = readInt(timeline, "repeats", path, defaults.duration.mode === "repeats" ? defaults.duration.repeats : 1, { min: 1, max: MAX_REPEATS });
  const seconds = readNumber(timeline, "seconds", path, defaults.duration.mode === "seconds" ? defaults.duration.seconds : 15, {
    min: MIN_SECONDS,
    max: MAX_SECONDS,
  });
  return {
    fragment: { startSec, endSec: Math.max(startSec, endSec) },
    snap: readBoolean(timeline, "snap", path, defaults.snap),
    duration: mode === "repeats" ? { mode, repeats } : { mode, seconds },
  };
}

function parseParamValues(value: unknown, path: string): ParamValues {
  if (!isRaw(value)) throw new ProjectError("ожидался объект параметров", path);
  const result: Record<string, ParamValue> = {};
  for (const [key, item] of Object.entries(value)) {
    const valid = typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item));
    if (!valid) throw new ProjectError("значение параметра: число, строка или true/false", join(path, key));
    result[key] = item;
  }
  return result;
}

export function parseModules(raw: Raw | undefined, defaults: ProjectModules): ProjectModules {
  const path = "modules";
  const modules = raw ?? {};
  const selectedRaw = readObject(modules, "selected", path) ?? {};
  const paramsRaw = readObject(modules, "params", path) ?? {};

  const selected = { ...defaults.selected };
  const params = { ...defaults.params };
  for (const slot of SLOT_KINDS) {
    const id = selectedRaw[slot];
    if (id !== undefined) {
      if (id !== null && typeof id !== "string") throw new ProjectError("ожидался id модуля или null", join(join(path, "selected"), slot));
      selected[slot] = id;
    }
    const slotRaw = readObject(paramsRaw, slot, join(path, "params"));
    if (slotRaw) {
      const slotPath = join(join(path, "params"), slot);
      params[slot] = Object.fromEntries(Object.entries(slotRaw).map(([id, values]) => [id, parseParamValues(values, join(slotPath, id))]));
    }
  }
  return { selected, params };
}

export function parseLayoutSection(raw: Raw | undefined, defaults: ProjectLayout): ProjectLayout {
  const path = "layout";
  const section = raw ?? {};
  const layoutValue = section["layout"];
  const layout = layoutValue === undefined ? defaults.layout : parseLayout(layoutValue);
  if (!layout) throw new ProjectError("некорректная раскладка зон", join(path, "layout"));

  const baseRaw = readObject(section, "basePreset", path);
  let basePreset = defaults.basePreset;
  if (baseRaw) {
    const baseLayout = parseLayout(baseRaw["layout"]);
    if (!baseLayout) throw new ProjectError("некорректная раскладка пресета", join(join(path, "basePreset"), "layout"));
    basePreset = {
      id: readString(baseRaw, "id", join(path, "basePreset"), basePreset.id),
      name: readString(baseRaw, "name", join(path, "basePreset"), basePreset.name),
      layout: baseLayout,
    };
  }
  const nonNegative = { min: 0, max: Number.MAX_SAFE_INTEGER };
  return {
    layout,
    basePreset,
    gap: readNumber(section, "gap", path, defaults.gap, nonNegative),
    feather: readNumber(section, "feather", path, defaults.feather, nonNegative),
  };
}

function parseAccent(raw: Raw | undefined, defaults: OklchColor): OklchColor {
  const path = "theme.accent";
  const accent = raw ?? {};
  return {
    l: readNumber(accent, "l", path, defaults.l, { min: 0, max: 1 }),
    c: readNumber(accent, "c", path, defaults.c, { min: 0, max: 0.5 }),
    h: readNumber(accent, "h", path, defaults.h),
  };
}

export function parseTheme(raw: Raw | undefined, defaults: ThemeSettings): ThemeSettings {
  const path = "theme";
  const theme = raw ?? {};
  const unit = { min: 0, max: 1 };
  return {
    accent: parseAccent(readObject(theme, "accent", path), defaults.accent),
    paperTint: readNumber(theme, "paperTint", path, defaults.paperTint, unit),
    glow: readNumber(theme, "glow", path, defaults.glow, unit),
  };
}

export function parsePost(raw: Raw | undefined, defaults: PostSettings): PostSettings {
  const path = "post";
  const post = raw ?? {};
  const unit = { min: 0, max: 1 };
  const glowRaw = readObject(post, "slotGlow", path) ?? {};
  const slotGlow = { ...defaults.slotGlow };
  for (const slot of SLOT_KINDS) {
    slotGlow[slot] = readNumber(glowRaw, slot, join(path, "slotGlow"), defaults.slotGlow[slot], unit);
  }
  return {
    grain: readNumber(post, "grain", path, defaults.grain, unit),
    grainSize: readNumber(post, "grainSize", path, defaults.grainSize, unit),
    vignette: readNumber(post, "vignette", path, defaults.vignette, unit),
    bloomStrength: readNumber(post, "bloomStrength", path, defaults.bloomStrength, unit),
    bloomRadius: readNumber(post, "bloomRadius", path, defaults.bloomRadius, unit),
    slotGlow,
  };
}

export function parseExport(raw: Raw | undefined, defaults: ProjectExportSettings): ProjectExportSettings {
  const path = "export";
  const section = raw ?? {};
  return {
    resolution: readEnum(section, "resolution", path, RESOLUTIONS, defaults.resolution),
    fps: readEnum(section, "fps", path, FPS_VALUES, defaults.fps),
    codec: readEnum(section, "codec", path, CODECS, defaults.codec),
    fileName: readString(section, "fileName", path, defaults.fileName),
  };
}
