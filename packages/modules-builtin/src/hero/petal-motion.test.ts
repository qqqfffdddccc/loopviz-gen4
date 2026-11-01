import { describe, expect, it } from "vitest";
import { MAX_PETALS, beatPulse, hash01, petalSeeds, petalState, type PetalOptions } from "./petal-motion";

const options: PetalOptions = { aspect: 1.1, drift: 0.6, size: 1, dof: 0.7, focus: 0.5 };

describe("hash01", () => {
  it("лежит в 0..1 и детерминирован", () => {
    for (let i = 0; i < 200; i++) {
      const value = hash01(i, 3);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(hash01(i, 3)).toBe(value);
    }
  });

  it("разные соли дают разные значения", () => {
    expect(hash01(5, 1)).not.toBe(hash01(5, 2));
  });
});

describe("petalSeeds", () => {
  it("всегда один и тот же набор", () => {
    expect(petalSeeds(16)).toEqual(petalSeeds(16));
  });

  it("идёт от ближних к дальним", () => {
    const depths = petalSeeds().map((s) => s.depth);
    expect([...depths].sort((a, b) => b - a)).toEqual(depths);
    expect(depths).toHaveLength(MAX_PETALS);
  });
});

describe("petalState", () => {
  const seeds = petalSeeds(MAX_PETALS);

  it("замыкается на стыке петли", () => {
    for (const seed of seeds) {
      const start = petalState(seed, 0, options);
      const end = petalState(seed, 1, options);
      expect(end.x).toBeCloseTo(start.x, 9);
      expect(end.y).toBeCloseTo(start.y, 9);
      expect(end.rotation).toBeCloseTo(start.rotation, 9);
      expect(end.opacity).toBeCloseTo(start.opacity, 9);
    }
  });

  it("зависит только от фазы, не от порядка вызовов", () => {
    const seed = seeds[3];
    if (!seed) throw new Error("нет зерна");
    const first = petalState(seed, 0.37, options);
    petalState(seed, 0.9, options);
    expect(petalState(seed, 0.37, options)).toEqual(first);
  });

  it("растворяется у границы вертикального обхода", () => {
    for (const seed of seeds) {
      for (let k = 0; k < 40; k++) {
        const state = petalState(seed, k / 40, options);
        expect(state.opacity).toBeGreaterThanOrEqual(0);
        expect(state.opacity).toBeLessThanOrEqual(0.95);
        if (Math.abs(state.y) > 0.64) expect(state.opacity).toBeLessThan(0.2);
      }
    }
  });

  it("размытие минимально в плоскости фокуса и растёт вне её", () => {
    const base = seeds[0];
    if (!base) throw new Error("нет зерна");
    const seed = { ...base, depth: 0.5 };
    const sharp = petalState(seed, 0.2, options).blur;
    const soft = petalState({ ...seed, depth: 1 }, 0.2, options).blur;
    expect(soft).toBeGreaterThan(sharp);
  });
});

describe("beatPulse", () => {
  it("максимальна на доле и затухает", () => {
    expect(beatPulse(4, 0)).toBeCloseTo(1, 9);
    expect(beatPulse(4.5, 0)).toBeLessThan(beatPulse(4.1, 0));
    expect(beatPulse(4.5, 1)).toBeCloseTo(1, 9);
  });
});
