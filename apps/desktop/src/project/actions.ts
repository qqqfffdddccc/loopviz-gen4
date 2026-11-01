import { assertNever } from "@loopviz/mod-api";
import { DEFAULT_PROJECT_NAME, PROJECT_EXTENSION } from "@loopviz/engine";
import { errorMessage, isTauri } from "../export/ipc";
import { discardAutosave, readAutosave } from "./autosave";
import { defaultProjectDir, pickProjectToOpen, pickProjectToSave, projectOpen, projectSave, recentProjects } from "./ipc";
import { loadProjectJson, resetSource } from "./load";
import { fileStem, notify, useProjectStore, type PendingAction } from "./project-store";
import { applyAppSettings, currentProjectJson, freshProjectState } from "./snapshot";
import { captureSlices, sameSlices, untracked } from "./watch";

export const BROWSER_NOTE = "Открытие и сохранение файлов работают только в десктопном приложении LoopViz.";

let recoveryChecked = false;

/** Удаляет автосохранение и снимает предложение его восстановить. */
async function forgetAutosave(): Promise<void> {
  useProjectStore.getState().patch({ recover: null });
  await discardAutosave();
}

export async function refreshRecent(): Promise<void> {
  if (!isTauri()) return;
  try {
    useProjectStore.getState().patch({ recent: await recentProjects() });
  } catch (error) {
    console.warn("Не удалось прочитать список недавних проектов", error);
  }
}

/** Пустой проект. Автосохранение не трогает: это делает newProject. */
export async function resetToNewProject(): Promise<void> {
  await untracked(async () => {
    resetSource();
    applyAppSettings(freshProjectState());
    useProjectStore.getState().patch({
      name: DEFAULT_PROJECT_NAME,
      path: null,
      media: { audio: null, midi: null },
      carriedTracks: null,
      message: null,
    });
  });
  useProjectStore.getState().patch({ dirty: false });
}

export async function newProject(): Promise<void> {
  await resetToNewProject();
  await forgetAutosave();
}

export async function openProjectAt(path: string): Promise<boolean> {
  if (!isTauri()) {
    notify("warn", BROWSER_NOTE);
    return false;
  }
  try {
    const json = await projectOpen(path);
    const opened = await loadProjectJson(json, { path, dirty: false });
    await refreshRecent();
    return opened;
  } catch (error) {
    notify("error", `Не удалось открыть ${path}: ${errorMessage(error)}`);
    return false;
  }
}

/** При rename=true имя проекта становится именем выбранного файла. */
export async function saveProjectTo(path: string, rename: boolean): Promise<boolean> {
  if (!isTauri()) {
    notify("warn", BROWSER_NOTE);
    return false;
  }
  const project = useProjectStore.getState();
  if (rename) project.patch({ name: fileStem(path) || DEFAULT_PROJECT_NAME });
  const before = captureSlices();
  const json = currentProjectJson(new Date().toISOString());
  project.patch({ busy: "СОХРАНЕНИЕ..." });
  try {
    const saved = await projectSave(path, json);
    project.patch({ path: saved, busy: null, dirty: !sameSlices(before, captureSlices()) });
    await refreshRecent();
    return true;
  } catch (error) {
    project.patch({ busy: null });
    notify("error", `Не удалось сохранить: ${errorMessage(error)}`);
    return false;
  }
}

function directoryOf(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf("/")));
}

async function startDirectory(): Promise<string> {
  const { path } = useProjectStore.getState();
  return path ? directoryOf(path) : defaultProjectDir();
}

async function afterExplicitSave(saved: boolean): Promise<boolean> {
  if (saved && !useProjectStore.getState().dirty) await forgetAutosave();
  return saved;
}

export async function saveProjectAs(): Promise<boolean> {
  if (!isTauri()) {
    notify("warn", BROWSER_NOTE);
    return false;
  }
  try {
    const safeName = useProjectStore.getState().name.replace(/[\\/:]/g, "-");
    const target = await pickProjectToSave(`${await startDirectory()}/${safeName}.${PROJECT_EXTENSION}`);
    return target ? await afterExplicitSave(await saveProjectTo(target, true)) : false;
  } catch (error) {
    notify("error", `Не удалось сохранить: ${errorMessage(error)}`);
    return false;
  }
}

export async function saveProject(): Promise<boolean> {
  const { path } = useProjectStore.getState();
  return path ? afterExplicitSave(await saveProjectTo(path, false)) : saveProjectAs();
}

async function perform(action: PendingAction): Promise<void> {
  switch (action.kind) {
    case "new":
      await newProject();
      break;
    case "open": {
      const path = action.path ?? (await pickProjectToOpen(await startDirectory()));
      if (path && (await openProjectAt(path))) await forgetAutosave();
      break;
    }
    default:
      assertNever(action);
  }
}

function guarded(action: PendingAction): void {
  const { dirty, busy, patch } = useProjectStore.getState();
  if (busy !== null) return;
  if (!isTauri() && action.kind === "open") {
    notify("warn", BROWSER_NOTE);
    return;
  }
  if (dirty) patch({ pending: action });
  else void perform(action).catch((error: unknown) => notify("error", errorMessage(error)));
}

export function requestNewProject(): void {
  guarded({ kind: "new" });
}

/** path = null: показать диалог выбора файла. */
export function requestOpenProject(path: string | null): void {
  guarded({ kind: "open", path });
}

export async function resolvePending(choice: "save" | "discard" | "cancel"): Promise<void> {
  const { pending, patch } = useProjectStore.getState();
  patch({ pending: null });
  if (!pending || choice === "cancel") return;
  if (choice === "save" && !(await saveProject())) return;
  await perform(pending).catch((error: unknown) => notify("error", errorMessage(error)));
}

export async function checkRecovery(): Promise<void> {
  if (recoveryChecked) return;
  recoveryChecked = true;
  const offer = await readAutosave();
  if (offer) useProjectStore.getState().patch({ recover: offer });
}

export async function restoreSession(): Promise<void> {
  const { recover, patch } = useProjectStore.getState();
  patch({ recover: null });
  if (recover) await loadProjectJson(recover.json, { path: recover.path, dirty: true });
}

export async function declineRestore(): Promise<void> {
  await forgetAutosave();
}
