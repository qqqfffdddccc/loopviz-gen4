import { describe, expect, it } from "vitest";
import { API_VERSION, defineModule, type ModManifest } from "@loopviz/mod-api";
import { validateDefinition, validateInstance, validateParamSchema } from "./validate";

const manifest: ModManifest = {
  id: "orb",
  name: "Orb",
  slot: "hero",
  version: "1",
  apiVersion: API_VERSION,
  entry: "index.js",
};

const slider = { kind: "slider", label: "A", min: 0, max: 1, step: 0.1, default: 0.5 };

function definition(overrides: Record<string, unknown> = {}) {
  return {
    ...defineModule({ id: "orb", slot: "hero", name: "Orb", surface: "webgl", params: {} }, () => ({
      init() {},
      resize() {},
      render() {},
      dispose() {},
    })),
    ...overrides,
  };
}

describe("validateParamSchema", () => {
  it("accepts every kind", () => {
    const schema = {
      a: slider,
      b: { kind: "color", label: "B", default: "#a1B2c3" },
      c: { kind: "select", label: "C", options: ["x", "y"], default: "y" },
      d: { kind: "toggle", label: "D", default: false },
      e: { kind: "font", label: "E", default: "JetBrains Mono" },
      f: { kind: "text", label: "F", default: "" },
      g: { kind: "image", label: "G", default: "" },
    };
    expect(validateParamSchema(schema)).toEqual([]);
  });

  it.each([
    ["not an object", null],
    ["unknown kind", { a: { kind: "knob", label: "A", default: 1 } }],
    ["missing label", { a: { ...slider, label: "" } }],
    ["bad key", { "1bad": slider }],
    ["min >= max", { a: { ...slider, min: 1, max: 1, default: 1 } }],
    ["zero step", { a: { ...slider, step: 0 } }],
    ["default out of range", { a: { ...slider, default: 2 } }],
    ["NaN default", { a: { ...slider, default: Number.NaN } }],
    ["bad color", { a: { kind: "color", label: "A", default: "red" } }],
    ["empty options", { a: { kind: "select", label: "A", options: [], default: "" } }],
    ["default not in options", { a: { kind: "select", label: "A", options: ["x"], default: "y" } }],
    ["toggle default", { a: { kind: "toggle", label: "A", default: 1 } }],
    ["text default", { a: { kind: "text", label: "A", default: 1 } }],
  ])("rejects %s", (_name, schema) => {
    expect(validateParamSchema(schema).length).toBeGreaterThan(0);
  });

  it("limits the number of params", () => {
    const schema = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`p${i}`, slider]));
    expect(validateParamSchema(schema).join(" ")).toMatch(/не больше/);
  });
});

describe("validateDefinition", () => {
  it("accepts a defineModule result matching the manifest", () => {
    expect(validateDefinition(definition(), manifest)).toEqual([]);
  });

  it("rejects an id that differs from the manifest", () => {
    expect(validateDefinition(definition({ id: "other" }), manifest).join(" ")).toMatch(/id модуля/);
  });

  it("rejects a slot that differs from the manifest", () => {
    expect(validateDefinition(definition({ slot: "wave" }), manifest).join(" ")).toMatch(/slot модуля/);
  });

  it("rejects a bad surface, missing create and broken params", () => {
    expect(validateDefinition(definition({ surface: "svg" }), manifest).join(" ")).toMatch(/surface/);
    expect(validateDefinition(definition({ create: undefined }), manifest).join(" ")).toMatch(/create/);
    expect(validateDefinition(definition({ params: { a: { kind: "x" } } }), manifest).join(" ")).toMatch(/params\.a/);
  });

  it("rejects non-objects", () => {
    expect(validateDefinition(undefined, manifest)).toHaveLength(1);
  });
});

describe("validateInstance", () => {
  it("requires all four lifecycle methods", () => {
    expect(validateInstance({ init() {}, resize() {}, render() {}, dispose() {} })).toEqual([]);
    expect(validateInstance({ init() {} })).toHaveLength(3);
    expect(validateInstance(null)).toHaveLength(1);
  });
});
