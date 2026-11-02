import { describe, expect, it } from "vitest";
import { beatPulse, haloPulse, highBandLevel } from "./halo-pulse";

describe("beatPulse", () => {
  it("на старте первой доли максимум, дальше спад", () => {
    expect(beatPulse(4)).toBeCloseTo(1, 9);
    expect(beatPulse(4.25)).toBeLessThan(beatPulse(4.1));
  });

  it("остальные доли слабее первой", () => {
    expect(beatPulse(5)).toBeLessThan(beatPulse(4));
    expect(beatPulse(5)).toBeGreaterThan(0.5);
  });

  it("сетка замкнута через такт и не зависит от истории", () => {
    expect(beatPulse(12.37)).toBeCloseTo(beatPulse(4.37), 9);
    beatPulse(99);
    expect(beatPulse(4.37)).toBe(beatPulse(4.37));
  });

  it("отрицательные и нечисловые доли не ломают результат", () => {
    expect(beatPulse(-4)).toBeCloseTo(1, 9);
    expect(beatPulse(Number.NaN)).toBe(0);
  });
});

describe("haloPulse", () => {
  it("берёт онсет, если он сильнее долей", () => {
    expect(haloPulse(0.9, 4.9)).toBeCloseTo(0.9, 9);
  });

  it("без онсетов держит приглушённую сетку долей", () => {
    expect(haloPulse(0, 4)).toBeCloseTo(0.5, 9);
  });

  it("ограничен 0..1", () => {
    expect(haloPulse(5, 4)).toBe(1);
    expect(haloPulse(-1, 4.99)).toBeGreaterThanOrEqual(0);
    expect(haloPulse(Number.NaN, 4.99)).toBeGreaterThanOrEqual(0);
  });
});

describe("highBandLevel", () => {
  it("усредняет верхние полосы", () => {
    expect(highBandLevel([1, 1, 1, 1, 1, 0.3, 0.6, 0.9])).toBeCloseTo(0.6, 9);
  });

  it("устойчив к коротким и пустым массивам", () => {
    expect(highBandLevel([])).toBe(0);
    expect(highBandLevel([0.4])).toBeCloseTo(0.4, 9);
  });
});
