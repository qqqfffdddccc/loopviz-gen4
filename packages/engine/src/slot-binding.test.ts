import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Texture } from "three";
import {
  defineModule,
  type FrameInput,
  type ModuleBehavior,
  type ModuleContext,
  type ParamValues,
  type Theme,
} from "@loopviz/mod-api";
import { ModuleCrashError, type FailurePolicy, type ModuleFailure } from "./module-failure";
import { SlotBinding } from "./slot-binding";
import type { Surface } from "./surfaces";

const theme: Theme = { bg: [1, 1, 1], ink: [0, 0, 0], accent: [1, 0, 0], accentGlow: [1, 0, 0], grain: 0, glow: 0 };
const frame = { t: 0, size: { w: 100, h: 100, dpr: 1 }, theme } as unknown as FrameInput;

interface FakeSurface extends Surface {
  disposed: boolean;
  texts: string[];
}

function fakeSurface(kind: "webgl" | "canvas2d"): FakeSurface {
  const texts: string[] = [];
  const context = (
    kind === "canvas2d"
      ? {
          surface: "canvas2d",
          ctx: {
            strokeRect() {},
            fillText: (text: string) => texts.push(text),
            measureText: (text: string) => ({ width: text.length }),
          },
        }
      : { surface: "webgl" }
  ) as unknown as ModuleContext;
  const texture = { kind } as unknown as Texture;
  return {
    context,
    texture,
    texts,
    disposed: false,
    resize() {},
    begin() {},
    end() {},
    dispose() {
      this.disposed = true;
    },
  };
}

function setup(behavior: Partial<ModuleBehavior<ParamValues>>, policy: Partial<FailurePolicy> = {}) {
  const surfaces: FakeSurface[] = [];
  const calls = { disposed: 0, renders: 0 };
  const definition = defineModule<ParamValues>(
    { id: "mod.broken", slot: "hero", name: "Broken", surface: "webgl", params: {} },
    () => ({
      init() {},
      resize() {},
      render() {
        calls.renders += 1;
      },
      dispose() {
        calls.disposed += 1;
      },
      ...behavior,
    }),
  );
  const failures: ModuleFailure[] = [];
  const full: FailurePolicy = { failFast: false, onFailure: (f) => failures.push(f), ...policy };
  const binding = new SlotBinding(
    definition,
    (kind) => {
      const surface = fakeSurface(kind);
      surfaces.push(surface);
      return surface;
    },
    full,
  );
  return { binding, surfaces, calls, failures };
}

describe("SlotBinding error isolation", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("catches a render error, reports once and draws the placeholder afterwards", () => {
    const { binding, surfaces, calls, failures } = setup({
      render() {
        throw new Error("boom");
      },
    });
    return binding.init().then(() => {
      binding.resize(200, 100);
      expect(() => binding.render(frame)).not.toThrow();
      binding.render(frame);
      binding.render(frame);

      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ moduleId: "mod.broken", stage: "render", message: "boom" });
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(calls.disposed).toBe(1);
      expect(surfaces[0]?.disposed).toBe(true);
      const placeholder = surfaces[1];
      expect(placeholder?.texts).toEqual(["МОДУЛЬ УПАЛ: Broken", "МОДУЛЬ УПАЛ: Broken", "МОДУЛЬ УПАЛ: Broken"]);
      expect(binding.texture).toBe(placeholder?.texture);
    });
  });

  it("turns an init error into a drawable placeholder slot", async () => {
    const { binding, failures } = setup({
      init() {
        throw new Error("no init");
      },
    });
    await binding.init();
    expect(binding.ready).toBe(true);
    expect(failures[0]?.stage).toBe("init");
    binding.resize(50, 50);
    binding.render(frame);
    expect(binding.texture).toBeDefined();
  });

  it("isolates resize errors and a throwing dispose", async () => {
    const { binding, failures } = setup({
      resize() {
        throw new Error("bad size");
      },
      dispose() {
        throw new Error("bad dispose");
      },
    });
    await binding.init();
    expect(() => binding.resize(10, 10)).not.toThrow();
    expect(failures[0]).toMatchObject({ stage: "resize", message: "bad size" });
    expect(() => binding.dispose()).not.toThrow();
  });

  it("throws ModuleCrashError with fail-fast instead of drawing a placeholder", async () => {
    const { binding } = setup(
      {
        render() {
          throw new Error("export crash");
        },
      },
      { failFast: true },
    );
    await binding.init();
    binding.resize(10, 10);
    expect(() => binding.render(frame)).toThrow(ModuleCrashError);
  });

  it("reports a fail-fast init error through the rejected init promise", async () => {
    const { binding } = setup({ init: () => Promise.reject(new Error("late")) }, { failFast: true });
    await expect(binding.init()).rejects.toThrow(/Модуль «Broken».*init.*late/);
  });

  it("stays quiet when a stale instance fails after being disposed", async () => {
    let fail: () => void = () => undefined;
    const { binding, failures } = setup({
      init: () =>
        new Promise<void>((_, reject) => {
          fail = () => reject(new Error("late"));
        }),
    });
    const pending = binding.init();
    binding.dispose();
    fail();
    await pending;
    expect(failures).toHaveLength(0);
    expect(binding.ready).toBe(false);
  });
});
