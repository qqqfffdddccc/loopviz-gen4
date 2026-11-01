import { describe, expect, it } from "vitest";
import { dropIndex, dropMark } from "./reorder";

describe("dropIndex", () => {
  const centers = [10, 30, 50];
  it("keeps the row in place while the pointer is over it", () => {
    expect(dropIndex(centers, 1, 31)).toBe(1);
  });
  it("moves to the end when dragged below every row", () => {
    expect(dropIndex(centers, 0, 100)).toBe(2);
  });
  it("moves to the start when dragged above every row", () => {
    expect(dropIndex(centers, 2, -5)).toBe(0);
  });
  it("counts only the other rows above the pointer", () => {
    expect(dropIndex(centers, 0, 40)).toBe(1);
  });
});

describe("dropMark", () => {
  it("marks the dragged row and the insertion side", () => {
    expect(dropMark({ from: 0, to: 2 }, 0)).toBe("dragging");
    expect(dropMark({ from: 0, to: 2 }, 2)).toBe("drop-after");
    expect(dropMark({ from: 2, to: 0 }, 0)).toBe("drop-before");
    expect(dropMark({ from: 1, to: 1 }, 1)).toBe("dragging");
    expect(dropMark({ from: 0, to: 2 }, 1)).toBeNull();
    expect(dropMark(null, 0)).toBeNull();
  });
});
