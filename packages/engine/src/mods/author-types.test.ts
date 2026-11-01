import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { API_VERSION, PARAM_KINDS, SLOT_KINDS, type FrameInput } from "@loopviz/mod-api";
import { createModApi } from "./host-api";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const dtsPath = resolve(root, "mods/loopviz-mod-api.d.ts");
const dts = readFileSync(dtsPath, "utf8");

/** Литерал с типом FrameInput: при смене типа он перестаёт компилироваться, и тест напоминает обновить d.ts. */
const sampleFrame: FrameInput = {
  t: 0,
  loopT: 0,
  beat: 0,
  bar: 0,
  bpm: 120,
  audio: { rms: 0, bands: new Float32Array(8), spectrum: new Float32Array(64), onset: 0 },
  midi: { active: [], window: [], range: [0, 127], lookbehind: 0, lookahead: 0 },
  wave: { peaks: new Float32Array(2), progress: 0, fragment: { start: 0, end: 1 } },
  theme: { bg: [0, 0, 0], ink: [0, 0, 0], accent: [0, 0, 0], accentGlow: [0, 0, 0], grain: 0, glow: 0 },
  size: { w: 1, h: 1, dpr: 1 },
};

function leafKeys(value: object, out: Set<string> = new Set()): Set<string> {
  for (const [key, child] of Object.entries(value)) {
    out.add(key);
    if (typeof child === "object" && child !== null && !ArrayBuffer.isView(child) && !Array.isArray(child)) leafKeys(child, out);
  }
  return out;
}

describe("loopviz-mod-api.d.ts", () => {
  it("declares the current API version", () => {
    expect(dts).toContain(`export declare const API_VERSION = ${API_VERSION};`);
  });

  it("mentions every slot, param kind and FrameInput field", () => {
    for (const slot of SLOT_KINDS) expect(dts).toContain(`"${slot}"`);
    for (const kind of PARAM_KINDS) expect(dts).toContain(`kind: "${kind}"`);
    for (const key of leafKeys(sampleFrame)) expect(dts, `поле ${key}`).toMatch(new RegExp(`\\b${key}\\b`));
  });

  it("declares the optional renderKey hook of a module", () => {
    expect(dts).toMatch(/renderKey\?\(frame: FrameInput, params: P\): string \| number;/);
  });

  it("declares every member of the runtime ModApi", () => {
    for (const key of Object.keys(createModApi())) expect(dts, `член api.${key}`).toMatch(new RegExp(`\\b${key}\\b`));
  });

  it("type-checks the example mods against the author types", () => {
    const files = ["example-glow-orb", "example-bars"].map((name) => resolve(root, `mods/${name}/index.js`));
    const program = ts.createProgram([dtsPath, ...files], {
      allowJs: true,
      checkJs: true,
      noEmit: true,
      strict: true,
      noImplicitAny: false,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
      types: [],
      skipLibCheck: true,
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((d) => `${d.file?.fileName ?? ""}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
    expect(diagnostics).toEqual([]);
  });
});
