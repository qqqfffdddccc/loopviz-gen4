import { describe, expect, it } from "vitest";
import { collageBeat, JUMP_FRACTION, loopBeatCount, tileLevels } from "./collage-schedule";

describe("collageBeat", () => {
  it("замкнут на длину петли: кадр через петлю тот же", () => {
    const a = collageBeat(3.37, 2);
    const b = collageBeat(3.37 + loopBeatCount(2), 2);
    expect(b.layout).toBe(a.layout);
    expect(b.from).toBe(a.from);
    expect(b.to).toBe(a.to);
    expect(b.strength).toBe(a.strength);
    expect(b.ease).toBeCloseTo(a.ease, 9);
    expect(b.pulse).toBeCloseTo(a.pulse, 9);
  });

  it("на стыке петли предыдущая доля сворачивается в последнюю", () => {
    const first = collageBeat(0.02, 1);
    expect(first.to).toBe(0);
    expect(first.from).toBe(3);
  });

  it("прыжок завершается за JUMP_FRACTION доли", () => {
    expect(collageBeat(5, 4).ease).toBe(0);
    expect(collageBeat(5 + JUMP_FRACTION, 4).ease).toBeCloseTo(1, 9);
    expect(collageBeat(5.9, 4).ease).toBe(1);
  });

  it("пульс максимален на ударе и затухает", () => {
    expect(collageBeat(2, 4).pulse).toBe(1);
    expect(collageBeat(2.8, 4).pulse).toBeLessThan(collageBeat(2.1, 4).pulse);
  });

  it("первая доля такта сильнее остальных", () => {
    expect(collageBeat(8.1, 4).strength).toBe(1);
    expect(collageBeat(9.1, 4).strength).toBeLessThan(1);
  });

  it("раскладка меняется каждые две доли", () => {
    expect(collageBeat(0.5, 4).layout).toBe(0);
    expect(collageBeat(1.5, 4).layout).toBe(0);
    expect(collageBeat(2.5, 4).layout).toBe(1);
  });

  it("отрицательные доли тоже сворачиваются в петлю", () => {
    const c = collageBeat(-0.5, 1);
    expect(c.to).toBe(3);
    expect(c.from).toBe(2);
  });

  it("не зависит от истории вызовов", () => {
    const first = collageBeat(6.4, 4);
    collageBeat(100, 4);
    expect(collageBeat(6.4, 4)).toEqual(first);
  });
});

describe("tileLevels", () => {
  it("растёт с плотностью и ограничен", () => {
    expect(tileLevels(0)).toBe(2);
    expect(tileLevels(1)).toBe(6);
    expect(tileLevels(-3)).toBe(2);
    expect(tileLevels(9)).toBe(6);
    expect(tileLevels(0.5)).toBeGreaterThan(tileLevels(0.2));
  });
});
