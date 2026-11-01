import { describe, expect, it } from "vitest";
import type { ParamSchema, ParamValues } from "@loopviz/mod-api";
import { reconcileParams } from "./sync-params";

const schema: ParamSchema<ParamValues> = {
  size: { kind: "slider", label: "A", min: 0, max: 1, step: 0.1, default: 0.5 },
  on: { kind: "toggle", label: "B", default: true },
  tint: { kind: "color", label: "C", default: "#112233" },
};

describe("reconcileParams", () => {
  it("fills missing params with defaults", () => {
    expect(reconcileParams(schema, undefined)).toEqual({ size: 0.5, on: true, tint: "#112233" });
    expect(reconcileParams(schema, { size: 0.9 })).toEqual({ size: 0.9, on: true, tint: "#112233" });
  });

  it("drops unknown keys and values of the wrong type, clamps sliders", () => {
    const result = reconcileParams(schema, { size: 7, on: "yes", tint: "#ffffff", gone: 1 });
    expect(result).toEqual({ size: 1, on: true, tint: "#ffffff" });
  });

  it("returns the same object when nothing changes", () => {
    const current = { size: 0.2, on: false, tint: "#000000" };
    expect(reconcileParams(schema, current)).toBe(current);
  });
});
