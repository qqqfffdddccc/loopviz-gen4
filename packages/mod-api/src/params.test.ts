import { describe, expect, it } from "vitest";
import { defaultParams, type ParamSchema } from "./params";

describe("defaultParams", () => {
  it("collects defaults of every param kind", () => {
    type P = { speed: number; tint: string; mode: string; glow: boolean; font: string; title: string };
    const schema: ParamSchema<P> = {
      speed: { kind: "slider", label: "Скорость", min: 0, max: 2, step: 0.1, default: 1 },
      tint: { kind: "color", label: "Цвет", default: "#ff5a28" },
      mode: { kind: "select", label: "Режим", options: ["a", "b"], default: "b" },
      glow: { kind: "toggle", label: "Свечение", default: true },
      font: { kind: "font", label: "Шрифт", default: "JetBrains Mono" },
      title: { kind: "text", label: "Заголовок", default: "LOOPVIZ" },
    };

    expect(defaultParams(schema)).toEqual({
      speed: 1,
      tint: "#ff5a28",
      mode: "b",
      glow: true,
      font: "JetBrains Mono",
      title: "LOOPVIZ",
    });
  });

  it("returns an empty object for an empty schema", () => {
    expect(defaultParams({})).toEqual({});
  });
});
