import { describe, expect, it } from "vitest";
import { OVERLAY_POSITIONS, anchorFor, formatBpm, lineLeft, metaLine } from "./layout";

const frame = { w: 1080, h: 1920 };

describe("anchorFor", () => {
  it("anchors every position inside the frame", () => {
    for (const position of OVERLAY_POSITIONS) {
      const { x, y } = anchorFor(position, frame, { h: 100 }, 64);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(frame.w);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y + 100).toBeLessThanOrEqual(frame.h);
    }
  });

  it("aligns left positions left and right positions right", () => {
    expect(anchorFor("ЛЕВО ВЕРХ", frame, { h: 100 }, 64)).toEqual({ x: 64, y: 64, align: "left" });
    expect(anchorFor("ПРАВО НИЗ", frame, { h: 100 }, 64)).toEqual({ x: 1016, y: 1756, align: "right" });
    expect(anchorFor("ЦЕНТР", frame, { h: 100 }, 64)).toEqual({ x: 540, y: 910, align: "center" });
  });
});

describe("lineLeft", () => {
  it("shifts the start by alignment", () => {
    expect(lineLeft(100, 40, "left")).toBe(100);
    expect(lineLeft(100, 40, "right")).toBe(60);
    expect(lineLeft(100, 40, "center")).toBe(80);
  });
});

describe("formatBpm and metaLine", () => {
  it("uses the manual value when given and the timeline tempo otherwise", () => {
    expect(formatBpm(" 140 ", 120)).toBe("140");
    expect(formatBpm("", 120)).toBe("120");
    expect(formatBpm("", 93.46)).toBe("93.5");
  });

  it("joins non-empty parts", () => {
    expect(metaLine("120", "A MIN")).toBe("120 BPM  /  A MIN");
    expect(metaLine("120", "")).toBe("120 BPM");
    expect(metaLine("", " ")).toBe("");
  });
});
