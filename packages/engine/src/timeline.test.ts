import { describe, expect, it } from "vitest";
import {
  barAt,
  barLines,
  beatAt,
  clampFragment,
  createTimeline,
  fragmentBars,
  mapVideoTimeToSourceTime,
  secondsPerBar,
  snapFragment,
  snapToBar,
  totalDuration,
} from "./timeline";

const tl = (extra = {}) => createTimeline({ fragment: { startSec: 2, endSec: 6 }, ...extra });

describe("timeline basics", () => {
  it("defaults to 120 BPM, 4/4 and a four-bar fragment", () => {
    const t = createTimeline();
    expect(t.bpm).toBe(120);
    expect(t.beatsPerBar).toBe(4);
    expect(secondsPerBar(t)).toBe(2);
    expect(t.fragment).toEqual({ startSec: 0, endSec: 8 });
  });

  it("computes bars in the fragment from bpm and signature", () => {
    expect(fragmentBars(tl())).toBe(2);
    expect(fragmentBars(tl({ bpm: 90, beatsPerBar: 3 }))).toBeCloseTo(2, 6);
  });
});

describe("totalDuration", () => {
  it("multiplies the fragment by repeats", () => {
    expect(totalDuration(tl({ duration: { mode: "repeats", repeats: 3 } }))).toBe(12);
  });
  it("uses explicit seconds regardless of the fragment", () => {
    expect(totalDuration(tl({ duration: { mode: "seconds", seconds: 15 } }))).toBe(15);
  });
});

describe("mapVideoTimeToSourceTime", () => {
  it("starts at the fragment start and wraps at its end", () => {
    const t = tl();
    expect(mapVideoTimeToSourceTime(t, 0)).toBe(2);
    expect(mapVideoTimeToSourceTime(t, 3.5)).toBe(5.5);
    expect(mapVideoTimeToSourceTime(t, 4)).toBe(2);
    expect(mapVideoTimeToSourceTime(t, 9)).toBe(3);
  });
  it("keeps looping when seconds mode is not a multiple of the fragment", () => {
    const t = tl({ duration: { mode: "seconds", seconds: 10 } });
    expect(mapVideoTimeToSourceTime(t, 9.5)).toBe(3.5);
  });
  it("handles negative time and a degenerate fragment", () => {
    expect(mapVideoTimeToSourceTime(tl(), -1)).toBe(5);
    expect(mapVideoTimeToSourceTime(createTimeline({ fragment: { startSec: 3, endSec: 3 } }), 7)).toBe(3);
  });
});

describe("beat and bar", () => {
  it("follows the source clock, not the video clock", () => {
    const t = tl();
    expect(beatAt(t, 0)).toBe(4);
    expect(barAt(t, 0)).toBe(1);
    expect(barAt(t, 1)).toBe(1.5);
    expect(barAt(t, 4)).toBe(1);
  });
});

describe("snapping", () => {
  it("rounds to the nearest bar", () => {
    expect(snapToBar(tl(), 2.9)).toBe(2);
    expect(snapToBar(tl(), 3.1)).toBe(4);
  });

  it("snaps both edges and guarantees at least one bar", () => {
    expect(snapFragment(tl(), { startSec: 2.2, endSec: 5.7 }, 16)).toEqual({ startSec: 2, endSec: 6 });
    expect(snapFragment(tl(), { startSec: 4.1, endSec: 4.3 }, 16)).toEqual({ startSec: 4, endSec: 6 });
  });

  it("pulls an overshooting end back onto the last whole bar", () => {
    expect(snapFragment(tl(), { startSec: 10, endSec: 40 }, 15)).toEqual({ startSec: 10, endSec: 14 });
    expect(snapFragment(tl(), { startSec: 14, endSec: 40 }, 15)).toEqual({ startSec: 12, endSec: 14 });
  });

  it("falls back to the whole extent when it is shorter than a bar", () => {
    expect(snapFragment(tl(), { startSec: 0, endSec: 1 }, 1.5)).toEqual({ startSec: 0, endSec: 1.5 });
  });

  it("clamps free fragments into the extent", () => {
    expect(clampFragment({ startSec: -1, endSec: 99 }, 10)).toEqual({ startSec: 0, endSec: 10 });
  });
});

describe("barLines", () => {
  it("lists bar boundaries inside a range", () => {
    expect(barLines(tl(), 1, 7)).toEqual([2, 4, 6]);
    expect(barLines(tl(), 0, 8, 2)).toEqual([0, 4, 8]);
  });
});
