import { BUILTIN_LAYOUT_PRESETS, parseProject, projectToJson, serializeProject, type ProjectState } from "@loopviz/engine";
import type { ParamDescriptor } from "@loopviz/mod-api";
import { useExportStore } from "../export/export-store";
import { autotestConfig, autotestExit, autotestLog, autotestReadFixture, errorMessage, isTauri } from "../export/ipc";
import { importAudioFile, importMidiFile } from "../runtime/importers";
import { registry } from "../runtime/registry";
import { getAnalysis } from "../runtime/source-data";
import { useAppStore } from "../state/store";
import { useSourceStore } from "../state/source-store";
import { openProjectAt, resetToNewProject, saveProjectTo } from "./actions";
import { setAutosaveEnabled } from "./autosave";
import { projectOpen, projectSave } from "./ipc";
import { useProjectStore } from "./project-store";
import { collectProjectState } from "./snapshot";

const SAVED_PATH = "/tmp/loopviz-autotest.loopviz";
const MISSING_MEDIA_PATH = "/tmp/loopviz-autotest-missing-media.loopviz";

type Section = keyof ProjectState;

function differingSections(a: ProjectState, b: ProjectState): Section[] {
  const keys = Object.keys(a) as Section[];
  return keys.filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}

function sliderValue(descriptor: ParamDescriptor): number | null {
  if (descriptor.kind !== "slider") return null;
  const mid = (descriptor.min + descriptor.max) / 2;
  const snapped = descriptor.min + Math.round((mid - descriptor.min) / descriptor.step) * descriptor.step;
  return snapped === descriptor.default ? descriptor.max : snapped;
}

function changeSettings(log: (message: string) => void): void {
  const app = useAppStore.getState();
  app.setThemePreset("ultramarine");
  const heroId = app.moduleIds.hero;
  const module = heroId ? registry.get(heroId) : undefined;
  const entry = module
    ? Object.entries<ParamDescriptor>(module.params).find(([, descriptor]) => sliderValue(descriptor) !== null)
    : undefined;
  if (entry) {
    const value = sliderValue(entry[1]);
    if (value !== null) {
      app.setParam("hero", entry[0], value);
      log(`параметр hero ${heroId}.${entry[0]} = ${value}`);
    }
  }
  const preset = BUILTIN_LAYOUT_PRESETS[1];
  if (preset) app.applyLayoutPreset(preset);
  app.setGap(6);
  const source = useSourceStore.getState();
  source.setFragment({ startSec: 2, endSec: 6 });
  source.setDuration({ mode: "repeats", repeats: 3 });
  source.setMidiOffsetMs(25);
  useExportStore.getState().setFps(30);
}

/** Только dev-сборка и только если Rust увидел LOOPVIZ_AUTOTEST_PROJECT. */
export async function maybeRunProjectAutotest(): Promise<void> {
  if (!import.meta.env.DEV || !isTauri()) return;
  const config = await autotestConfig().catch(() => null);
  if (config?.mode !== "project") return;
  const log = (message: string): void => void autotestLog(message).catch(() => undefined);
  const failures: string[] = [];
  const check = (label: string, ok: boolean, detail = ""): void => {
    log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
    if (!ok) failures.push(label);
  };

  try {
    setAutosaveEnabled(false);
    log("старт проектного автотеста");
    await importMidiFile(new File([await autotestReadFixture("test-loop.mid")], "test-loop.mid"));
    await importAudioFile(new File([await autotestReadFixture("test-loop.wav")], "test-loop.wav"));
    check("аудио проанализировано", useSourceStore.getState().status.kind === "ready" && getAnalysis() !== null);
    check("ссылки на медиа записаны", useProjectStore.getState().media.audio !== null && useProjectStore.getState().media.midi !== null);

    changeSettings(log);
    check("проект стал грязным", useProjectStore.getState().dirty);

    check("сохранение", await saveProjectTo(SAVED_PATH, true), SAVED_PATH);
    check("после сохранения проект чистый", !useProjectStore.getState().dirty);
    const savedJson = await projectOpen(SAVED_PATH);
    const saved = parseProject(savedJson);

    await resetToNewProject();
    const blank = useSourceStore.getState();
    check("сброс: аудио убрано", blank.audio === null && getAnalysis() === null && blank.midi === null);
    check("сброс: тема и фрагмент по умолчанию", useAppStore.getState().theme !== saved.state.theme && blank.timeline.fragment.endSec !== 6);

    const versionBefore = useSourceStore.getState().analysisVersion;
    check("открытие", await openProjectAt(SAVED_PATH));
    const reopened = useSourceStore.getState();
    check("анализ снова готов", reopened.status.kind === "ready" && getAnalysis() !== null && reopened.analysisVersion > versionBefore);
    check("MIDI вернулся", reopened.midi !== null && reopened.midiName === "test-loop.mid");
    check("фрагмент 2..6 и 3 повтора", reopened.timeline.fragment.startSec === 2 && reopened.timeline.fragment.endSec === 6 && reopened.timeline.duration.mode === "repeats" && reopened.timeline.duration.repeats === 3);
    check("после открытия проект чистый", !useProjectStore.getState().dirty);

    const again = collectProjectState();
    const againJson = projectToJson(serializeProject(again, saved.savedAt));
    const same = againJson === savedJson;
    check("повторная сериализация совпадает с файлом", same, same ? "" : differingSections(saved.state, again).join(", "));

    const broken = JSON.parse(savedJson) as { media: { audio: { hash: string } } };
    broken.media.audio.hash = "0".repeat(64);
    await projectSave(MISSING_MEDIA_PATH, JSON.stringify(broken));
    check("открытие с потерянным аудио", await openProjectAt(MISSING_MEDIA_PATH));
    const missing = useSourceStore.getState();
    const message = useProjectStore.getState().message;
    check("потерянное аудио: предупреждение, остальное загружено", missing.audio === null && message?.kind === "warn" && missing.midi !== null && missing.timeline.fragment.endSec === 6, message?.text ?? "нет сообщения");
    const kept = collectProjectState();
    check("ссылка на потерянное аудио сохраняется в проекте", kept.media.audio?.hash === "0".repeat(64));

    log(failures.length === 0 ? "PROJECT AUTOTEST OK" : `PROJECT AUTOTEST FAILED: ${failures.join("; ")}`);
    await autotestExit(failures.length === 0 ? 0 : 1);
  } catch (error) {
    log(`ОШИБКА ${errorMessage(error)}`);
    await autotestExit(1).catch(() => undefined);
  }
}
