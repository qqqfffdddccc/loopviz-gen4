import { describe, expect, it } from "vitest";
import { BLOOM_LEVELS, GRAIN_FPS, bloomWeights, grainAmplitudeScale, grainCellSize, grainSeed } from "./post-settings";

describe("bloomWeights", () => {
  it("нормированы: сумма равна 1 при любом радиусе", () => {
    for (const radius of [0, 0.25, 0.5, 1]) {
      const weights = bloomWeights(radius);
      expect(weights).toHaveLength(BLOOM_LEVELS);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
  });

  it("радиус сдвигает массу к нижним, более широким уровням", () => {
    const centroid = (radius: number): number => bloomWeights(radius).reduce((sum, w, i) => sum + w * i, 0);
    expect(centroid(0.1)).toBeLessThan(centroid(0.5));
    expect(centroid(0.5)).toBeLessThan(centroid(0.9));
  });

  it("клампит радиус вне 0..1", () => {
    expect(bloomWeights(-3)).toEqual(bloomWeights(0));
    expect(bloomWeights(7)).toEqual(bloomWeights(1));
  });
});

describe("grainSeed", () => {
  it("детерминирован и меняется 24 раза в секунду", () => {
    expect(grainSeed(1.234)).toBe(grainSeed(1.234));
    expect(grainSeed(0)).toBe(0);
    expect(grainSeed(1)).toBe(GRAIN_FPS);
    expect(grainSeed(1 / GRAIN_FPS - 1e-6)).toBe(0);
  });

  it("остаётся в целочисленном диапазоне при большом t и отрицательном t", () => {
    expect(grainSeed(1e7)).toBeLessThan(1048576);
    expect(grainSeed(-5)).toBe(0);
  });
});

describe("grainCellSize", () => {
  it("растёт пропорционально высоте, ниже опорной остаётся пикселем", () => {
    expect(grainCellSize(700)).toBe(1);
    expect(grainCellSize(1920)).toBe(1);
    expect(grainCellSize(3840)).toBe(2);
    expect(grainCellSize(3840) / 3840).toBeCloseTo(grainCellSize(1920) / 1920, 10);
  });

  it("размер зерна масштабирует ячейку, крупное зерно одинаково в 1080p и 4K", () => {
    expect(grainCellSize(1920, 1)).toBeCloseTo(3, 10);
    expect(grainCellSize(3840, 1) / 3840).toBeCloseTo(grainCellSize(1920, 1) / 1920, 10);
  });
});

describe("grainAmplitudeScale", () => {
  it("ячейка мельче пикселя ослабляет зерно, крупнее пикселя не трогает", () => {
    expect(grainAmplitudeScale(1920, 0)).toBeCloseTo(0.5, 10);
    expect(grainAmplitudeScale(3840, 0)).toBe(1);
    expect(grainAmplitudeScale(1920, 1)).toBe(1);
  });
});
