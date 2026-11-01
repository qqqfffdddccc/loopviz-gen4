import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, computeSlotRects, ratioOf, type Layout } from "./layout";
import { MIN_ZONE_SHARE, dragSplitter, freeHeight, moveZone, parseLayout, splittersOf, visibleShares } from "./layout-edit";
import { BUILTIN_LAYOUT_PRESETS, layoutMatchesPreset, resetSplitToPreset, type LayoutPreset } from "./layout-presets";

const layout = (over: Partial<Layout> = {}): Layout => ({ ...DEFAULT_LAYOUT, ...over });

function preset(id: string): LayoutPreset {
  const found = BUILTIN_LAYOUT_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(id);
  return found;
}

describe("dragSplitter", () => {
  it("moves share between the pair and keeps the sum", () => {
    const next = dragSplitter(layout(), "hero", "midi", 0.1);
    expect(ratioOf(next, "hero")).toBeCloseTo(0.6);
    expect(ratioOf(next, "midi")).toBeCloseTo(0.2);
    expect(ratioOf(next, "wave")).toBeCloseTo(0.2);
  });

  it("clamps so no zone of the pair drops below the minimum share", () => {
    const down = dragSplitter(layout(), "hero", "midi", -5);
    expect(ratioOf(down, "hero")).toBeCloseTo(MIN_ZONE_SHARE);
    expect(ratioOf(down, "midi")).toBeCloseTo(0.8 - MIN_ZONE_SHARE);
    const up = dragSplitter(layout(), "midi", "wave", 5);
    expect(ratioOf(up, "wave")).toBeCloseTo(MIN_ZONE_SHARE);
  });

  it("does not mutate the input layout", () => {
    dragSplitter(DEFAULT_LAYOUT, "hero", "midi", 0.2);
    expect(DEFAULT_LAYOUT.ratios).toEqual([0.5, 0.3, 0.2]);
  });

  it("works across a hidden zone and leaves the hidden ratio untouched", () => {
    const base = layout({ hidden: ["midi"] });
    const next = dragSplitter(base, "hero", "wave", 0.1);
    const [hero, wave] = visibleShares(next);
    expect(hero?.share).toBeCloseTo(0.5 / 0.7 + 0.1);
    expect((hero?.share ?? 0) + (wave?.share ?? 0)).toBeCloseTo(1);
    expect(ratioOf(next, "midi")).toBe(0.3);
  });

  it("returns the same layout for a pair that is not visible", () => {
    const base = layout({ hidden: ["midi"] });
    expect(dragSplitter(base, "hero", "midi", 0.1)).toBe(base);
  });

  it("handles all-zero ratios as equal shares", () => {
    const next = dragSplitter(layout({ ratios: [0, 0, 0] }), "hero", "midi", 0.1);
    const shares = visibleShares(next).map((z) => z.share);
    expect(shares[0]).toBeCloseTo(1 / 3 + 0.1);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});

describe("splittersOf and freeHeight", () => {
  it("places splitters in the middle of the gap between visible zones", () => {
    const rects = computeSlotRects(layout(), 100, 1000, 20);
    const splitters = splittersOf(rects);
    expect(splitters.map((s) => [s.upper, s.lower, s.y])).toEqual([
      ["hero", "midi", 490],
      ["midi", "wave", 798],
    ]);
  });

  it("has no splitter for a single zone", () => {
    expect(splittersOf(computeSlotRects(layout({ hidden: ["hero", "midi"] }), 100, 300, 0))).toEqual([]);
  });

  it("subtracts gaps from the free height", () => {
    expect(freeHeight(1000, 20, 3)).toBe(960);
    expect(freeHeight(1000, 20, 1)).toBe(1000);
  });
});

describe("moveZone", () => {
  it("moves a zone together with its ratio", () => {
    const next = moveZone(DEFAULT_LAYOUT, 0, 2);
    expect(next.order).toEqual(["midi", "wave", "hero"]);
    expect(next.ratios).toEqual([0.3, 0.2, 0.5]);
  });

  it("ignores no-op and out-of-range moves", () => {
    expect(moveZone(DEFAULT_LAYOUT, 1, 1)).toBe(DEFAULT_LAYOUT);
    expect(moveZone(DEFAULT_LAYOUT, 0, 3)).toBe(DEFAULT_LAYOUT);
  });
});

describe("presets", () => {
  it("matches the preset that was applied and no other", () => {
    const classic = preset("classic");
    expect(layoutMatchesPreset(classic.layout, classic)).toBe(true);
    expect(layoutMatchesPreset(classic.layout, preset("big-hero"))).toBe(false);
    expect(layoutMatchesPreset(classic.layout, preset("notes-top"))).toBe(false);
  });

  it("ignores the spare ratio of a hidden zone and tolerates slight drift", () => {
    const noMidi = preset("no-midi");
    const drifted = layout({ hidden: ["midi"], ratios: [0.703, 0.9, 0.3] });
    expect(layoutMatchesPreset(drifted, noMidi)).toBe(true);
  });

  it("builtin presets have unique ids and positive visible ratios", () => {
    const ids = BUILTIN_LAYOUT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of BUILTIN_LAYOUT_PRESETS) expect(parseLayout(p.layout)).not.toBeNull();
  });

  it("resets a pair to the preset proportion keeping the pair sum", () => {
    const dragged = dragSplitter(DEFAULT_LAYOUT, "hero", "midi", 0.15);
    const reset = resetSplitToPreset(dragged, "hero", "midi", preset("classic"));
    expect(ratioOf(reset, "hero")).toBeCloseTo(0.5);
    expect(ratioOf(reset, "midi")).toBeCloseTo(0.3);
    expect(ratioOf(reset, "wave")).toBeCloseTo(0.2);
  });
});

describe("parseLayout", () => {
  it("accepts a valid layout and deduplicates hidden", () => {
    expect(parseLayout({ order: ["wave", "hero", "midi"], ratios: [1, 2, 3], hidden: ["hero", "hero"] })).toEqual({
      order: ["wave", "hero", "midi"],
      ratios: [1, 2, 3],
      hidden: ["hero"],
    });
  });

  it.each([
    null,
    "x",
    { order: ["hero", "hero", "wave"], ratios: [1, 1, 1], hidden: [] },
    { order: ["hero", "midi"], ratios: [1, 1], hidden: [] },
    { order: ["hero", "midi", "wave"], ratios: [1, -1, 1], hidden: [] },
    { order: ["hero", "midi", "wave"], ratios: [1, 1, 1], hidden: ["overlay"] },
    { order: ["hero", "midi", "wave"], ratios: [1, "a", 1], hidden: [] },
  ])("rejects malformed data %#", (value) => {
    expect(parseLayout(value)).toBeNull();
  });
});
