import type { ModApi, ModManifest, ModuleDefinition, ParamValues } from "@loopviz/mod-api";
import { modModuleId, parseManifest } from "./manifest";
import { validateDefinition, validateInstance } from "./validate";

export type ModOrigin = "user" | "repo";

/** Что Rust отдаёт про папку мода: манифест как есть или причину, по которой его не удалось прочитать. */
export interface ModFolder {
  path: string;
  origin: ModOrigin;
  manifest: unknown;
  error: string | null;
}

export interface LoadedMod {
  status: "ok";
  manifest: ModManifest;
  path: string;
  origin: ModOrigin;
  moduleId: string;
}

export interface FailedMod {
  status: "error";
  /** Id из манифеста, если он прочитался, иначе имя папки. */
  label: string;
  path: string;
  origin: ModOrigin;
  errors: string[];
}

export type ModLoadResult = LoadedMod | FailedMod;

export interface ModLoadDeps {
  api: ModApi;
  /** Выполняет текст ES-модуля и возвращает его namespace. В приложении это blob URL и import(). */
  importModule(source: string): Promise<unknown>;
  readEntry(modPath: string, relPath: string): Promise<string>;
}

type Definition = ModuleDefinition<ParamValues>;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function folderLabel(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function defaultExport(namespace: unknown): unknown {
  return typeof namespace === "object" && namespace !== null && "default" in namespace ? namespace.default : undefined;
}

/** Оборачивает определение мода: id получает префикс, а каждый экземпляр проверяется на полноту. */
function namespaced(definition: Definition): Definition {
  const id = modModuleId(definition.id);
  return {
    id,
    slot: definition.slot,
    name: definition.name,
    surface: definition.surface,
    params: definition.params,
    create: () => {
      const instance: unknown = definition.create();
      const problems = validateInstance(instance);
      if (problems.length > 0) throw new Error(problems.join("; "));
      return { ...(instance as ReturnType<Definition["create"]>), id };
    },
  };
}

/** Выполняет entry, вызывает default(api) и проверяет результат. Бросает Error с понятным текстом. */
export async function buildModDefinition(manifest: ModManifest, source: string, deps: ModLoadDeps): Promise<Definition> {
  let namespace: unknown;
  try {
    namespace = await deps.importModule(source);
  } catch (error) {
    throw new Error(`entry не выполнился: ${messageOf(error)}`, { cause: error });
  }
  const factory = defaultExport(namespace);
  if (typeof factory !== "function") {
    throw new Error("entry должен экспортировать по умолчанию функцию: export default function (api) { ... }");
  }
  let definition: unknown;
  try {
    definition = await (factory as (api: ModApi) => unknown)(deps.api);
  } catch (error) {
    throw new Error(`default(api) бросил ошибку: ${messageOf(error)}`, { cause: error });
  }
  const problems = validateDefinition(definition, manifest);
  if (problems.length > 0) throw new Error(problems.join("; "));
  return namespaced(definition as Definition);
}

/**
 * Загружает одну папку мода и никогда не бросает: любая беда становится FailedMod.
 * `taken` хранит id модулей, уже занятых в этом проходе или в реестре.
 */
export async function loadModFolder(
  folder: ModFolder,
  deps: ModLoadDeps,
  taken: ReadonlySet<string>,
): Promise<{ result: ModLoadResult; definition: Definition | null }> {
  const fail = (label: string, errors: string[]) => ({
    result: { status: "error", label, path: folder.path, origin: folder.origin, errors } satisfies FailedMod,
    definition: null,
  });
  const fallback = folderLabel(folder.path);
  if (folder.error !== null) return fail(fallback, [folder.error]);

  const parsed = parseManifest(folder.manifest);
  if (!parsed.ok) {
    const id = (folder.manifest as { id?: unknown } | null)?.id;
    return fail(typeof id === "string" ? id : fallback, parsed.errors);
  }
  const { manifest } = parsed;
  const moduleId = modModuleId(manifest.id);
  if (taken.has(moduleId)) return fail(manifest.id, [`мод с id «${manifest.id}» уже загружен из другой папки`]);

  try {
    const source = await deps.readEntry(folder.path, manifest.entry);
    const definition = await buildModDefinition(manifest, source, deps);
    return {
      result: { status: "ok", manifest, path: folder.path, origin: folder.origin, moduleId },
      definition,
    };
  } catch (error) {
    return fail(manifest.id, [messageOf(error)]);
  }
}
