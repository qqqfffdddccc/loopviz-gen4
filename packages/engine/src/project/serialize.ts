import { assertNever } from "@loopviz/mod-api";
import { PROJECT_FORMAT, PROJECT_VERSION, type MediaRef, type ProjectFile, type ProjectState } from "./types";

const round2 = (value: number): number => Math.round(value * 100) / 100;

function durationFields(state: ProjectState): ProjectFile["timeline"] {
  const { fragment, snap, duration } = state.timeline;
  const base = { fragment, snap };
  switch (duration.mode) {
    case "repeats":
      return {
        ...base,
        durationMode: "repeats",
        repeats: duration.repeats,
        seconds: round2(Math.max(0, fragment.endSec - fragment.startSec) * duration.repeats),
      };
    case "seconds":
      return { ...base, durationMode: "seconds", repeats: 1, seconds: duration.seconds };
    default:
      return assertNever(duration);
  }
}

function mediaFields(state: ProjectState): ProjectFile["media"] {
  const media: { audio?: MediaRef; midi?: MediaRef } = {};
  if (state.media.audio) media.audio = state.media.audio;
  if (state.media.midi) media.midi = state.media.midi;
  return media;
}

export function serializeProject(state: ProjectState, savedAt: string): ProjectFile {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt,
    name: state.name,
    media: mediaFields(state),
    source: state.source,
    timeline: durationFields(state),
    modules: state.modules,
    layout: state.layout,
    theme: state.theme,
    post: state.post,
    export: state.export,
  };
}

export function projectToJson(file: ProjectFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
