import { readFileSync } from "node:fs";
import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { parseMidi } from "./midi-parse";

describe("parseMidi", () => {
  it("reads tracks, tempo and time signature from a generated file", () => {
    const midi = new Midi();
    midi.header.setTempo(96);
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
    midi.addTrack().name = "";
    const lead = midi.addTrack();
    lead.name = "Lead";
    lead.addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.5 });
    lead.addNote({ midi: 62, time: 0.625, duration: 0.25, velocity: 1 });

    const model = parseMidi(midi.toArray());
    expect(model.tempo).toBe(96);
    expect(model.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(model.tracks).toEqual([{ index: 1, name: "Lead", noteCount: 2, selected: true }]);
    expect(model.notes[1]?.pitch).toBe(62);
    expect(model.notes[1]?.start).toBeCloseTo(0.625, 2);
    expect(model.notes[0]?.end).toBeCloseTo(0.5, 2);
  });

  it("parses the committed fixture", () => {
    const bytes = readFileSync(new URL("../../../fixtures/test-loop.mid", import.meta.url));
    const model = parseMidi(new Uint8Array(bytes));
    expect(model.tempo).toBe(120);
    expect(model.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(model.tracks.map((t) => t.name)).toEqual(["Chords", "Melody"]);
  });
});
