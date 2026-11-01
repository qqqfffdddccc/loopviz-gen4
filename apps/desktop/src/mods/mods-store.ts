import { create } from "zustand";
import type { ModLoadResult, ModuleFailure } from "@loopviz/engine";

export type ModsStatus = "idle" | "loading" | "ready" | "unavailable";

export interface ModsState {
  status: ModsStatus;
  results: ModLoadResult[];
  /** Ошибка самого чтения списка папок (не отдельного мода). */
  listError: string | null;
  /** Растёт после каждой загрузки: превью по нему пересоздаёт модули слотов с модами. */
  version: number;
  /** Падения в рантайме по id модуля. Очищаются при перезагрузке. */
  runtimeFailures: Record<string, ModuleFailure>;
  setLoading(): void;
  setUnavailable(): void;
  setLoaded(results: ModLoadResult[], listError: string | null): void;
  reportFailure(failure: ModuleFailure): void;
}

export const useModsStore = create<ModsState>()((set) => ({
  status: "idle",
  results: [],
  listError: null,
  version: 0,
  runtimeFailures: {},
  setLoading: () => set({ status: "loading" }),
  setUnavailable: () => set({ status: "unavailable", results: [], listError: null }),
  setLoaded: (results, listError) =>
    set((s) => ({ status: "ready", results, listError, runtimeFailures: {}, version: s.version + 1 })),
  reportFailure: (failure) =>
    set((s) =>
      s.runtimeFailures[failure.moduleId] ? s : { runtimeFailures: { ...s.runtimeFailures, [failure.moduleId]: failure } },
    ),
}));
