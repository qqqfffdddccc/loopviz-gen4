import { parseMidi } from "@loopviz/engine";
import { registerMedia } from "../project/media";
import { useSourceStore } from "../state/source-store";
import { startAnalysis, type AnalysisJob } from "./analyze";
import { getAudioContext, setAnalysis, setAudioBuffer } from "./source-data";
import { transport } from "./transport";

export type FileKind = "audio" | "midi";

const AUDIO_EXTENSIONS = ["wav", "mp3", "flac", "aif", "aiff"];
const MIDI_EXTENSIONS = ["mid", "midi"];

export function classifyFile(name: string): FileKind | null {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (AUDIO_EXTENSIONS.includes(extension)) return "audio";
  if (MIDI_EXTENSIONS.includes(extension)) return "midi";
  return null;
}

let activeJob: AnalysisJob | null = null;
let generation = 0;

export interface ImportOptions {
  /** Класть копию файла в кеш медиа. Выключено при открытии проекта: файл уже оттуда. */
  register: boolean;
}

/** Отменяет идущий анализ и делает устаревшими уже запущенные импорты. */
export function cancelImports(): void {
  generation += 1;
  activeJob?.cancel();
  activeJob = null;
}

/** true, если аудио декодировано и проанализировано; false при ошибке или если импорт вытеснен новым. */
export async function importAudioBytes(name: string, readBytes: () => Promise<ArrayBuffer>, options: ImportOptions): Promise<boolean> {
  const store = useSourceStore.getState();
  const mine = ++generation;
  activeJob?.cancel();
  activeJob = null;
  store.setStatus({ kind: "decoding" });
  store.setNotice(null);

  try {
    const bytes = await readBytes();
    // decodeAudioData забирает буфер себе, поэтому в кеш уходит оригинал, а в декодер копия.
    const buffer = await getAudioContext().decodeAudioData(bytes.slice(0));
    if (mine !== generation) return false;
    const registered = options.register ? registerMedia("audio", name, bytes) : undefined;

    setAnalysis(null);
    setAudioBuffer(buffer);
    transport.attachAudio();
    useSourceStore.getState().setAudio({
      name,
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
    });

    let lastPercent = -1;
    const job = startAnalysis(buffer, (fraction) => {
      const percent = Math.floor(fraction * 100);
      if (percent === lastPercent || mine !== generation) return;
      lastPercent = percent;
      useSourceStore.getState().setStatus({ kind: "analyzing", progress: fraction });
    });
    activeJob = job;
    const analysis = await job.result;
    await registered;
    if (mine !== generation) return false;
    setAnalysis(analysis);
    useSourceStore.getState().finishAnalysis();
    return true;
  } catch (error) {
    if (mine !== generation) return false;
    const message = error instanceof Error ? error.message : String(error);
    useSourceStore.getState().setStatus({ kind: "error", message });
    useSourceStore.getState().setNotice(`Не удалось прочитать ${name}: ${message}`);
    return false;
  }
}

export async function importMidiBytes(name: string, bytes: ArrayBuffer, options: ImportOptions): Promise<boolean> {
  try {
    const model = parseMidi(bytes);
    useSourceStore.getState().setMidi(name, model);
    if (options.register) await registerMedia("midi", name, bytes);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useSourceStore.getState().setNotice(`Не удалось прочитать ${name}: ${message}`);
    return false;
  }
}

export async function importAudioFile(file: File): Promise<void> {
  await importAudioBytes(file.name, () => file.arrayBuffer(), { register: true });
}

export async function importMidiFile(file: File): Promise<void> {
  try {
    await importMidiBytes(file.name, await file.arrayBuffer(), { register: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useSourceStore.getState().setNotice(`Не удалось прочитать ${file.name}: ${message}`);
  }
}

export async function importFiles(files: readonly File[]): Promise<void> {
  const audio = files.filter((f) => classifyFile(f.name) === "audio").at(-1);
  const midi = files.filter((f) => classifyFile(f.name) === "midi").at(-1);
  if (!audio && !midi) {
    useSourceStore.getState().setNotice("Поддерживаются WAV, MP3, FLAC, AIFF и MID");
    return;
  }
  await Promise.all([audio ? importAudioFile(audio) : undefined, midi ? importMidiFile(midi) : undefined]);
}
