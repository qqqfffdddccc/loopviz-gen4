import { writeFileSync } from "node:fs";
import { Midi } from "@tonejs/midi";

const BPM = 120;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

const midi = new Midi();
midi.header.setTempo(BPM);
midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });

const chords = midi.addTrack();
chords.name = "Chords";
const progression = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 55, 64],
  [55, 59, 62],
];
progression.forEach((chord, bar) => {
  for (const pitch of chord) {
    chords.addNote({ midi: pitch, time: bar * BAR, duration: BAR * 0.95, velocity: 0.6 });
  }
});

const melody = midi.addTrack();
melody.name = "Melody";
const phrase = [76, 79, 81, 79, 76, 72, 74, 76];
for (let bar = 0; bar < 4; bar++) {
  phrase.forEach((pitch, step) => {
    const shifted = bar === 3 ? pitch - 2 : pitch;
    melody.addNote({
      midi: shifted,
      time: bar * BAR + step * (BEAT / 2),
      duration: BEAT / 2 - 0.02,
      velocity: 0.7 + 0.03 * (step % 3),
    });
  });
}

writeFileSync(new URL("./test-loop.mid", import.meta.url), midi.toArray());
