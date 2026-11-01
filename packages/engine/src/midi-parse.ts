import { Midi } from "@tonejs/midi";
import { createMidiModel, type MidiModel, type TimeSignature } from "./midi-model";

export function parseMidi(bytes: ArrayBuffer | Uint8Array): MidiModel {
  const midi = new Midi(bytes);
  const tempo = midi.header.tempos[0]?.bpm ?? null;
  const signature = midi.header.timeSignatures[0]?.timeSignature;
  const timeSignature: TimeSignature | null =
    signature && signature[0] && signature[1] ? { numerator: signature[0], denominator: signature[1] } : null;

  return createMidiModel({
    tempo: tempo === null ? null : Math.round(tempo * 100) / 100,
    timeSignature,
    tracks: midi.tracks.map((track, index) => ({
      index,
      name: track.name || `TRACK ${index + 1}`,
      notes: track.notes.map((n) => ({
        pitch: n.midi,
        velocity: n.velocity,
        start: n.time,
        end: n.time + n.duration,
        track: index,
      })),
    })),
  });
}
