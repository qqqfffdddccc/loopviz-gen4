import { describe, expect, it } from "vitest";
import {
  MAX_LINKS,
  MAX_NODES,
  baselineBirths,
  beatBirths,
  boxEnvelope,
  linkBoxes,
  nodeBrightness,
  nodeSeeds,
  nodeState,
  onsetBirths,
  placeBoxes,
  type BoxState,
} from "./nodes-motion";

const options = { aspect: 1.1, drift: 0.8 };

describe("nodeSeeds", () => {
  it("не двигает прежние узлы при добавлении новых", () => {
    const few = nodeSeeds(10);
    const many = nodeSeeds(30);
    expect(many.slice(0, 10)).toEqual(few);
  });

  it("ограничивает число узлов и детерминирован", () => {
    expect(nodeSeeds(999)).toHaveLength(MAX_NODES);
    expect(nodeSeeds(20)).toEqual(nodeSeeds(20));
  });
});

describe("nodeState", () => {
  it("замыкается на стыке петли", () => {
    for (const seed of nodeSeeds(MAX_NODES)) {
      const a = nodeState(seed, 0, options);
      const b = nodeState(seed, 1, options);
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(b.y).toBeCloseTo(a.y, 9);
    }
  });

  it("держит узлы в зоне", () => {
    for (const seed of nodeSeeds(MAX_NODES)) {
      for (let phase = 0; phase < 1; phase += 0.1) {
        const s = nodeState(seed, phase, options);
        expect(Math.abs(s.x)).toBeLessThan(options.aspect * 0.5 + 0.1);
        expect(Math.abs(s.y)).toBeLessThan(0.62);
      }
    }
  });
});

describe("nodeBrightness", () => {
  const seed = nodeSeeds(1)[0];
  const quiet = new Float32Array(64);
  const loud = new Float32Array(64).fill(1);

  it("растёт от громкости и верхов, а без реакции остаётся прежней", () => {
    if (!seed) throw new Error("нет зерна");
    const calm = nodeBrightness(seed, 0.3, 0, quiet, 1);
    expect(nodeBrightness(seed, 0.3, 0.8, quiet, 1)).toBeGreaterThan(calm);
    expect(nodeBrightness(seed, 0.3, 0, loud, 1)).toBeGreaterThan(calm);
    expect(nodeBrightness(seed, 0.3, 0.8, loud, 0)).toBeCloseTo(calm, 9);
  });
});

describe("boxEnvelope", () => {
  it("рождается из нуля, гаснет к концу жизни и сжимается на узел", () => {
    expect(boxEnvelope(0, 2, 1).alpha).toBe(0);
    expect(boxEnvelope(0.5, 2, 1).alpha).toBeGreaterThan(0.9);
    expect(boxEnvelope(2, 2, 1).alpha).toBe(0);
    expect(boxEnvelope(0.02, 2, 1).lock).toBeGreaterThan(boxEnvelope(0.8, 2, 1).lock);
  });
});

describe("onsetBirths", () => {
  const onsets = [
    { time: 1, strength: 1 },
    { time: 2, strength: 0.5 },
    { time: 3, strength: 0.8 },
  ];

  it("отдаёт живые рамки от новых к старым с номерами онсетов", () => {
    const births = onsetBirths(onsets, 3.5, 2, null, 8);
    expect(births.map((b) => b.id)).toEqual([2, 1]);
    expect(births.map((b) => b.age)).toEqual([0.5, 1.5]);
  });

  it("доживает рождённое в конце фрагмента после стыка", () => {
    const births = onsetBirths(onsets, 0.7, 1.5, { start: 0.5, end: 3.5 }, 8);
    expect(births).toHaveLength(1);
    expect(births[0]?.id).toBe(2);
    expect(births[0]?.age).toBeCloseTo(0.7, 9);
  });

  it("уважает лимит", () => {
    expect(onsetBirths(onsets, 3.5, 10, null, 2)).toHaveLength(2);
  });
});

describe("beatBirths и baselineBirths", () => {
  it("идентификаторы долей повторяются через 16 долей", () => {
    const a = beatBirths(5.2, 120, 1, 4, 8);
    const b = beatBirths(21.2, 120, 1, 4, 8);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });

  it("фоновые слоты замкнуты на 16 долей", () => {
    const a = baselineBirths(3.3, 120, 6);
    const b = baselineBirths(19.3, 120, 6);
    expect(b.map((x) => x.id)).toEqual(a.map((x) => x.id));
    for (let i = 0; i < a.length; i++) expect(b[i]?.age).toBeCloseTo(a[i]?.age ?? NaN, 6);
  });
});

describe("placeBoxes", () => {
  const seeds = nodeSeeds(30);
  const states = seeds.map((seed) => nodeState(seed, 0.2, options));

  it("ставит рамки на узлы, независимо от соседних рождений", () => {
    const born = { id: 7, age: 0.4, life: 2, strength: 1 };
    const alone = placeBoxes([born], seeds, states, 24);
    const withOthers = placeBoxes([{ id: 9, age: 0.1, life: 2, strength: 1 }, born], seeds, states, 24);
    expect(alone).toHaveLength(1);
    expect(withOthers[1]?.node).toBe(alone[0]?.node);
  });

  it("не выдаёт рамок без узлов и сверх лимита", () => {
    const births = Array.from({ length: 10 }, (_, i) => ({ id: i, age: 0.5, life: 2, strength: 1 }));
    expect(placeBoxes(births, [], [], 24)).toEqual([]);
    expect(placeBoxes(births, seeds, states, 3)).toHaveLength(3);
  });
});

describe("linkBoxes", () => {
  const box = (node: number, x: number, y: number, alpha = 1): BoxState => ({
    node,
    x,
    y,
    halfW: 0.04,
    halfH: 0.04,
    alpha,
    flash: 0,
    ticks: 0,
  });

  it("соединяет близкие рамки от границы к границе", () => {
    const links = linkBoxes([box(0, 0, 0), box(1, 0.2, 0)], 0.34, MAX_LINKS);
    expect(links).toHaveLength(1);
    expect(links[0]?.ax).toBeCloseTo(0.04, 9);
    expect(links[0]?.bx).toBeCloseTo(0.16, 9);
  });

  it("пропускает далёкие, пересекающиеся и общие по узлу рамки", () => {
    expect(linkBoxes([box(0, 0, 0), box(1, 0.5, 0)], 0.34, MAX_LINKS)).toEqual([]);
    expect(linkBoxes([box(0, 0, 0), box(1, 0.06, 0)], 0.34, MAX_LINKS)).toEqual([]);
    expect(linkBoxes([box(0, 0, 0), box(0, 0.2, 0)], 0.34, MAX_LINKS)).toEqual([]);
  });

  it("гасит связь вместе с более слабой рамкой и режет по лимиту", () => {
    const faint = linkBoxes([box(0, 0, 0, 1), box(1, 0.2, 0, 0.1)], 0.34, MAX_LINKS);
    expect(faint[0]?.alpha).toBeLessThanOrEqual(0.1);
    const cluster = Array.from({ length: 8 }, (_, i) => box(i, (i % 4) * 0.15, Math.floor(i / 4) * 0.15));
    expect(linkBoxes(cluster, 0.34, 5)).toHaveLength(5);
  });
});
