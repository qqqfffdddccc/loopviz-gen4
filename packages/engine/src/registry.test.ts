import { describe, expect, it } from "vitest";
import type { SlotKind, VisualModule } from "@loopviz/mod-api";
import { ModuleRegistry } from "./registry";

type P = { speed: number };

const fake = (id: string, slot: SlotKind): VisualModule<P> => ({
  id,
  slot,
  name: id,
  surface: "canvas2d",
  params: { speed: { kind: "slider", label: "Скорость", min: 0, max: 1, step: 0.1, default: 0.5 } },
  init() {},
  resize() {},
  render() {},
  dispose() {},
});

describe("ModuleRegistry", () => {
  it("lists modules by slot and gets them by id", () => {
    const registry = new ModuleRegistry();
    registry.register(fake("a", "hero"));
    registry.register(fake("b", "midi"));
    registry.register(fake("c", "hero"));

    expect(registry.list("hero").map((m) => m.id)).toEqual(["a", "c"]);
    expect(registry.list("wave")).toEqual([]);
    expect(registry.get("b")?.slot).toBe("midi");
    expect(registry.get("missing")).toBeUndefined();
  });

  it("rejects duplicate ids", () => {
    const registry = new ModuleRegistry();
    registry.register(fake("a", "hero"));
    expect(() => registry.register(fake("a", "wave"))).toThrow(/already registered/);
  });
});
