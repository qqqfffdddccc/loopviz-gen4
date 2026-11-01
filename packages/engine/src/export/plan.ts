import { assertNever } from "@loopviz/mod-api";
import { readbackByteLength, type ReadbackFormat } from "../post/pack-pass";

export type ExportResolution = "1080p" | "4k";
export type ExportCodec = "h264" | "hevc";
export type ExportFps = 30 | 60;

export interface ExportSize {
  width: number;
  height: number;
}

/** Кадров на GPU одновременно: пока один копируется, остальные рисуются. */
export const READBACK_DEPTH = 3;
const MAX_IN_FLIGHT = 8;
const IN_FLIGHT_BUDGET_BYTES = 256 * 1024 * 1024;

export function exportSize(resolution: ExportResolution): ExportSize {
  switch (resolution) {
    case "1080p":
      return { width: 1080, height: 1920 };
    case "4k":
      return { width: 2160, height: 3840 };
    default:
      return assertNever(resolution);
  }
}

export function exportFrameCount(totalSec: number, fps: number): number {
  return Math.max(0, Math.round(totalSec * fps));
}

export function frameByteLength(size: ExportSize, format: ReadbackFormat): number {
  return readbackByteLength(format, size);
}

/** Сколько кадров может быть в полёте: до 8, но не больше бюджета памяти на кольцо буферов. */
export function inFlightWindow(frameBytes: number): number {
  return Math.max(2, Math.min(MAX_IN_FLIGHT, Math.floor(IN_FLIGHT_BUDGET_BYTES / Math.max(1, frameBytes))));
}

export function defaultOutputName(base: string, resolution: ExportResolution, fps: ExportFps): string {
  const label = resolution === "4k" ? "2160x3840" : "1080x1920";
  const clean = base.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "_") || "loopviz";
  return `${clean}_${label}_${fps}.mp4`;
}
