import { useRef, type ChangeEvent } from "react";
import { assertNever } from "@loopviz/mod-api";
import { importAudioFile, importMidiFile } from "../runtime/importers";
import { useSourceStore, type AnalysisStatus } from "../state/source-store";
import { Checkbox } from "../ui/Checkbox";
import { NumberField } from "../ui/NumberField";
import { Section } from "../ui/Section";
import { Slider } from "../ui/Slider";


function progressBar(fraction: number): string {
  const cells = 16;
  const filled = Math.round(fraction * cells);
  return `[${"█".repeat(filled)}${"░".repeat(cells - filled)}] ${Math.round(fraction * 100)}%`;
}

function statusText(status: AnalysisStatus): string | null {
  switch (status.kind) {
    case "idle":
      return null;
    case "decoding":
      return "ДЕКОДИРОВАНИЕ...";
    case "analyzing":
      return `АНАЛИЗ ${progressBar(status.progress)}`;
    case "ready":
      return "АНАЛИЗ ГОТОВ";
    case "error":
      return "ОШИБКА";
    default:
      return assertNever(status);
  }
}

function FileButton({ label, accept, onFile }: { label: string; accept: string; onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handle = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.target.value = "";
  };
  return (
    <>
      <button type="button" className="file-button" onClick={() => inputRef.current?.click()}>
        [+] {label}
      </button>
      <input ref={inputRef} type="file" accept={accept} hidden onChange={handle} />
    </>
  );
}

function AudioBlock() {
  const audio = useSourceStore((s) => s.audio);
  const status = useSourceStore((s) => s.status);
  const text = statusText(status);
  return (
    <div className="source-block">
      <FileButton label="АУДИО" accept=".wav,.mp3,.flac,.aif,.aiff,audio/*" onFile={(f) => void importAudioFile(f)} />
      {audio ? (
        <p className="muted">
          {audio.name}
          <br />
          {audio.duration.toFixed(2)} с · {audio.sampleRate} Гц · {audio.channels} кан.
        </p>
      ) : (
        <p className="muted">WAV MP3 FLAC AIFF, можно перетащить в окно</p>
      )}
      {text ? <p className="status">{text}</p> : null}
    </div>
  );
}

function MidiBlock() {
  const midiName = useSourceStore((s) => s.midiName);
  const midi = useSourceStore((s) => s.midi);
  const toggleTrack = useSourceStore((s) => s.toggleTrack);
  return (
    <div className="source-block">
      <FileButton label="MIDI" accept=".mid,.midi,audio/midi" onFile={(f) => void importMidiFile(f)} />
      {midi ? (
        <>
          <p className="muted">{midiName}</p>
          {midi.tracks.map((track) => (
            <Checkbox
              key={track.index}
              checked={track.selected}
              label={`${track.name} (${track.noteCount})`}
              onChange={() => toggleTrack(track.index)}
            />
          ))}
        </>
      ) : (
        <p className="muted">.mid, можно перетащить в окно</p>
      )}
    </div>
  );
}

function TimingBlock() {
  const bpm = useSourceStore((s) => s.timeline.bpm);
  const beatsPerBar = useSourceStore((s) => s.timeline.beatsPerBar);
  const bpmSource = useSourceStore((s) => s.bpmSource);
  const offset = useSourceStore((s) => s.midiOffsetMs);
  const setBpm = useSourceStore((s) => s.setBpm);
  const setBeatsPerBar = useSourceStore((s) => s.setBeatsPerBar);
  const setOffset = useSourceStore((s) => s.setMidiOffsetMs);
  return (
    <div className="source-block">
      <NumberField
        label={`BPM${bpmSource === "midi" ? " (ИЗ MIDI)" : ""}`}
        value={bpm}
        min={20}
        max={300}
        step={0.01}
        onCommit={setBpm}
      />
      <NumberField label="ДОЛЕЙ В ТАКТЕ" value={beatsPerBar} min={1} max={16} onCommit={setBeatsPerBar} />
      <Slider
        label="СМЕЩЕНИЕ MIDI"
        value={offset}
        min={-1000}
        max={1000}
        step={1}
        format={(v) => `${v} мс`}
        onChange={setOffset}
      />
    </div>
  );
}

function Notice() {
  const notice = useSourceStore((s) => s.notice);
  return notice ? <p className="notice">{notice}</p> : null;
}

export function SourceSection() {
  return (
    <Section title="ИСТОЧНИК">
      <AudioBlock />
      <MidiBlock />
      <TimingBlock />
      <Notice />
    </Section>
  );
}

