import { analysisBuffers, analyzeAudio } from "@loopviz/engine";
import type { AnalysisMessage, AnalysisRequest } from "./analysis-protocol";

function post(message: AnalysisMessage, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const { channels, sampleRate } = event.data;
  try {
    const analysis = analyzeAudio(channels, sampleRate, {
      onProgress: (fraction) => post({ type: "progress", fraction }),
    });
    post({ type: "done", analysis }, analysisBuffers(analysis));
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
