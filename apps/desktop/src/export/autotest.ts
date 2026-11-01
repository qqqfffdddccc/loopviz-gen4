import { ExportCancelled, StageProfiler, totalDuration } from "@loopviz/engine";
import { importAudioFile, importMidiFile } from "../runtime/importers";
import { useSourceStore } from "../state/source-store";
import { errorMessage, autotestConfig, autotestExit, autotestLog, autotestReadFixture, isTauri } from "./ipc";
import { cancelExport, runExport } from "./run-export";

const AUTOTEST_FPS = 60;
const LOOP_SECONDS = 8;
const LOG_EVERY_FRAMES = 60;
const CHECKSUM_FRAMES = new Set([0, 1, 59, 300, 600, 959]);

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest.subarray(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Только dev-сборка и только если Rust увидел LOOPVIZ_AUTOTEST_EXPORT: иначе autotestConfig вернёт null. */
export async function maybeRunAutotest(): Promise<void> {
  if (!import.meta.env.DEV || !isTauri()) return;
  const config = await autotestConfig().catch(() => null);
  if (config?.mode !== "export") return;
  const log = (message: string): void => void autotestLog(message).catch(() => undefined);

  try {
    log(`старт, разрешение ${config.resolution}, формат ${config.pixelFormat}`);
    const midi = await autotestReadFixture("test-loop.mid");
    await importMidiFile(new File([midi], "test-loop.mid"));
    const wav = await autotestReadFixture("test-loop.wav");
    await importAudioFile(new File([wav], "test-loop.wav"));

    const source = useSourceStore.getState();
    source.setFragment({ startSec: 0, endSec: LOOP_SECONDS });
    source.setDuration({ mode: "repeats", repeats: 2 });
    const { timeline } = useSourceStore.getState();
    log(`фрагмент ${timeline.fragment.startSec}..${timeline.fragment.endSec} с, bpm ${timeline.bpm}, итого ${totalDuration(timeline)} с`);

    const outputPath = `/tmp/loopviz-autotest-${config.resolution === "4k" ? "4k" : "1080"}.mp4`;
    const profiler = new StageProfiler(true);
    const checksums: Promise<string>[] = [];
    const started = performance.now();
    const result = await runExport({
      resolution: config.resolution,
      fps: AUTOTEST_FPS,
      codec: "h264",
      pixelFormat: config.pixelFormat,
      outputPath,
      profiler,
      frameTap: (index, bytes) => {
        // Буфер уходит в кольцо сразу после sink, поэтому копия нужна до асинхронного digest.
        if (CHECKSUM_FRAMES.has(index)) checksums.push(sha256(bytes.slice().buffer).then((hash) => `кадр ${index} sha256 ${hash}`));
      },
      onProgress: (p) => {
        if (config.cancelAfter !== null && p.frame === config.cancelAfter) cancelExport();
        if (p.frame % LOG_EVERY_FRAMES === 0 || p.frame === p.frameCount) {
          log(`кадр ${p.frame}/${p.frameCount} ${p.renderFps.toFixed(1)} к/с, осталось ${p.etaSec.toFixed(0)} с`);
          log(`  рендер ${p.stats?.renderMs.toFixed(0)} мс, ожидание записи ${p.stats?.waitMs.toFixed(0)} мс`);
        }
      },
    });
    if (config.cancelAfter !== null) throw new Error("экспорт дошёл до конца, хотя его отменяли");
    for (const line of profiler.report()) log(`  стадия ${line}`);
    for (const line of await Promise.all(checksums)) log(`  вход ffmpeg ${line}`);
    log(`ГОТОВО ${result.path} энкодер ${result.encoder} за ${((performance.now() - started) / 1000).toFixed(1)} с`);
    await autotestExit(0);
  } catch (error) {
    if (error instanceof ExportCancelled && config.cancelAfter !== null) {
      log(`ОТМЕНА ok после ${config.cancelAfter} кадров`);
      await autotestExit(0).catch(() => undefined);
      return;
    }
    log(`ОШИБКА ${errorMessage(error)}`);
    await autotestExit(1).catch(() => undefined);
  }
}
