import { describe, expect, it } from "vitest";
import { defineModule, type FrameInput, type SlotKind } from "@loopviz/mod-api";
import { ModuleRegistry } from "./registry";

type P = { speed: number };

const fake = (id: string, slot: SlotKind) =>
  defineModule<P>(
    {
      id,
      slot,
      name: id,
      surface: "canvas2d",
      params: { speed: { kind: "slider", label: "Скорость", min: 0, max: 1, step: 0.1, default: 0.5 } },
    },
    () => ({ init() {}, resize() {}, render() {}, dispose() {} }),
  );

describe("ModuleRegistry", () => {
  it("lists definitions by slot and gets them by id", () => {
    const registry = new ModuleRegistry();
    registry.register(fake("a", "hero"));
    registry.register(fake("b", "midi"));
    registry.register(fake("c", "hero"));

    expect(registry.list("hero").map((m) => m.id)).toEqual(["a", "c"]);
    expect(registry.list("wave")).toEqual([]);
    expect(registry.get("b")?.slot).toBe("midi");
    expect(registry.get("missing")).toBeUndefined();
    expect(registry.create("missing")).toBeUndefined();
  });

  it("rejects duplicate ids", () => {
    const registry = new ModuleRegistry();
    registry.register(fake("a", "hero"));
    expect(() => registry.register(fake("a", "wave"))).toThrow(/already registered/);
  });

  it("creates independent instances from one factory", () => {
    const stats: { renders: number; disposed: boolean }[] = [];
    const counting = defineModule<P>(
      {
        id: "counter",
        slot: "hero",
        name: "counter",
        surface: "canvas2d",
        params: { speed: { kind: "slider", label: "Скорость", min: 0, max: 1, step: 0.1, default: 0.5 } },
      },
      () => {
        const own = { renders: 0, disposed: false };
        stats.push(own);
        return {
          init() {},
          resize() {},
          render() {
            own.renders += 1;
          },
          dispose() {
            own.disposed = true;
          },
        };
      },
    );
    const registry = new ModuleRegistry();
    registry.register(counting);

    const first = registry.create("counter");
    const second = registry.create("counter");
    expect(first).toBeDefined();
    expect(first).not.toBe(second);

    const frame = {} as FrameInput;
    first?.render(frame, { speed: 0.5 });
    first?.render(frame, { speed: 0.5 });
    second?.render(frame, { speed: 0.5 });
    first?.dispose();

    expect(stats).toEqual([
      { renders: 2, disposed: true },
      { renders: 1, disposed: false },
    ]);
  });
});
