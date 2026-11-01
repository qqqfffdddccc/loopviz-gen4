import { create } from "zustand";
import type { ExportCodec, ExportFps, ExportProgress, ExportResolution } from "@loopviz/engine";

export type ExportPhase = "idle" | "preparing" | "running" | "finishing" | "done" | "error" | "cancelled";

export interface ExportResult {
  path: string;
  encoder: string;
  seconds: number;
}

export interface ExportStoreState {
  resolution: ExportResolution;
  fps: ExportFps;
  codec: ExportCodec;
  fileName: string;
  phase: ExportPhase;
  progress: ExportProgress | null;
  result: ExportResult | null;
  error: string | null;
  setResolution(value: ExportResolution): void;
  setFps(value: ExportFps): void;
  setCodec(value: ExportCodec): void;
  setFileName(value: string): void;
  begin(): void;
  setPhase(phase: ExportPhase): void;
  setProgress(progress: ExportProgress): void;
  finish(result: ExportResult): void;
  fail(message: string): void;
  cancelled(): void;
}

export const useExportStore = create<ExportStoreState>()((set) => ({
  resolution: "1080p",
  fps: 60,
  codec: "h264",
  fileName: "",
  phase: "idle",
  progress: null,
  result: null,
  error: null,
  setResolution: (resolution) => set({ resolution }),
  setFps: (fps) => set({ fps }),
  setCodec: (codec) => set({ codec }),
  setFileName: (fileName) => set({ fileName }),
  begin: () => set({ phase: "preparing", progress: null, result: null, error: null }),
  setPhase: (phase) => set({ phase }),
  setProgress: (progress) => set({ progress }),
  finish: (result) => set({ phase: "done", result }),
  fail: (error) => set({ phase: "error", error }),
  cancelled: () => set({ phase: "cancelled" }),
}));

export function isBusy(phase: ExportPhase): boolean {
  return phase === "preparing" || phase === "running" || phase === "finishing";
}
