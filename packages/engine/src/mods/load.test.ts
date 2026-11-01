import { describe, expect, it, vi } from "vitest";
import { API_VERSION, defineModule, type ModApi } from "@loopviz/mod-api";
import { buildModDefinition, loadModFolder, type ModFolder, type ModLoadDeps } from "./load";
import { parseManifest } from "./manifest";

const manifestRaw = {
  id: "orb",
  name: "Orb",
  slot: "hero",
  version: "1",
  apiVersion: API_VERSION,
  entry: "index.js",
};

const api = { API_VERSION, defineModule } as unknown as ModApi;

function validEntry(api: ModApi) {
  return api.defineModule(
    { id: "orb", slot: "hero", name: "Orb", surface: "webgl", params: {} },
    () => ({ init() {}, resize() {}, render() {}, dispose() {} }),
  );
}

function deps(namespace: unknown, source = "// js"): ModLoadDeps {
  return {
    api,
    importModule: vi.fn(() => (namespace instanceof Error ? Promise.reject(namespace) : Promise.resolve(namespace))),
    readEntry: vi.fn(() => Promise.resolve(source)),
  };
}

const folder = (manifest: unknown, error: string | null = null): ModFolder => ({
  path: "/mods/orb",
  origin: "repo",
  manifest,
  error,
});

function manifest() {
  const parsed = parseManifest(manifestRaw);
  if (!parsed.ok) throw new Error("fixture manifest is invalid");
  return parsed.manifest;
}

describe("buildModDefinition", () => {
  it("returns a namespaced definition whose instances carry the namespaced id", async () => {
    const definition = await buildModDefinition(manifest(), "src", deps({ default: validEntry }));
    expect(definition.id).toBe("mod.orb");
    expect(definition.create().id).toBe("mod.orb");
  });

  it("makes create() throw for an incomplete instance", async () => {
    const entry = (a: ModApi) =>
      a.defineModule({ id: "orb", slot: "hero", name: "Orb", surface: "webgl", params: {} }, () => ({ init() {} }) as never);
    const definition = await buildModDefinition(manifest(), "src", deps({ default: entry }));
    expect(() => definition.create()).toThrow(/render/);
  });

  it("explains a missing default export", async () => {
    await expect(buildModDefinition(manifest(), "src", deps({}))).rejects.toThrow(/default/);
    await expect(buildModDefinition(manifest(), "src", deps({ default: 5 }))).rejects.toThrow(/функцию/);
  });

  it("wraps import and factory errors", async () => {
    await expect(buildModDefinition(manifest(), "src", deps(new SyntaxError("Unexpected token")))).rejects.toThrow(
      /entry не выполнился: Unexpected token/,
    );
    const throwing = () => {
      throw new Error("kaboom");
    };
    await expect(buildModDefinition(manifest(), "src", deps({ default: throwing }))).rejects.toThrow(/kaboom/);
  });

  it("rejects a definition with a mismatching id", async () => {
    const entry = (a: ModApi) =>
      a.defineModule({ id: "nope", slot: "hero", name: "Orb", surface: "webgl", params: {} }, () => ({
        init() {},
        resize() {},
        render() {},
        dispose() {},
      }));
    await expect(buildModDefinition(manifest(), "src", deps({ default: entry }))).rejects.toThrow(/id модуля/);
  });
});

describe("loadModFolder", () => {
  it("loads a good folder", async () => {
    const { result, definition } = await loadModFolder(folder(manifestRaw), deps({ default: validEntry }), new Set());
    expect(result).toMatchObject({ status: "ok", moduleId: "mod.orb", origin: "repo" });
    expect(definition?.id).toBe("mod.orb");
  });

  it("never throws: folder errors, bad manifests and read failures become FailedMod", async () => {
    const good = deps({ default: validEntry });
    const noManifest = await loadModFolder(folder(null, "manifest.json не найден"), good, new Set());
    expect(noManifest.result).toMatchObject({ status: "error", label: "orb", errors: ["manifest.json не найден"] });

    const bad = await loadModFolder(folder({ ...manifestRaw, apiVersion: 99 }), good, new Set());
    expect(bad.result).toMatchObject({ status: "error", label: "orb" });
    expect(bad.definition).toBeNull();

    const unreadable: ModLoadDeps = { ...good, readEntry: () => Promise.reject(new Error("нет файла")) };
    const missing = await loadModFolder(folder(manifestRaw), unreadable, new Set());
    expect(missing.result).toMatchObject({ status: "error", errors: ["нет файла"] });
  });

  it("reports duplicate ids", async () => {
    const { result } = await loadModFolder(folder(manifestRaw), deps({ default: validEntry }), new Set(["mod.orb"]));
    expect(result).toMatchObject({ status: "error" });
    if (result.status === "error") expect(result.errors.join(" ")).toMatch(/уже загружен/);
  });
});
