import { describe, expect, it } from "vitest";
import { decimalsOf } from "./format";

describe("decimalsOf", () => {
  it("counts fractional digits of the step", () => {
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(0.5)).toBe(1);
    expect(decimalsOf(0.05)).toBe(2);
    expect(decimalsOf(0.002)).toBe(3);
  });
});
