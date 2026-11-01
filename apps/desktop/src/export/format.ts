import type { ExportProgress } from "@loopviz/engine";

const BAR_CELLS = 16;

export function progressBar(fraction: number): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  const filled = Math.round(clamped * BAR_CELLS);
  return `[${"█".repeat(filled)}${"░".repeat(BAR_CELLS - filled)}] ${Math.round(clamped * 100)}%`;
}

export function formatDuration(sec: number): string {
  const whole = Math.max(0, Math.round(sec));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return minutes > 0 ? `${minutes} МИН ${String(seconds).padStart(2, "0")} С` : `${seconds} С`;
}

export function progressLines(progress: ExportProgress): string[] {
  const fraction = progress.frameCount > 0 ? progress.frame / progress.frameCount : 0;
  return [
    progressBar(fraction),
    `КАДР ${progress.frame}/${progress.frameCount} · ${progress.renderFps.toFixed(1)} К/С`,
    `ПРОШЛО ${formatDuration(progress.elapsedSec)} · ОСТАЛОСЬ ${formatDuration(progress.etaSec)}`,
  ];
}
