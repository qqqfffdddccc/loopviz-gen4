export interface FrameRenderer {
  /** Пишет кадр index (RGBA, строки сверху вниз) в out. Время кадра t = index / fps. */
  render(index: number, t: number, out: Uint8Array): void;
}

export interface FrameSink {
  sendFrame(index: number, bytes: Uint8Array): Promise<void>;
}

export interface ExportProgress {
  frame: number;
  frameCount: number;
  /** Средняя скорость рендера в кадрах в секунду. */
  renderFps: number;
  elapsedSec: number;
  etaSec: number;
  stats?: FrameLoopStats;
}

export interface FrameLoopStats {
  /** Время внутри renderer.render, мс. */
  renderMs: number;
  /** Время ожидания sink (обратное давление), мс. */
  waitMs: number;
}

export interface FrameLoopOptions {
  frameCount: number;
  fps: number;
  frameBytes: number;
  window: number;
  renderer: FrameRenderer;
  sink: FrameSink;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
  now?: () => number;
}

export class ExportCancelled extends Error {
  constructor() {
    super("Экспорт отменён");
    this.name = "ExportCancelled";
  }
}

export function progressAt(frame: number, frameCount: number, elapsedSec: number): ExportProgress {
  const renderFps = elapsedSec > 0 ? frame / elapsedSec : 0;
  const etaSec = renderFps > 0 ? (frameCount - frame) / renderFps : 0;
  return { frame, frameCount, renderFps, elapsedSec, etaSec };
}

/**
 * Рендерит кадры 0..frameCount-1 строго по порядку (stateful-модули идут от нуля).
 * Кольцо из `window` буферов: буфер можно перезаписать только после того, как sink принял кадр,
 * поэтому в полёте не больше `window` кадров и рендер не убегает вперёд записи.
 */
export async function runFrameLoop(options: FrameLoopOptions): Promise<FrameLoopStats> {
  const { frameCount, fps, frameBytes, renderer, sink, signal, onProgress } = options;
  const now = options.now ?? (() => performance.now());
  const window = Math.max(1, Math.min(options.window, frameCount));
  const buffers = Array.from({ length: window }, () => new Uint8Array(frameBytes));
  const pending: (Promise<void> | undefined)[] = new Array<Promise<void> | undefined>(window).fill(undefined);
  let failure: unknown = null;
  const startedAt = now();
  const stats: FrameLoopStats = { renderMs: 0, waitMs: 0 };

  const check = (): void => {
    if (failure !== null) throw failure;
    if (signal?.aborted) throw new ExportCancelled();
  };

  for (let index = 0; index < frameCount; index++) {
    const slot = index % window;
    const waitStart = now();
    await pending[slot];
    stats.waitMs += now() - waitStart;
    check();
    const buffer = buffers[slot];
    if (!buffer) throw new Error("Буфер кадра не создан");
    const renderStart = now();
    renderer.render(index, index / fps, buffer);
    stats.renderMs += now() - renderStart;
    pending[slot] = sink.sendFrame(index, buffer).catch((error: unknown) => {
      failure ??= error;
    });
    onProgress?.({ ...progressAt(index + 1, frameCount, (now() - startedAt) / 1000), stats: { ...stats } });
  }
  const drainStart = now();
  await Promise.all(pending);
  stats.waitMs += now() - drainStart;
  check();
  return stats;
}
