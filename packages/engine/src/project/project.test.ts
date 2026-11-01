import { describe, expect, it } from "vitest";
import { defaultProjectState } from "./defaults";
import { migrateProject } from "./migrate";
import { parseProject } from "./parse";
import { ProjectError } from "./read";
import { projectToJson, serializeProject } from "./serialize";
import { PROJECT_FORMAT, PROJECT_VERSION, type ProjectState } from "./types";

const HASH = "a".repeat(64);
const SAVED_AT = "2026-11-01T12:00:00.000Z";

function sampleState(): ProjectState {
  const base = defaultProjectState();
  return {
    ...base,
    name: "ПЕТЛЯ 1",
    media: {
      audio: { name: "loop.wav", hash: HASH, ext: "wav", size: 1234 },
      midi: { name: "loop.mid", hash: "b".repeat(64), ext: "mid", size: 99 },
    },
    source: { bpm: 128.5, beatsPerBar: 3, midiOffsetMs: -40, selectedTracks: [0, 2] },
    timeline: { fragment: { startSec: 2, endSec: 6 }, snap: false, duration: { mode: "repeats", repeats: 3 } },
    modules: {
      selected: { hero: "orb", midi: null, wave: "dots", overlay: "text" },
      params: {
        hero: { orb: { size: 0.4, label: "x", on: true }, "retired-mod": { speed: 2 } },
        midi: {},
        wave: { dots: { count: 12 } },
        overlay: { text: { text: "ПРИВЕТ" } },
      },
    },
    layout: {
      ...base.layout,
      layout: { order: ["midi", "hero", "wave"], ratios: [0.2, 0.5, 0.3], hidden: ["wave"] },
      gap: 4,
      feather: 0.1,
    },
    export: { resolution: "4k", fps: 30, codec: "hevc", fileName: "clip.mp4" },
  };
}

function roundtrip(state: ProjectState): ProjectState {
  return parseProject(projectToJson(serializeProject(state, SAVED_AT))).state;
}

describe("project roundtrip", () => {
  it("returns the same state and the same JSON", () => {
    const state = sampleState();
    const parsed = roundtrip(state);
    expect(parsed).toEqual(state);
    expect(projectToJson(serializeProject(parsed, SAVED_AT))).toBe(projectToJson(serializeProject(state, SAVED_AT)));
  });

  it("keeps savedAt and writes format and version", () => {
    const file = serializeProject(sampleState(), SAVED_AT);
    expect(file.format).toBe(PROJECT_FORMAT);
    expect(file.version).toBe(PROJECT_VERSION);
    expect(parseProject(projectToJson(file)).savedAt).toBe(SAVED_AT);
  });

  it("stores both repeats and seconds and restores the seconds mode", () => {
    const state: ProjectState = { ...sampleState(), timeline: { ...sampleState().timeline, duration: { mode: "seconds", seconds: 11.5 } } };
    const file = serializeProject(state, SAVED_AT);
    expect(file.timeline.durationMode).toBe("seconds");
    expect(file.timeline.seconds).toBe(11.5);
    expect(roundtrip(state).timeline.duration).toEqual({ mode: "seconds", seconds: 11.5 });
  });

  it("omits absent media", () => {
    const file = serializeProject(defaultProjectState(), SAVED_AT);
    expect(file.media).toEqual({});
    expect(roundtrip(defaultProjectState()).media).toEqual({ audio: null, midi: null });
  });
});

describe("module params", () => {
  it("keeps params of unselected and unknown module ids", () => {
    const parsed = roundtrip(sampleState());
    expect(parsed.modules.params.hero["retired-mod"]).toEqual({ speed: 2 });
    expect(parsed.modules.params.hero["orb"]).toEqual({ size: 0.4, label: "x", on: true });
  });

  it("keeps an unknown selected module id", () => {
    const state = sampleState();
    state.modules.selected.hero = "mod-that-is-gone";
    expect(roundtrip(state).modules.selected.hero).toBe("mod-that-is-gone");
  });

  it("rejects non-primitive param values", () => {
    const file = JSON.parse(projectToJson(serializeProject(sampleState(), SAVED_AT))) as Record<string, unknown>;
    (file["modules"] as { params: { hero: { orb: Record<string, unknown> } } }).params.hero.orb["size"] = { nested: 1 };
    expect(() => parseProject(file)).toThrow(/modules\.params\.hero\.orb\.size/);
  });
});

