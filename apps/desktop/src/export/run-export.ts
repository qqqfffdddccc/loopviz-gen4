import {
  ExportCancelled,
  buildExportAudio,
  encodeWav,
  exportFrameCount,
  exportSize,
  frameByteLength,
  inFlightWindow,
  resolveReadbackFormat,
  runFrameLoop,
  totalDuration,
  type ExportCodec,
  type ExportFps,
  type ExportProgress,
  type ExportResolution,
  type ReadbackFormat,
  type StageProfiler,
} from "@loopviz/engine";
import { getAudioBuffer } from "../runtime/source-data";
import { useSourceStore } from "../state/source-store";
import { useExportStore, type ExportResult } from "./export-store";
import { errorMessage, exportBegin, exportCancel, exportFinish, exportFrame, writeTempWav } from "./ipc";
import { previewGate } from "./preview-gate";
import { createRenderSession } from "./render-session";

export interface ExportRequest {
  resolution: ExportResolution;
  fps: ExportFps;
  codec: ExportCodec;
  outputPath: string;
  /** Формат кадров от GPU к ffmpeg. По умолчанию yuv420p; rgba нужен как запасной путь и для сверки. */
  pixelFormat?: ReadbackFormat;
  profiler?: StageProfiler;
  /** Видит байты кадра перед отправкой в ffmpeg; буфер потом переиспользуется, поэтому копировать нужно сразу. */
  frameTap?: (index: number, bytes: Uint8Array) => void;
  onProgress?: (progress: ExportProgress) => void;
}

const PROGRESS_INTERVAL_MS = 120;

let controller: AbortController | null = null;

export function cancelExport(): void {
  controller?.abort();
}

function collectAudio(): { wav: Uint8Array; total: number } {
  const buffer = getAudioBuffer();
  if (!buffer) throw new Error("Загрузите аудио: экспорту нужна звуковая дорожка");
  const { timeline } = useSourceStore.getState();
  const total = totalDuration(timeline);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const audio = buildExportAudio({
    channels,
    sampleRate: buffer.sampleRate,
    startSec: timeline.fragment.startSec,
    endSec: timeline.fragment.endSec,
    totalSec: total,
  });
  return { wav: encodeWav(audio, buffer.sampleRate, "pcm16"), total };
}

async function execute(request: ExportRequest, signal: AbortSignal): Promise<ExportResult> {
  const store = useExportStore.getState();
  const startedAt = performance.now();
  const size = exportSize(request.resolution);
  const { wav, total } = collectAudio();
  const frameCount = exportFrameCount(total, request.fps);
  if (frameCount <= 0) throw new Error("Нулевая длительность ролика");

  const pixelFormat = resolveReadbackFormat(request.pixelFormat ?? "yuv420p", size);
  const session = await createRenderSession(size, pixelFormat, request.profiler);
  try {
    const audioPath = await writeTempWav(wav);
    await exportBegin({
      width: size.width,
      height: size.height,
      fps: request.fps,
      codec: request.codec,
      pixelFormat,
      audioPath,
      outputPath: request.outputPath,
    });
    store.setPhase("running");

    let lastReport = 0;
    const frameBytes = frameByteLength(size, pixelFormat);
    await runFrameLoop({
      frameCount,
      fps: request.fps,
      frameBytes,
      window: inFlightWindow(frameBytes),
      renderer: session.renderer,
      sink: {
        sendFrame: (index, bytes) => {
          request.frameTap?.(index, bytes);
          return exportFrame(index, bytes);
        },
      },
      signal,
      profiler: request.profiler,
      onProgress: (progress) => {
        request.onProgress?.(progress);
        const now = performance.now();
        if (progress.frame < frameCount && now - lastReport < PROGRESS_INTERVAL_MS) return;
        lastReport = now;
        store.setProgress(progress);
      },
    });
    store.setPhase("finishing");
    const info = await exportFinish();
    return { path: info.path, encoder: info.encoder, seconds: (performance.now() - startedAt) / 1000 };
  } finally {
    session.dispose();
  }
}

/** Один экспорт за раз. Результат и ошибки кладутся в стор, наружу возвращается итог или бросается ошибка. */
export async function runExport(request: ExportRequest): Promise<ExportResult> {
  if (controller) throw new Error("Экспорт уже идёт");
  const current = new AbortController();
  controller = current;
  const store = useExportStore.getState();
  store.begin();
  previewGate.paused = true;
  try {
    const result = await execute(request, current.signal);
    store.finish(result);
    return result;
  } catch (error) {
    await exportCancel().catch(() => undefined);
    if (error instanceof ExportCancelled) {
      store.cancelled();
    } else {
      store.fail(errorMessage(error));
    }
    throw error;
  } finally {
    previewGate.paused = false;
    controller = null;
  }
}
