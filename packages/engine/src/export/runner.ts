import { NO_PROFILER, type StageProfiler } from "./stage-profiler";

/**
 * Рендер в два шага, чтобы GPU и CPU работали параллельно. `submit` ставит кадр в очередь GPU и сразу
 * возвращается; `collect` ждёт готовности кадра и пишет его байты (порядок видео, сверху вниз) в out.
 * Между submit и collect живёт не больше `depth` кадров, кадры собираются в порядке отправки.
 */
export interface FrameRenderer {
  readonly depth: number;
  submit(index: number, t: number): void;
  collect(index: number, out: Uint8Array): Promise<void>;
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
  /** Время внутри renderer.submit (CPU-часть рендера), мс. */
  renderMs: number;
  /** Время ожидания готовности кадра на GPU и его копирования, мс. */
  readMs: number;
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
  profiler?: StageProfiler;
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
 * GPU получает до `renderer.depth` кадров вперёд, пока CPU забирает готовые. Кольцо из `window` буферов:
 * буфер можно перезаписать только после того, как sink принял кадр, поэтому в полёте не больше
 * `window` кадров и рендер не убегает вперёд записи.
 */
export async function runFrameLoop(options: FrameLoopOptions): Promise<FrameLoopStats> {
  const { frameCount, fps, frameBytes, renderer, sink, signal, onProgress } = options;
  const now = options.now ?? (() => performance.now());
  const profiler = options.profiler ?? NO_PROFILER;
  const window = Math.max(1, Math.min(options.window, frameCount));
  const depth = Math.max(1, renderer.depth);
  const buffers = Array.from({ length: window }, () => new Uint8Array(frameBytes));
  const pending: (Promise<void> | undefined)[] = new Array<Promise<void> | undefined>(window).fill(undefined);
  const queued: number[] = [];
  let failure: unknown = null;
  let done = 0;
  const startedAt = now();
  const stats: FrameLoopStats = { renderMs: 0, readMs: 0, waitMs: 0 };

  const check = (): void => {
    if (failure !== null) throw failure;
    if (signal?.aborted) throw new ExportCancelled();
  };

  const finishOldest = async (): Promise<void> => {
    const index = queued.shift();
    if (index === undefined) return;
    const slot = index % window;
    const buffer = buffers[slot];
    if (!buffer) throw new Error("Буфер кадра не создан");
    const waitStart = now();
    await pending[slot];
    const waited = now() - waitStart;
    stats.waitMs += waited;
    profiler.add("ipcWait", waited);
    check();
    const readStart = now();
    await renderer.collect(index, buffer);
    stats.readMs += now() - readStart;
    check();
    const sendStart = now();
    pending[slot] = sink.sendFrame(index, buffer).catch((error: unknown) => {
      failure ??= error;
    });
    profiler.add("ipcSend", now() - sendStart);
    done++;
    onProgress?.({ ...progressAt(done, frameCount, (now() - startedAt) / 1000), stats: { ...stats } });
  };

  for (let index = 0; index < frameCount; index++) {
    while (queued.length >= depth) await finishOldest();
    check();
    const renderStart = now();
    renderer.submit(index, index / fps);
    stats.renderMs += now() - renderStart;
    queued.push(index);
  }
  while (queued.length > 0) await finishOldest();
  const drainStart = now();
  await Promise.all(pending);
  stats.waitMs += now() - drainStart;
  check();
  return stats;
}
