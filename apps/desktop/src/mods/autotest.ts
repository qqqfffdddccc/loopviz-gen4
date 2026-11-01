import { Compositor, type ModuleFailure } from "@loopviz/engine";
import type { FrameInput, SlotKind } from "@loopviz/mod-api";
import { errorMessage, isTauri } from "../export/ipc";
import { createFrameSource } from "../runtime/frame-source";
import { registry } from "../runtime/registry";
import { ALL_SLOTS } from "../state/slots";
import { activeParams, useAppStore } from "../state/store";
import { modsAutotestEnabled, modsAutotestExit, modsAutotestLog } from "./ipc";
import { loadMods } from "./loader";
import { useModsStore } from "./mods-store";

const HERO_MOD = "mod.example-glow-orb";
const WAVE_MOD = "mod.example-bars";
const SIZE = { w: 270, h: 480, dpr: 1 };
const FRAMES = 6;
const FRAME_DT = 1 / 60;
const PREVIEW_SETTLE_MS = 1500;

type Log = (message: string) => void;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Кадр со звуком: иначе реакция модов на rms и onset осталась бы непроверенной. */
function withSignal(frame: FrameInput, k: number): FrameInput {
  const bands = Float32Array.from({ length: 8 }, (_, i) => 0.3 + 0.05 * i + 0.2 * k);
  return { ...frame, audio: { ...frame.audio, rms: 0.4 + 0.4 * k, onset: k > 0.5 ? 1 : 0, bands } };
}

function createHarness() {
  const compositor = new Compositor(document.createElement("canvas"));
  const failures: ModuleFailure[] = [];
  compositor.setFailureHandling({ onFailure: (failure) => failures.push(failure) });
  compositor.setSize(SIZE.w, SIZE.h);
  const app = useAppStore.getState();
  compositor.setLayout(app.layout);
  compositor.setPostSettings(app.post);
  const buildFrame = createFrameSource();
  const frameAt = (index: number): FrameInput =>
    withSignal(buildFrame(index * FRAME_DT, SIZE), index / (FRAMES - 1));
  return { compositor, failures, frameAt };
}

function pixelsAt(compositor: Compositor, frame: FrameInput): Uint8Array {
  const target = compositor.renderFrameToTarget(frame, { width: SIZE.w, height: SIZE.h });
  const pixels = new Uint8Array(SIZE.w * SIZE.h * 4);
  compositor.renderer.readRenderTargetPixels(target, 0, 0, SIZE.w, SIZE.h, pixels);
  return pixels;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Каждый загруженный мод по очереди в своём слоте, с обычной политикой: падение даёт заглушку и запись. */
async function smokeRenderEach(log: Log): Promise<Set<string>> {
  const { compositor, failures, frameAt } = createHarness();
  const broken = new Set<string>();
  try {
    for (const result of useModsStore.getState().results) {
      if (result.status !== "ok") continue;
      const slot: SlotKind = result.manifest.slot;
      failures.length = 0;
      try {
        await compositor.setModule(slot, registry.get(result.moduleId) ?? null);
        for (let i = 0; i < FRAMES; i++) compositor.renderFrame(frameAt(i));
      } catch (error) {
        failures.push({ moduleId: result.moduleId, moduleName: result.manifest.name, stage: "render", message: errorMessage(error) });
      }
      const failure = failures[0];
      if (failure) {
        broken.add(result.manifest.id);
        const withPlaceholder = pixelsAt(compositor, frameAt(0));
        await compositor.setModule(slot, null);
        const drawn = !sameBytes(withPlaceholder, pixelsAt(compositor, frameAt(0)));
        log(
          `${result.manifest.id}: ОШИБКА ${failure.stage}: ${failure.message} (${drawn ? "слот показал заглушку" : "заглушка не видна"})`,
        );
      } else {
        log(`${result.manifest.id}: ok (${slot}, v${result.manifest.version}, ${result.origin})`);
      }
      await compositor.setModule(slot, null);
    }
  } finally {
    compositor.dispose();
  }
  return broken;
}

/** Выбранные примеры в строгом режиме экспорта: любой сбой бросает, а повтор кадра даёт те же байты. */
async function renderSelected(log: Log): Promise<void> {
  const { compositor, frameAt } = createHarness();
  compositor.setFailureHandling({ failFast: true });
  try {
    const app = useAppStore.getState();
    for (const slot of ALL_SLOTS) {
      const id = app.moduleIds[slot];
      await compositor.setModule(slot, id ? (registry.get(id) ?? null) : null);
      compositor.setParams(slot, activeParams(app, slot));
    }
    for (let i = 0; i < FRAMES; i++) compositor.renderFrame(frameAt(i));
    log(`${FRAMES} кадров превью в строгом режиме без ошибок`);
    const first = pixelsAt(compositor, frameAt(3));
    pixelsAt(compositor, frameAt(5));
    const again = pixelsAt(compositor, frameAt(3));
    if (!sameBytes(first, again)) throw new Error("повтор кадра дал другие пиксели: рендер не детерминирован");
    log("повтор кадра побайтно совпал: рендер детерминирован");
  } finally {
    compositor.dispose();
  }
}

/** Только dev-сборка и только если Rust увидел LOOPVIZ_AUTOTEST_MODS=1. */
export async function maybeRunModsAutotest(): Promise<void> {
  if (!import.meta.env.DEV || !isTauri()) return;
  if (!(await modsAutotestEnabled().catch(() => false))) return;
  const log: Log = (message) => void modsAutotestLog(message).catch(() => undefined);

  try {
    await loadMods();
    const { results, listError } = useModsStore.getState();
    const problems: string[] = [];
    if (listError) problems.push(`список модов: ${listError}`);
    for (const result of results) {
      if (result.status === "error") {
        problems.push(`${result.label}: ${result.errors.join("; ")}`);
        log(`${result.label}: ОШИБКА загрузки ${result.errors.join("; ")}`);
      }
    }
    log(`найдено папок: ${results.length}, загружено: ${results.filter((r) => r.status === "ok").length}`);
    for (const required of [HERO_MOD, WAVE_MOD]) {
      if (!registry.get(required)) problems.push(`не загружен ${required}`);
    }
    for (const id of await smokeRenderEach(log)) problems.push(`${id}: упал при рендере`);

    if (registry.get(HERO_MOD) && registry.get(WAVE_MOD)) {
      const app = useAppStore.getState();
      app.setModule("hero", HERO_MOD);
      app.setModule("wave", WAVE_MOD);
      log(`выбраны ${HERO_MOD} (hero) и ${WAVE_MOD} (wave)`);
      await renderSelected(log).catch((error: unknown) => problems.push(errorMessage(error)));
      await sleep(PREVIEW_SETTLE_MS);
      const live = useModsStore.getState().runtimeFailures;
      for (const id of [HERO_MOD, WAVE_MOD]) {
        const failure = live[id];
        if (failure) problems.push(`превью ${id}: ${failure.stage}: ${failure.message}`);
      }
      if (!live[HERO_MOD] && !live[WAVE_MOD]) log("живое превью работает с выбранными модами без ошибок");
    }

    if (problems.length > 0) throw new Error(problems.join(" | "));
    log("ГОТОВО");
    await modsAutotestExit(0);
  } catch (error) {
    log(`ОШИБКА ${errorMessage(error)}`);
    await modsAutotestExit(1).catch(() => undefined);
  }
}
