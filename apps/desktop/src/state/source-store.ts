import { create } from "zustand";
import {
  clampFragment,
  createTimeline,
  snapFragment,
  withTrackSelected,
  type DurationMode,
  type Fragment,
  type MidiModel,
  type Timeline,
} from "@loopviz/engine";

export type AnalysisStatus =
  | { kind: "idle" }
  | { kind: "decoding" }
  | { kind: "analyzing"; progress: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export type BpmSource = "default" | "midi" | "manual";

export interface AudioInfo {
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
}

export interface SourceState {
  audio: AudioInfo | null;
  status: AnalysisStatus;
  /** Растёт при каждом завершённом анализе: сигнал перерисовать то, что читает getAnalysis(). */
  analysisVersion: number;
  midiName: string | null;
  midi: MidiModel | null;
  midiOffsetMs: number;
  timeline: Timeline;
  bpmSource: BpmSource;
  playing: boolean;
  notice: string | null;
  setAudio(info: AudioInfo): void;
  setStatus(status: AnalysisStatus): void;
  finishAnalysis(): void;
  setMidi(name: string, model: MidiModel): void;
  toggleTrack(index: number): void;
  setMidiOffsetMs(ms: number): void;
  setBpm(bpm: number): void;
  setBeatsPerBar(beats: number): void;
  setSnap(snap: boolean): void;
  setFragment(fragment: Fragment): void;
  setDuration(duration: DurationMode): void;
  setPlaying(playing: boolean): void;
  setNotice(notice: string | null): void;
}

type StateSlice = Pick<SourceState, "audio" | "midi" | "timeline">;

export function sourceExtent(state: StateSlice): number | null {
  if (state.audio) return state.audio.duration;
  const last = state.midi?.notes.reduce((max, n) => Math.max(max, n.end), 0) ?? 0;
  return last > 0 ? last : null;
}

function fitFragment(timeline: Timeline, fragment: Fragment, extent: number | null): Fragment {
  if (extent === null) return fragment;
  return timeline.snapToBars ? snapFragment(timeline, fragment, extent) : clampFragment(fragment, extent);
}

function refit(state: StateSlice, timeline: Timeline, fragment?: Fragment): Timeline {
  const extent = sourceExtent(state);
  const wanted = fragment ?? (extent === null ? timeline.fragment : { startSec: 0, endSec: extent });
  return { ...timeline, fragment: fitFragment(timeline, wanted, extent) };
}

export const useSourceStore = create<SourceState>()((set) => ({
  audio: null,
  status: { kind: "idle" },
  analysisVersion: 0,
  midiName: null,
  midi: null,
  midiOffsetMs: 0,
  timeline: createTimeline(),
  bpmSource: "default",
  playing: false,
  notice: null,
  setAudio: (info) =>
    set((s) => {
      const next = { ...s, audio: info };
      return { audio: info, notice: null, timeline: refit(next, s.timeline) };
    }),
  setStatus: (status) => set({ status }),
  finishAnalysis: () => set((s) => ({ status: { kind: "ready" }, analysisVersion: s.analysisVersion + 1 })),
  setMidi: (name, model) =>
    set((s) => {
      const bpm = model.tempo ?? s.timeline.bpm;
      const beatsPerBar = model.timeSignature?.numerator ?? s.timeline.beatsPerBar;
      const timeline = { ...s.timeline, bpm, beatsPerBar };
      const next = { ...s, midi: model };
      return {
        midi: model,
        midiName: name,
        notice: null,
        bpmSource: model.tempo === null ? s.bpmSource : "midi",
        timeline: refit(next, timeline, s.audio ? timeline.fragment : undefined),
      };
    }),
  toggleTrack: (index) =>
    set((s) => {
      const track = s.midi?.tracks.find((t) => t.index === index);
      return s.midi && track ? { midi: withTrackSelected(s.midi, index, !track.selected) } : {};
    }),
  setMidiOffsetMs: (ms) => set({ midiOffsetMs: ms }),
  setBpm: (bpm) =>
    set((s) => {
      const timeline = { ...s.timeline, bpm };
      return { bpmSource: "manual", timeline: refit(s, timeline, timeline.fragment) };
    }),
  setBeatsPerBar: (beats) =>
    set((s) => {
      const timeline = { ...s.timeline, beatsPerBar: beats };
      return { timeline: refit(s, timeline, timeline.fragment) };
    }),
  setSnap: (snap) =>
    set((s) => {
      const timeline = { ...s.timeline, snapToBars: snap };
      return { timeline: refit(s, timeline, timeline.fragment) };
    }),
  setFragment: (fragment) =>
    set((s) => ({ timeline: { ...s.timeline, fragment: fitFragment(s.timeline, fragment, sourceExtent(s)) } })),
  setDuration: (duration) => set((s) => ({ timeline: { ...s.timeline, duration } })),
  setPlaying: (playing) => set({ playing }),
  setNotice: (notice) => set({ notice }),
}));
