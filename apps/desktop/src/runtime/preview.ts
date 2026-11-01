import { Compositor, createIdleFrame } from "@loopviz/engine";
import type { SlotKind } from "@loopviz/mod-api";
import { ALL_SLOTS } from "../state/slots";
import { useAppStore, type AppState } from "../state/store";
import { registry } from "./registry";

export interface PreviewHandle {
  setSize(width: number, height: number, dpr: number): void;
  stop(): void;
}

/** Превью живёт вне React: цикл читает стор через getState(), поэтому компоненты не перерисовываются на каждом кадре. */
export function startPreview(canvas: HTMLCanvasElement): PreviewHandle {
  const compositor = new Compositor(canvas);
  const applied: Record<SlotKind, string | null | undefined> = {
    hero: undefined,
    midi: undefined,
    wave: undefined,
    overlay: undefined,
  };
  let size = { width: 1, height: 1, dpr: 1 };
  let frameId = 0;
  const startedAt = performance.now();

  const syncModules = (state: AppState): void => {
    for (const slot of ALL_SLOTS) {
      const id = state.moduleIds[slot];
      if (applied[slot] === id) continue;
      applied[slot] = id;
      const module = id ? (registry.get(id) ?? null) : null;
      compositor.setModule(slot, module).catch((error: unknown) => {
        console.error(`Не удалось подключить модуль слота ${slot}`, error);
      });
    }
  };

  const tick = (): void => {
    const state = useAppStore.getState();
    compositor.setLayout(state.layout);
    compositor.setGap(state.gap * size.dpr);
    for (const slot of ALL_SLOTS) compositor.setParams(slot, state.params[slot]);
    const t = (performance.now() - startedAt) / 1000;
    compositor.renderFrame(createIdleFrame({ t, width: size.width, height: size.height, dpr: size.dpr }));
    frameId = requestAnimationFrame(tick);
  };

  syncModules(useAppStore.getState());
  const unsubscribe = useAppStore.subscribe(syncModules);
  frameId = requestAnimationFrame(tick);

  return {
    setSize(width, height, dpr) {
      size = { width, height, dpr };
      compositor.setSize(width, height);
    },
    stop() {
      cancelAnimationFrame(frameId);
      unsubscribe();
      compositor.dispose();
    },
  };
}
