import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { PROJECT_EXTENSION } from "@loopviz/engine";

interface StoredMedia {
  hash: string;
  path: string;
}

const PROJECT_FILTERS = [{ name: "LoopViz", extensions: [PROJECT_EXTENSION] }];

export async function mediaStore(bytes: Uint8Array, ext: string): Promise<StoredMedia> {
  return invoke<StoredMedia>("media_store", bytes, { headers: { "x-media-ext": ext } });
}

export function mediaRead(hash: string, ext: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("media_read", { hash, ext });
}

export function projectSave(path: string, json: string): Promise<string> {
  return invoke<string>("project_save", { path, json });
}

export function projectOpen(path: string): Promise<string> {
  return invoke<string>("project_open", { path });
}

export async function autosaveWrite(json: string): Promise<void> {
  await invoke("autosave_write", { json });
}

export function autosaveRead(): Promise<string | null> {
  return invoke<string | null>("autosave_read");
}

export async function autosaveClear(): Promise<void> {
  await invoke("autosave_clear");
}

export function recentProjects(): Promise<string[]> {
  return invoke<string[]>("recent_projects");
}

export function defaultProjectDir(): Promise<string> {
  return invoke<string>("default_project_dir");
}

export function pickProjectToOpen(defaultPath: string): Promise<string | null> {
  return open({ defaultPath, multiple: false, directory: false, filters: PROJECT_FILTERS });
}

export function pickProjectToSave(defaultPath: string): Promise<string | null> {
  return save({ defaultPath, filters: PROJECT_FILTERS });
}
