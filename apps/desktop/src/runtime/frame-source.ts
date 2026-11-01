import {
  buildFrameInput,
  buildTheme,
  createMidiQuery,
  type FrameContext,
  type MidiModel,
  type MidiQuery,
  type ThemeSettings,
} from "@loopviz/engine";
import type { FrameInput, Theme } from "@loopviz/mod-api";
import { useAppStore } from "../state/store";
import { useSourceStore } from "../state/source-store";
import { getAnalysis } from "./source-data";

/** Окно нот с запасом под самые широкие настройки MIDI-модулей: каждый берёт из него нужную часть. */
const MIDI_LOOKBEHIND_SEC = 2;
const MIDI_LOOKAHEAD_SEC = 4.5;

/** Собирает кадр из текущих данных. MIDI-индекс и палитра пересобираются только при смене входа. */
export function createFrameSource(): (t: number, size: FrameContext["size"]) => FrameInput {
  let cachedModel: MidiModel | null = null;
  let cachedOffset = 0;
  let cachedQuery: MidiQuery | null = null;
  let cachedSettings: ThemeSettings | null = null;
  let cachedGrain = -1;
  let cachedTheme: Theme | null = null;

  return (t, size) => {
    const { midi, midiOffsetMs, timeline } = useSourceStore.getState();
    if (midi !== cachedModel || midiOffsetMs !== cachedOffset) {
      cachedModel = midi;
      cachedOffset = midiOffsetMs;
      cachedQuery = midi ? createMidiQuery(midi, midiOffsetMs / 1000) : null;
    }
    const { theme: settings, post } = useAppStore.getState();
    if (!cachedTheme || settings !== cachedSettings || post.grain !== cachedGrain) {
      cachedSettings = settings;
      cachedGrain = post.grain;
      cachedTheme = buildTheme(settings, post.grain);
    }
    return buildFrameInput(t, {
      analysis: getAnalysis(),
      midi: cachedQuery,
      timeline,
      theme: cachedTheme,
      size,
      lookbehindSec: MIDI_LOOKBEHIND_SEC,
      lookaheadSec: MIDI_LOOKAHEAD_SEC,
    });
  };
}
