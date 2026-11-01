import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, computeSlotRects, ratioOf, withHidden, withRatio, type Layout } from "./layout";

const layout = (over: Partial<Layout> = {}): Layout => ({ ...DEFAULT_LAYOUT, ...over });

describe("computeSlotRects", () => {
  it("splits height by ratios without gap", () => {
    const rects = computeSlotRects(layout(), 1080, 1000, 0);
    expect(rects.map((r) => [r.slot, r.y, r.h])).toEqual([
      ["hero", 0, 500],
      ["midi", 500, 300],
      ["wave", 800, 200],
    ]);
    expect(rects.every((r) => r.x === 0 && r.w === 1080)).toBe(true);
  });

  it("renormalizes ratios over visible zones when a zone is hidden", () => {
    const rects = computeSlotRects(layout({ hidden: ["midi"] }), 100, 700, 0);
    expect(rects.map((r) => r.slot)).toEqual(["hero", "wave"]);
    expect(rects.map((r) => r.h)).toEqual([500, 200]);
  });

  it("normalizes ratios that do not sum to one", () => {
    const rects = computeSlotRects(layout({ ratios: [2, 1, 1] }), 100, 400, 0);
    expect(rects.map((r) => r.h)).toEqual([200, 100, 100]);
  });

  it("puts gaps only between visible zones and keeps the full height", () => {
    const rects = computeSlotRects(layout(), 100, 1000, 20);
    const [hero, midi, wave] = rects;
    expect(hero?.h).toBe(480);
    expect(midi?.y).toBe(500);
    expect(midi?.y).toBe((hero?.y ?? 0) + (hero?.h ?? 0) + 20);
    expect(wave?.y).toBe((midi?.y ?? 0) + (midi?.h ?? 0) + 20);
    expect((wave?.y ?? 0) + (wave?.h ?? 0)).toBe(1000);
  });

  it("returns a single full-height rect for one visible zone", () => {
    const rects = computeSlotRects(layout({ hidden: ["hero", "midi"] }), 100, 300, 20);
    expect(rects).toEqual([{ slot: "wave", x: 0, y: 0, w: 100, h: 300 }]);
  });

  it("returns nothing when every zone is hidden", () => {
    expect(computeSlotRects(layout({ hidden: ["hero", "midi", "wave"] }), 100, 300, 10)).toEqual([]);
  });

  it("falls back to equal shares when all ratios are zero", () => {
    const rects = computeSlotRects(layout({ ratios: [0, 0, 0] }), 100, 300, 0);
    expect(rects.map((r) => r.h)).toEqual([100, 100, 100]);
  });

  it("respects a custom order", () => {
    const rects = computeSlotRects(layout({ order: ["wave", "hero", "midi"], ratios: [0.2, 0.5, 0.3] }), 100, 1000, 0);
    expect(rects.map((r) => [r.slot, r.h])).toEqual([
      ["wave", 200],
      ["hero", 500],
      ["midi", 300],
    ]);
  });
});

describe("layout helpers", () => {
  it("withHidden toggles a zone without duplicates", () => {
    const hidden = withHidden(withHidden(DEFAULT_LAYOUT, "midi", true), "midi", true);
    expect(hidden.hidden).toEqual(["midi"]);
    expect(withHidden(hidden, "midi", false).hidden).toEqual([]);
  });

  it("withRatio updates the ratio by zone and clamps negatives", () => {
    const next = withRatio(DEFAULT_LAYOUT, "midi", -1);
    expect(ratioOf(next, "midi")).toBe(0);
    expect(ratioOf(withRatio(DEFAULT_LAYOUT, "wave", 0.7), "wave")).toBe(0.7);
    expect(DEFAULT_LAYOUT.ratios).toEqual([0.5, 0.3, 0.2]);
  });
});
