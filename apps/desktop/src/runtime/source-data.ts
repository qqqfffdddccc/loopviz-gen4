import type { AudioAnalysis } from "@loopviz/engine";

/** Тяжёлые данные источника лежат вне React и zustand: превью и транспорт читают их напрямую. */
let audioContext: AudioContext | null = null;
let audioBuffer: AudioBuffer | null = null;
let analysis: AudioAnalysis | null = null;

export function getAudioContext(): AudioContext {
  audioContext ??= new AudioContext();
  return audioContext;
}

export function getAudioBuffer(): AudioBuffer | null {
  return audioBuffer;
}

export function setAudioBuffer(buffer: AudioBuffer | null): void {
  audioBuffer = buffer;
}

export function getAnalysis(): AudioAnalysis | null {
  return analysis;
}

export function setAnalysis(value: AudioAnalysis | null): void {
  analysis = value;
}
