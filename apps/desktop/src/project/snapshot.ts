import { defaultParams, type ParamValues, type SlotKind } from "@loopviz/mod-api";
import { defaultProjectState, projectToJson, serializeProject, type ProjectState } from "@loopviz/engine";
import { useExportStore } from "../export/export-store";
import { registry } from "../runtime/registry";
import { ALL_SLOTS } from "../state/slots";
import { useAppStore } from "../state/store";
import { useSourceStore } from "../state/source-store";
import { useProjectStore } from "./project-store";

/** Собирает то, что попадает в файл проекта. Читает сторы через getState(): подписок и перерисовок нет. */
export function collectProjectState(): ProjectState {
  const app = useAppStore.getState();
  const source = useSourceStore.getState();
  const exporter = useExportStore.getState();
  const project = useProjectStore.getState();
  const { timeline } = source;

  const selectedTracks = source.midi
    ? source.midi.tracks.filter((track) => track.selected).map((track) => track.index)
    : project.carriedTracks;

  return {
    name: project.name,
    media: project.media,
    source: { bpm: timeline.bpm, beatsPerBar: timeline.beatsPerBar, midiOffsetMs: source.midiOffsetMs, selectedTracks },
    timeline: { fragment: timeline.fragment, snap: timeline.snapToBars, duration: timeline.duration },
    modules: { selected: app.moduleIds, params: app.moduleParams },
    layout: { layout: app.layout, basePreset: app.basePreset, gap: app.gap, feather: app.feather },
    theme: app.theme,
    post: app.post,
    export: { resolution: exporter.resolution, fps: exporter.fps, codec: exporter.codec, fileName: exporter.fileName },
  };
}

/** Состояние нового проекта: первый модуль каждого слота с параметрами по умолчанию. */
export function freshProjectState(): ProjectState {
  const base = defaultProjectState();
  const selected = { ...base.modules.selected };
  const params: Record<SlotKind, Record<string, ParamValues>> = { hero: {}, midi: {}, wave: {}, overlay: {} };
  for (const slot of ALL_SLOTS) {
    const module = registry.listVisible(slot)[0];
    selected[slot] = module?.id ?? null;
    if (module) params[slot][module.id] = defaultParams(module.params);
  }
  return { ...base, modules: { selected, params } };
}

/** Новые параметры модуля, добавленные после сохранения проекта, получают значения по умолчанию. */
function withModuleDefaults(state: ProjectState): ProjectState["modules"] {
  const params = { ...state.modules.params };
  for (const slot of ALL_SLOTS) {
    const id = state.modules.selected[slot];
    const module = id ? registry.get(id) : undefined;
    if (id && module) params[slot] = { ...params[slot], [id]: { ...defaultParams(module.params), ...params[slot][id] } };
  }
  return { selected: state.modules.selected, params };
}

/** Применяет настройки, не зависящие от медиа. Аудио и MIDI грузит actions.ts. */
export function applyAppSettings(state: ProjectState): void {
  const modules = withModuleDefaults(state);
  useAppStore.setState({
    layout: state.layout.layout,
    basePreset: state.layout.basePreset,
    gap: state.layout.gap,
    feather: state.layout.feather,
    moduleIds: modules.selected,
    moduleParams: modules.params,
    theme: state.theme,
    post: state.post,
  });
  const { resolution, fps, codec, fileName } = state.export;
  useExportStore.setState({ resolution, fps, codec, fileName });
}

/** Таймлайн и смещение применяются после загрузки медиа: импорт MIDI и аудио переписывает BPM и фрагмент. */
export function applySourceSettings(state: ProjectState): void {
  const { source, timeline } = state;
  const selected = source.selectedTracks ? new Set(source.selectedTracks) : null;
  useSourceStore.setState((s) => ({
    midiOffsetMs: source.midiOffsetMs,
    bpmSource: s.midi?.tempo === source.bpm ? "midi" : "manual",
    midi:
      s.midi && selected
        ? { ...s.midi, tracks: s.midi.tracks.map((track) => ({ ...track, selected: selected.has(track.index) })) }
        : s.midi,
    timeline: {
      bpm: source.bpm,
      beatsPerBar: source.beatsPerBar,
      fragment: timeline.fragment,
      snapToBars: timeline.snap,
      duration: timeline.duration,
    },
  }));
}

export function currentProjectJson(savedAt: string): string {
  return projectToJson(serializeProject(collectProjectState(), savedAt));
}
