import { describe, expect, it } from "vitest";
import { activeRings, beatRings, estimateDuration, extractOnsets } from "./ring-schedule";

function peaksWithHits(points: number, hitIndices: number[], decay: number): Float32Array {
  const peaks = new Float32Array(points * 2);
  for (let i = 0; i < points; i++) {
    let level = 0.02;
    for (const hit of hitIndices) {
      if (i >= hit) level = Math.max(level, Math.exp(-(i - hit) / decay));
    }
    peaks[2 * i] = -level;
    peaks[2 * i + 1] = level;
  }
  return peaks;
}

describe("extractOnsets", () => {
  it("находит удары на своих местах", () => {
    const peaks = peaksWithHits(4096, [512, 1536, 2560], 120);
    const onsets = extractOnsets(peaks, 8, 0.5);
    expect(onsets.map((o) => Math.round(o.time * 4) / 4)).toEqual([1, 3, 5]);
  });

  it("возвращает пусто для тишины и пустых данных", () => {
    expect(extractOnsets(new Float32Array(8192), 8, 0.5)).toEqual([]);
    expect(extractOnsets(new Float32Array(0), 8, 0.5)).toEqual([]);
    expect(extractOnsets(peaksWithHits(4096, [100], 50), 0, 0.5)).toEqual([]);
  });

  it("не рождает два онсета ближе минимального зазора", () => {
    const peaks = peaksWithHits(4096, [1000, 1010], 40);
    expect(extractOnsets(peaks, 8, 1).length).toBe(1);
  });

  it("детерминирован", () => {
    const peaks = peaksWithHits(4096, [300, 900, 1700], 80);
    expect(extractOnsets(peaks, 8, 0.4)).toEqual(extractOnsets(peaks, 8, 0.4));
  });
});

describe("estimateDuration", () => {
  it("восстанавливает длительность из progress", () => {
    expect(estimateDuration(2, 0.25)).toBe(8);
  });

  it("отвергает нулевой и полный progress", () => {
    expect(estimateDuration(0, 0)).toBeNull();
    expect(estimateDuration(9, 1)).toBeNull();
  });
});

describe("activeRings", () => {
  const onsets = [
    { time: 1, strength: 1 },
    { time: 2, strength: 0.5 },
    { time: 3, strength: 0.8 },
  ];

  it("отдаёт живые кольца от новых к старым", () => {
    const rings = activeRings(onsets, 3.5, 2, null, 8);
    expect(rings.map((r) => r.age)).toEqual([0.5, 1.5]);
  });

  it("не показывает онсеты до начала фрагмента", () => {
    const rings = activeRings(onsets, 3.5, 4, { start: 2.5, end: 100 }, 8);
    expect(rings).toHaveLength(1);
  });

  it("доживает рождённое в конце фрагмента после стыка петли", () => {
    const span = { start: 0.5, end: 3.5 };
    const rings = activeRings(onsets, 0.7, 1.5, span, 8);
    expect(rings).toHaveLength(1);
    expect(rings[0]?.age).toBeCloseTo(0.7 - 3 + 3, 9);
    expect(rings[0]?.strength).toBe(0.8);
  });

  it("кольцо в конце и в начале петли одного возраста: стык без скачка", () => {
    const span = { start: 0, end: 4 };
    const before = activeRings(onsets, 3.999, 2.5, span, 8);
    const after = activeRings(onsets, 0.001, 2.5, span, 8);
    expect(before.map((r) => Math.round(r.age))).toEqual(after.map((r) => Math.round(r.age)));
  });

  it("результат не зависит от истории вызовов", () => {
    const first = activeRings(onsets, 2.2, 2, null, 8);
    activeRings(onsets, 9, 2, null, 8);
    expect(activeRings(onsets, 2.2, 2, null, 8)).toEqual(first);
  });

  it("уважает лимит", () => {
    expect(activeRings(onsets, 3.2, 10, null, 2)).toHaveLength(2);
  });
});

describe("beatRings", () => {
  it("рождает кольцо на каждой доле, сильнее на первой", () => {
    const rings = beatRings(4.5, 120, 1.2, 4, 8);
    expect(rings.map((r) => r.age)).toEqual([0.25, 0.75]);
    expect(rings[0]?.strength).toBe(1);
    expect(rings[1]?.strength).toBe(0.6);
  });

  it("одинаков через такт: сетка замкнута", () => {
    const a = beatRings(8.3, 120, 2, 4, 8);
    const b = beatRings(4.3, 120, 2, 4, 8);
    expect(a).toHaveLength(b.length);
    a.forEach((ring, i) => {
      expect(ring.age).toBeCloseTo(b[i]?.age ?? NaN, 9);
      expect(ring.strength).toBe(b[i]?.strength);
    });
  });
});
