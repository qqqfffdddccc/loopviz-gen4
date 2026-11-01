import { createModApi, describeError, loadModFolder, type ModLoadDeps, type ModLoadResult } from "@loopviz/engine";
import { isTauri } from "../export/ipc";
import { registry } from "../runtime/registry";
import { ALL_SLOTS } from "../state/slots";
import { useAppStore } from "../state/store";
import { importModuleSource } from "./import-module";
import { listMods, readModFile } from "./ipc";
import { useModsStore } from "./mods-store";
import { reconcileParams } from "./sync-params";

const registered = new Set<string>();
let running: Promise<void> | null = null;

const deps: ModLoadDeps = {
  api: createModApi(),
  importModule: importModuleSource,
  readEntry: readModFile,
};

/** Подгоняет значения параметров выбранных модов под схему только что загруженной версии. */
function reconcileSelectedParams(): void {
  useAppStore.setState((state) => {
    let changed = false;
    const moduleParams = { ...state.moduleParams };
    for (const slot of ALL_SLOTS) {
      const id = state.moduleIds[slot];
      const definition = id ? registry.get(id) : undefined;
      if (!id || !definition || !registered.has(id)) continue;
      const current = state.moduleParams[slot][id];
      const next = reconcileParams(definition.params, current);
      if (next === current) continue;
      changed = true;
      moduleParams[slot] = { ...state.moduleParams[slot], [id]: next };
    }
    return changed ? { moduleParams } : {};
  });
}

async function loadAll(): Promise<void> {
  const mods = useModsStore.getState();
  if (!isTauri()) {
    mods.setUnavailable();
    return;
  }
  mods.setLoading();
  for (const id of registered) registry.unregister(id);
  registered.clear();

  const results: ModLoadResult[] = [];
  let listError: string | null = null;
  try {
    const folders = await listMods();
    for (const folder of folders) {
      const { result, definition } = await loadModFolder(folder, deps, registered);
      if (definition && result.status === "ok") {
        try {
          registry.register(definition);
          registered.add(definition.id);
          results.push(result);
        } catch (error) {
          results.push({
            status: "error",
            label: result.manifest.id,
            path: result.path,
            origin: result.origin,
            errors: [describeError(error)],
          });
        }
      } else {
        results.push(result);
      }
    }
  } catch (error) {
    listError = describeError(error);
  }
  reconcileSelectedParams();
  useModsStore.getState().setLoaded(results, listError);
}

/** Загружает (или перезагружает) моды. Параллельные вызовы встают в очередь и не пересекаются. */
export function loadMods(): Promise<void> {
  const previous = running ?? Promise.resolve();
  const next = previous.then(loadAll);
  running = next.catch(() => undefined);
  return next;
}
