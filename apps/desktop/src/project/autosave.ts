import { parseProject } from "@loopviz/engine";
import { errorMessage, isTauri } from "../export/ipc";
import { autosaveClear, autosaveRead, autosaveWrite } from "./ipc";
import { notify, useProjectStore, type RecoverOffer } from "./project-store";
import { currentProjectJson } from "./snapshot";

const STORAGE_KEY = "loopviz.autosave.v1";
const DEBOUNCE_MS = 3000;

interface Envelope {
  path: string | null;
  project: string;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let enabled = true;
let lastFailure = "";

function encode(envelope: Envelope): string {
  return JSON.stringify(envelope);
}

function decode(text: string): RecoverOffer | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null) return null;
    const { path, project } = value as Record<string, unknown>;
    if (typeof project !== "string" || (path !== null && typeof path !== "string")) return null;
    parseProject(project);
    return { path, json: project };
  } catch {
    return null;
  }
}

async function write(text: string): Promise<void> {
  if (isTauri()) await autosaveWrite(text);
  else localStorage.setItem(STORAGE_KEY, text);
}

async function flush(): Promise<void> {
  timer = null;
  const { recover, busy, path, dirty } = useProjectStore.getState();
  if (!enabled || !dirty || recover !== null || busy !== null) return;
  try {
    await write(encode({ path, project: currentProjectJson(new Date().toISOString()) }));
    lastFailure = "";
  } catch (error) {
    const message = errorMessage(error);
    if (message !== lastFailure) notify("warn", `Автосохранение не удалось: ${message}`);
    lastFailure = message;
  }
}

export function scheduleAutosave(): void {
  if (!enabled) return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => void flush(), DEBOUNCE_MS);
}

export function cancelAutosaveTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

export function setAutosaveEnabled(value: boolean): void {
  enabled = value;
  if (!value) cancelAutosaveTimer();
}

/** Удаляет автосохранение: после явного сохранения или отказа от восстановления оно больше не нужно. */
export async function discardAutosave(): Promise<void> {
  cancelAutosaveTimer();
  try {
    if (isTauri()) await autosaveClear();
    else localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Не удалось удалить автосохранение", error);
  }
}

/**
 * Автосохранение есть только если после последнего явного сохранения были изменения:
 * сохранение, новый проект и открытие его удаляют. Непустой файл поэтому всегда новее.
 */
export async function readAutosave(): Promise<RecoverOffer | null> {
  try {
    const text = isTauri() ? await autosaveRead() : localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    const offer = decode(text);
    if (!offer) await discardAutosave();
    return offer;
  } catch (error) {
    console.warn("Не удалось прочитать автосохранение", error);
    return null;
  }
}
