import { describe, expect, it } from "vitest";
import { createTimeline } from "./timeline";
import { dragFragmentEdge, hitTestFragment, moveFragment, videoTimeAfterRefit, videoTimeForSource } from "./timeline-edit";

// 120 BPM, 4/4: бар = 2 с
const snapped = createTimeline({ fragment: { startSec: 4, endSec: 12 }, snapToBars: true });
const free = createTimeline({ fragment: { startSec: 4, endSec: 12 }, snapToBars: false });
const EXTENT = 40;

describe("hitTestFragment", () => {
  const fragment = { startSec: 10, endSec: 20 };
  it.each([
    [10.1, "start"],
    [19.8, "end"],
    [15, "inside"],
    [5, "outside"],
    [30, "outside"],
  ])("sec %f -> %s", (sec, expected) => {
    expect(hitTestFragment(fragment, sec, 100, 1000, 8)).toBe(expected);
  });

  it("prefers the nearer edge on a tiny fragment", () => {
    expect(hitTestFragment({ startSec: 10, endSec: 10.2 }, 10.15, 100, 1000, 8)).toBe("end");
  });
});

describe("dragFragmentEdge", () => {
  it("snaps the start edge to a bar", () => {
    expect(dragFragmentEdge(snapped, snapped.fragment, "start", 6.7, EXTENT)).toEqual({ startSec: 6, endSec: 12 });
  });

  it("never lets the start cross the end, keeping one bar when snapping", () => {
    expect(dragFragmentEdge(snapped, snapped.fragment, "start", 30, EXTENT)).toEqual({ startSec: 10, endSec: 12 });
  });

  it("snaps the end edge and clamps to the last whole bar", () => {
    expect(dragFragmentEdge(snapped, snapped.fragment, "end", 15.2, EXTENT)).toEqual({ startSec: 4, endSec: 16 });
    expect(dragFragmentEdge(snapped, snapped.fragment, "end", 999, EXTENT)).toEqual({ startSec: 4, endSec: 40 });
  });

  it("moves edges freely when snapping is off, with a tiny minimum length", () => {
    expect(dragFragmentEdge(free, free.fragment, "start", 5.37, EXTENT)).toEqual({ startSec: 5.37, endSec: 12 });
    const crossed = dragFragmentEdge(free, free.fragment, "end", 1, EXTENT);
    expect(crossed.endSec - crossed.startSec).toBeCloseTo(0.05);
    expect(dragFragmentEdge(free, free.fragment, "start", -5, EXTENT).startSec).toBe(0);
  });
});

describe("moveFragment", () => {
  it("keeps the length and snaps the start to a bar", () => {
    expect(moveFragment(snapped, snapped.fragment, 3.3, EXTENT)).toEqual({ startSec: 8, endSec: 16 });
  });

  it("clamps to both ends of the source", () => {
    expect(moveFragment(snapped, snapped.fragment, -100, EXTENT)).toEqual({ startSec: 0, endSec: 8 });
    expect(moveFragment(snapped, snapped.fragment, 100, EXTENT)).toEqual({ startSec: 32, endSec: 40 });
    expect(moveFragment(free, free.fragment, 100, 39.5)).toEqual({ startSec: 31.5, endSec: 39.5 });
  });

  it("moves freely without snapping", () => {
    expect(moveFragment(free, free.fragment, 1.25, EXTENT)).toEqual({ startSec: 5.25, endSec: 13.25 });
  });

  it("does not push a snapped fragment past an extent that is not a whole bar", () => {
    const moved = moveFragment(snapped, snapped.fragment, 100, 39);
    expect(moved.endSec).toBeLessThanOrEqual(39);
    expect(moved.startSec % 2).toBe(0);
  });
});

describe("seek and refit", () => {
  it("maps a source time inside the fragment to video time", () => {
    expect(videoTimeForSource(snapped.fragment, 7)).toBe(3);
    expect(videoTimeForSource(snapped.fragment, 3)).toBeNull();
    expect(videoTimeForSource(snapped.fragment, 13)).toBeNull();
  });

  it("keeps the playhead when it is still inside the new fragment", () => {
    const next = { ...snapped, fragment: { startSec: 2, endSec: 14 } };
    // t = 3 с -> источник 7 с -> в новом фрагменте 5 с от начала
    expect(videoTimeAfterRefit(snapped, next, 3)).toBe(5);
  });

  it("restarts from the beginning when the playhead falls out of the new fragment", () => {
    const next = { ...snapped, fragment: { startSec: 8, endSec: 20 } };
    expect(videoTimeAfterRefit(snapped, next, 1)).toBe(0);
  });

  it("accounts for loop wrapping of the old time", () => {
    const next = { ...snapped, fragment: { startSec: 4, endSec: 20 } };
    // t = 11 при длине 8 -> локально 3 -> источник 7
    expect(videoTimeAfterRefit(snapped, next, 11)).toBe(3);
  });
});
