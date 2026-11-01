import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { ExportCodec } from "@loopviz/engine";

export interface BeginOptions {
  width: number;
  height: number;
  fps: number;
  codec: ExportCodec;
  audioPath: string;
  outputPath: string;
}

export interface BeginInfo {
  encoder: string;
  hardware: boolean;
  ffmpeg: string;
}

export interface FinishInfo {
  path: string;
  frames: number;
  encoder: string;
}

export interface AutotestConfig {
  mode: "export" | "project";
  resolution: "1080p" | "4k";
}

export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export function exportBegin(options: BeginOptions): Promise<BeginInfo> {
  return invoke<BeginInfo>("export_begin", { options });
}

export async function exportFrame(index: number, bytes: Uint8Array): Promise<void> {
  await invoke("export_frame", bytes, { headers: { "x-frame-index": String(index) } });
}

export function exportFinish(): Promise<FinishInfo> {
  return invoke<FinishInfo>("export_finish");
}

export async function exportCancel(): Promise<void> {
  await invoke("export_cancel");
}

export function writeTempWav(bytes: Uint8Array): Promise<string> {
  return invoke<string>("write_temp_wav", bytes);
}

export function ffmpegPath(): Promise<string> {
  return invoke<string>("export_ffmpeg_path");
}

export function defaultExportDir(): Promise<string> {
  return invoke<string>("default_export_dir");
}

export async function revealInFinder(path: string): Promise<void> {
  await invoke("reveal_in_finder", { path });
}

export function pickOutputPath(defaultPath: string): Promise<string | null> {
  return save({ defaultPath, filters: [{ name: "MP4", extensions: ["mp4"] }] });
}

export function autotestConfig(): Promise<AutotestConfig | null> {
  return invoke<AutotestConfig | null>("autotest_config");
}

export async function autotestReadFixture(name: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("autotest_read_fixture", { name });
}

export async function autotestLog(message: string): Promise<void> {
  await invoke("autotest_log", { message });
}

export async function autotestExit(code: number): Promise<void> {
  await invoke("autotest_exit", { code });
}

/** Текст ошибки из Rust приходит строкой, из JS обычным Error. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
