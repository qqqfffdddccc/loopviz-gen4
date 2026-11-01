import { describe, expect, it } from "vitest";
import { API_VERSION } from "@loopviz/mod-api";
import { isModModuleId, isSafeRelativePath, modModuleId, parseManifest } from "./manifest";

const valid = {
  id: "example-orb",
  name: "Example Orb",
  slot: "hero",
  version: "1.0.0",
  apiVersion: API_VERSION,
  entry: "index.js",
};

function errorsOf(raw: unknown): string[] {
  const result = parseManifest(raw);
  return result.ok ? [] : result.errors;
}

describe("parseManifest", () => {
  it("accepts a valid manifest with optional fields", () => {
    const result = parseManifest({ ...valid, author: "me", description: "text", extra: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest).toEqual({ ...valid, author: "me", description: "text" });
    }
  });

  it("rejects non-objects", () => {
    expect(errorsOf(null)).toHaveLength(1);
    expect(errorsOf([])).toHaveLength(1);
    expect(errorsOf("x")).toHaveLength(1);
  });

  it.each(["Example", "a", "-lead", "has space", "под", "a".repeat(49), "dot.id", "../up"])("rejects id %j", (id) => {
    expect(errorsOf({ ...valid, id }).join(" ")).toMatch(/id/);
  });

  it("rejects an unknown slot", () => {
    expect(errorsOf({ ...valid, slot: "background" }).join(" ")).toMatch(/slot/);
  });

  it("explains an incompatible apiVersion", () => {
    const message = errorsOf({ ...valid, apiVersion: API_VERSION + 1 }).join(" ");
    expect(message).toContain(`v${API_VERSION + 1}`);
    expect(message).toContain(`v${API_VERSION}`);
    expect(message).toMatch(/несовместим/);
  });

  it("rejects a non-integer apiVersion and missing fields, reporting every problem", () => {
    const errors = errorsOf({ id: "ok-id", apiVersion: "1" });
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });

  it.each(["../evil.js", "/abs/entry.js", "sub/../x.js", "entry.ts", "a\\b.js", "", "dir//x.js"])(
    "rejects entry %j",
    (entry) => {
      expect(errorsOf({ ...valid, entry }).join(" ")).toMatch(/entry/);
    },
  );

  it("accepts nested entry paths and .mjs", () => {
    expect(parseManifest({ ...valid, entry: "dist/main.mjs" }).ok).toBe(true);
  });
});

describe("module ids", () => {
  it("namespaces ids so they cannot clash with builtin ones", () => {
    expect(modModuleId("orb")).toBe("mod.orb");
    expect(isModModuleId("mod.orb")).toBe(true);
    expect(isModModuleId("builtin.hero.orb")).toBe(false);
  });

  it("checks relative paths", () => {
    expect(isSafeRelativePath("a/b.js")).toBe(true);
    expect(isSafeRelativePath("../b.js")).toBe(false);
    expect(isSafeRelativePath(".")).toBe(false);
  });
});