describe("missing and unknown fields", () => {
  const minimal = { format: PROJECT_FORMAT, version: 1 };

  it("fills defaults for a minimal file", () => {
    expect(parseProject(minimal).state).toEqual(defaultProjectState());
  });

  it("takes defaults from the caller", () => {
    const defaults = defaultProjectState();
    defaults.modules.selected.hero = "orb";
    expect(parseProject(minimal, defaults).state.modules.selected.hero).toBe("orb");
  });

  it("ignores unknown fields", () => {
    const file = { ...minimal, future: { a: 1 }, theme: { glow: 0.2, extra: true }, modules: { selected: { hero: "orb", ghost: "x" } } };
    const { state } = parseProject(file);
    expect(state.theme.glow).toBe(0.2);
    expect(state.modules.selected.hero).toBe("orb");
  });

  it("merges a partial section with defaults", () => {
    const { state } = parseProject({ ...minimal, post: { grain: 0.9, slotGlow: { hero: 0.1 } } });
    const defaults = defaultProjectState();
    expect(state.post.grain).toBe(0.9);
    expect(state.post.vignette).toBe(defaults.post.vignette);
    expect(state.post.slotGlow.hero).toBe(0.1);
    expect(state.post.slotGlow.midi).toBe(defaults.post.slotGlow.midi);
  });

  it("clamps numbers that are out of range", () => {
    const { state } = parseProject({ ...minimal, source: { bpm: 5000, beatsPerBar: 99 }, theme: { glow: 4 } });
    expect(state.source.bpm).toBe(300);
    expect(state.source.beatsPerBar).toBe(16);
    expect(state.theme.glow).toBe(1);
  });

  it("falls back to the default name when blank", () => {
    expect(parseProject({ ...minimal, name: "   " }).state.name).toBe(defaultProjectState().name);
  });
});

describe("bad input", () => {
  const minimal = { format: PROJECT_FORMAT, version: 1 };

  it.each([
    ["not json", "{oops", /JSON/],
    ["not an object", "[1,2]", /JSON-объектом/],
    ["wrong format", JSON.stringify({ format: "other", version: 1 }), /format/],
    ["missing version", JSON.stringify({ format: PROJECT_FORMAT }), /version/],
    ["fractional version", JSON.stringify({ format: PROJECT_FORMAT, version: 1.5 }), /version/],
    ["future version", JSON.stringify({ format: PROJECT_FORMAT, version: 99 }), /более новой/],
  ])("rejects %s", (_label, input, pattern) => {
    expect(() => parseProject(input)).toThrow(pattern);
    expect(() => parseProject(input)).toThrow(ProjectError);
  });

  it.each([
    ["bpm as string", { source: { bpm: "fast" } }, /source\.bpm/],
    ["layout order broken", { layout: { layout: { order: ["hero"], ratios: [1], hidden: [] } } }, /layout\.layout/],
    ["bad hash", { media: { audio: { name: "a.wav", hash: "xyz", ext: "wav", size: 1 } } }, /media\.audio\.hash/],
    ["midi ext on audio", { media: { audio: { name: "a.mid", hash: HASH, ext: "mid", size: 1 } } }, /media\.audio\.ext/],
    ["path traversal ext", { media: { midi: { name: "a", hash: HASH, ext: "../x", size: 1 } } }, /media\.midi\.ext/],
    ["resolution", { export: { resolution: "8k" } }, /export\.resolution/],
    ["selected module type", { modules: { selected: { hero: 5 } } }, /modules\.selected\.hero/],
    ["track index", { source: { selectedTracks: [0, -1] } }, /source\.selectedTracks\.1/],
    ["section not object", { theme: 7 }, /theme/],
  ])("rejects %s with the field path", (_label, patch, pattern) => {
    expect(() => parseProject({ ...minimal, ...patch })).toThrow(pattern);
  });

  it("does not turn NaN-like values into numbers", () => {
    expect(() => parseProject({ ...minimal, post: { grain: null } })).toThrow(/post\.grain/);
  });
});

describe("migration hook", () => {
  it("runs steps in order up to the current version", () => {
    const steps = {
      1: (raw: Record<string, unknown>) => ({ ...raw, name: `${String(raw["name"])}+1` }),
      2: (raw: Record<string, unknown>) => ({ ...raw, name: `${String(raw["name"])}+2` }),
    };
    const result = migrateProject({ format: PROJECT_FORMAT, version: 1, name: "n" }, 3, steps);
    expect(result["name"]).toBe("n+1+2");
    expect(result["version"]).toBe(3);
  });

  it("fails when a step is missing", () => {
    expect(() => migrateProject({ format: PROJECT_FORMAT, version: 1 }, 2, {})).toThrow(/миграции/);
  });
});
