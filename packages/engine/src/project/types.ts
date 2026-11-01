import type { ParamValues, SlotKind } from "@loopviz/mod-api";
import type { ExportCodec, ExportFps, ExportResolution } from "../export/plan";
import type { Layout } from "../layout";
import type { LayoutPreset } from "../layout-presets";
import type { PostSettings } from "../post/post-settings";
import type { ThemeSettings } from "../theme";
import type { DurationMode, Fragment } from "../timeline";

export const PROJECT_FORMAT = "loopviz-project";
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = "loopviz";
export const DEFAULT_PROJECT_NAME = "БЕЗ НАЗВАНИЯ";

export type MediaKind = "audio" | "midi";

/** Ссылка на копию файла в кеше медиа приложения: `<hash>.<ext>`. */
export interface MediaRef {
  name: string;
  hash: string;
  ext: string;
  size: number;
}

export interface ProjectExportSettings {
  resolution: ExportResolution;
  fps: ExportFps;
  codec: ExportCodec;
  fileName: string;
}

export interface ProjectSource {
  bpm: number;
  beatsPerBar: number;
  midiOffsetMs: number;
  /** Индексы выбранных треков MIDI. null: в файле не задано, выбор остаётся как после импорта. */
  selectedTracks: number[] | null;
}

export interface ProjectTimeline {
  fragment: Fragment;
  snap: boolean;
  duration: DurationMode;
}

export interface ProjectModules {
  selected: Record<SlotKind, string | null>;
  /** Параметры по слоту и id модуля. Id неизвестных и неактивных модулей сохраняются как есть. */
  params: Record<SlotKind, Record<string, ParamValues>>;
}

export interface ProjectLayout {
  layout: Layout;
  basePreset: LayoutPreset;
  gap: number;
  feather: number;
}

/** Всё, что проект хранит о сеансе. Тяжёлые данные (аудио, анализ) в него не входят. */
export interface ProjectState {
  name: string;
  media: { audio: MediaRef | null; midi: MediaRef | null };
  source: ProjectSource;
  timeline: ProjectTimeline;
  modules: ProjectModules;
  layout: ProjectLayout;
  theme: ThemeSettings;
  post: PostSettings;
  export: ProjectExportSettings;
}

/** Содержимое файла `.loopviz`. Порядок ключей фиксирован, поэтому вывод детерминирован. */
export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  savedAt: string;
  name: string;
  media: { audio?: MediaRef; midi?: MediaRef };
  source: ProjectSource;
  timeline: {
    fragment: Fragment;
    snap: boolean;
    durationMode: DurationMode["mode"];
    repeats: number;
    seconds: number;
  };
  modules: ProjectModules;
  layout: ProjectLayout;
  theme: ThemeSettings;
  post: PostSettings;
  export: ProjectExportSettings;
}

export interface ParsedProject {
  savedAt: string;
  state: ProjectState;
}
