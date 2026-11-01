import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, computeSlotRects } from "./layout";
import { DEFAULT_FEATHER, MAX_FEATHER, zoneFeathers } from "./layout-feather";

describe("zoneFeathers", () => {
  const rects = computeSlotRects(DEFAULT_LAYOUT, 1080, 1920, 0);

  it("feathers only the edges that face a neighbour", () => {
    const [hero, midi, wave] = zoneFeathers(rects, DEFAULT_FEATHER);
    expect(hero).toEqual({ slot: "hero", top: 0, bottom: DEFAULT_FEATHER });
    expect(midi).toEqual({ slot: "midi", top: DEFAULT_FEATHER, bottom: DEFAULT_FEATHER });
    expect(wave).toEqual({ slot: "wave", top: DEFAULT_FEATHER, bottom: 0 });
  });

  it("is a fraction of the zone height, so the pixel size scales with the output", () => {
    const small = computeSlotRects(DEFAULT_LAYOUT, 540, 960, 0);
    const big = computeSlotRects(DEFAULT_LAYOUT, 2160, 3840, 0);
    const px = (list: typeof rects) => (zoneFeathers(list, 0.06)[1]?.top ?? 0) * (list[1]?.h ?? 0);
    expect(px(big) / px(small)).toBeCloseTo(4);
    expect(zoneFeathers(small, 0.06)).toEqual(zoneFeathers(big, 0.06));
  });

  it("returns nothing to feather for a single zone", () => {
    const single = computeSlotRects({ ...DEFAULT_LAYOUT, hidden: ["hero", "midi"] }, 100, 300, 0);
    expect(zoneFeathers(single, 0.1)).toEqual([{ slot: "wave", top: 0, bottom: 0 }]);
  });

  it("clamps negative and oversized values", () => {
    expect(zoneFeathers(rects, -1)[1]).toMatchObject({ top: 0, bottom: 0 });
    expect(zoneFeathers(rects, 5)[1]).toMatchObject({ top: MAX_FEATHER, bottom: MAX_FEATHER });
  });

  it("skips zones with zero height", () => {
    const flat = [
      { slot: "hero" as const, x: 0, y: 0, w: 10, h: 0 },
      { slot: "wave" as const, x: 0, y: 0, w: 10, h: 10 },
    ];
    expect(zoneFeathers(flat, 0.1)[0]).toMatchObject({ top: 0, bottom: 0 });
  });
});
