import { createTimeline, parseProject, type MediaRef, type ProjectState } from "@loopviz/engine";
import { errorMessage } from "../export/ipc";
import { whenModsSettled } from "../mods/mods-store";
import { cancelImports, importAudioBytes, importMidiBytes } from "../runtime/importers";
import { registry } from "../runtime/registry";
import { setAnalysis, setAudioBuffer } from "../runtime/source-data";
import { transport } from "../runtime/transport";
import { ALL_SLOTS, SLOT_LABELS } from "../state/slots";
import { useSourceStore } from "../state/source-store";
import { readMedia } from "./media";
import { notify, useProjectStore } from "./project-store";
import { applyAppSettings, applySourceSettings, freshProjectState } from "./snapshot";
import { untracked } from "./watch";

const FROM_CACHE = { register: false };

export interface LoadOptions {
  path: string | null;
  dirty: boolean;
}

/** Убирает аудио, MIDI и анализ прежнего проекта. */
export function resetSource(): void {
  const hadAudio = useSourceStore.getState().audio !== null;
  cancelImports();
  setAnalysis(null);
  setAudioBuffer(null);
  if (hadAudio) transport.stop();
  useSourceStore.setState((s) => ({
    audio: null,
    status: { kind: "idle" },
    analysisVersion: s.analysisVersion + 1,
    midiName: null,
    midi: null,
    midiOffsetMs: 0,
    timeline: createTimeline(),
    bpmSource: "default",
    playing: false,
    notice: null,
  }));
  if (hadAudio) void transport.play();
}

async function loadMedia(
  ref: MediaRef,
  label: string,
  load: (bytes: ArrayBuffer) => Promise<boolean>,
  warnings: string[],
): Promise<boolean> {
  let bytes: ArrayBuffer;
  try {
    bytes = await readMedia(ref);
  } catch (error) {
    warnings.push(`${label} «${ref.name}» не найдено в кеше медиа (${errorMessage(error)}). Остальной проект открыт.`);
    return false;
  }
  if (await load(bytes)) return true;
  warnings.push(`${label} «${ref.name}» не удалось прочитать из кеша. Остальной проект открыт.`);
  return false;
}

function missingModules(state: ProjectState): string[] {
  const missing: string[] = [];
  for (const slot of ALL_SLOTS) {
    const id = state.modules.selected[slot];
    if (id && !registry.get(id)) missing.push(`модуль «${id}» (слот ${SLOT_LABELS[slot]}) не найден, его параметры сохранены в проекте`);
  }
  return missing;
}

/** Применяет проект целиком. Ошибка разбора не трогает текущий проект. */
export async function loadProjectJson(json: string, options: LoadOptions): Promise<boolean> {
  let state: ProjectState;
  try {
    state = parseProject(json, freshProjectState()).state;
  } catch (error) {
    notify("error", `Не удалось открыть проект: ${errorMessage(error)}`);
    return false;
  }

  const project = useProjectStore.getState();
  project.patch({ busy: "ОТКРЫТИЕ...", message: null });
  await whenModsSettled();
  const warnings = missingModules(state);
  try {
    await untracked(async () => {
      resetSource();
      applyAppSettings(state);
      project.patch({ name: state.name, path: options.path, media: state.media, carriedTracks: null });

      const { audio, midi } = state.media;
      let midiLoaded = false;
      if (midi) {
        midiLoaded = await loadMedia(midi, "MIDI", (bytes) => importMidiBytes(midi.name, bytes, FROM_CACHE), warnings);
      }
      if (audio) {
        await loadMedia(audio, "Аудио", (bytes) => importAudioBytes(audio.name, () => Promise.resolve(bytes), FROM_CACHE), warnings);
      }
      applySourceSettings(state);
      useSourceStore.getState().setNotice(null);
      if (!midiLoaded) project.patch({ carriedTracks: state.source.selectedTracks });
    });
  } finally {
    project.patch({ busy: null, dirty: options.dirty });
  }
  if (warnings.length > 0) notify("warn", warnings.join(" "));
  return true;
}
