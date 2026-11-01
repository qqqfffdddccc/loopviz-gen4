import { describe, expect, it } from "vitest";
import type { Theme } from "@loopviz/mod-api";
import { drawPlaceholder, fitText, placeholderLabel, type PlaceholderContext } from "./placeholder";

const theme: Theme = {
  bg: [1, 1, 1],
  ink: [0.1, 0.1, 0.1],
  accent: [1, 0, 0],
  accentGlow: [1, 0.5, 0.5],
  grain: 0,
  glow: 0,
};

function recordingContext() {
  const calls: { text?: [string, number, number]; rect?: number[] } = {};
  const ctx = {
    lineWidth: 0,
    strokeStyle: "",
    fillStyle: "",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    strokeRect: (...args: number[]) => {
      calls.rect = args;
    },
    fillText: (text: string, x: number, y: number) => {
      calls.text = [text, x, y];
    },
    measureText: (text: string) => ({ width: text.length * 8 }),
  } as unknown as PlaceholderContext;
  return { ctx, calls };
}

describe("placeholder", () => {
  it("builds the label with the module name", () => {
    expect(placeholderLabel("Glow Orb")).toBe("МОДУЛЬ УПАЛ: Glow Orb");
  });

  it("keeps short text and truncates long text with an ellipsis", () => {
    const measure = (text: string) => text.length * 10;
    expect(fitText(measure, "abc", 100)).toBe("abc");
    const fitted = fitText(measure, "abcdefghijklmnop", 80);
    expect(fitted.endsWith("…")).toBe(true);
    expect(measure(fitted)).toBeLessThanOrEqual(80);
  });

  it("draws a hairline frame and a low-alpha centered label", () => {
    const { ctx, calls } = recordingContext();
    drawPlaceholder(ctx, { w: 400, h: 200, frameHeight: 1920 }, theme, "Orb");
    expect(calls.text).toEqual(["МОДУЛЬ УПАЛ: Orb", 200, 100]);
    expect(calls.rect).toBeDefined();
    expect(ctx.lineWidth).toBeLessThanOrEqual(1.5);
    expect(ctx.fillStyle).toMatch(/^rgba\(.+, 0\.\d+\)$/);
    expect(ctx.textAlign).toBe("center");
  });
});
