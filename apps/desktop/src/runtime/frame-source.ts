import { DEFAULT_THEME, buildFrameInput, createMidiQuery, type FrameContext, type MidiModel, type MidiQuery } from "@loopviz/engine";
import type { FrameInput } from "@loopviz/mod-api";
import { useSourceStore } from "../state/source-store";
import { getAnalysis } from "./source-data";

/** Собирает кадр из текущих данных. MIDI-индекс пересобирается только при смене модели или смещения. */
export function createFrameSource(): (t: number, size: FrameContext["size"]) => FrameInput {
  let cachedModel: MidiModel | null = null;
  let cachedOffset = 0;
  let cachedQuery: MidiQuery | null = null;

  return (t, size) => {
    const { midi, midiOffsetMs, timeline } = useSourceStore.getState();
    if (midi !== cachedModel || midiOffsetMs !== cachedOffset) {
      cachedModel = midi;
      cachedOffset = midiOffsetMs;
      cachedQuery = midi ? createMidiQuery(midi, midiOffsetMs / 1000) : null;
    }
    return buildFrameInput(t, { analysis: getAnalysis(), midi: cachedQuery, timeline, theme: DEFAULT_THEME, size });
  };
}
