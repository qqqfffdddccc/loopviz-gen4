import { invoke } from "@tauri-apps/api/core";
import type { ModFolder } from "@loopviz/engine";

export function listMods(): Promise<ModFolder[]> {
  return invoke<ModFolder[]>("list_mods");
}

export function readModFile(modPath: string, relPath: string): Promise<string> {
  return invoke<string>("read_mod_file", { modPath, relPath });
}

export function modsDir(): Promise<string> {
  return invoke<string>("mods_dir");
}

export async function revealModsDir(): Promise<void> {
  await invoke("reveal_mods_dir");
}

export function modsAutotestEnabled(): Promise<boolean> {
  return invoke<boolean>("mods_autotest_enabled");
}

export async function modsAutotestLog(message: string): Promise<void> {
  await invoke("mods_autotest_log", { message });
}

export async function modsAutotestExit(code: number): Promise<void> {
  await invoke("mods_autotest_exit", { code });
}
