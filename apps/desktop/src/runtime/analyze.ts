import { assertNever } from "@loopviz/mod-api";
import type { AudioAnalysis } from "@loopviz/engine";
import type { AnalysisMessage, AnalysisRequest } from "../workers/analysis-protocol";

export interface AnalysisJob {
  result: Promise<AudioAnalysis>;
  cancel(): void;
}

export function startAnalysis(buffer: AudioBuffer, onProgress: (fraction: number) => void): AnalysisJob {
  const worker = new Worker(new URL("../workers/analysis.worker.ts", import.meta.url), { type: "module" });
  let rejectJob: (reason: Error) => void = () => {};

  const result = new Promise<AudioAnalysis>((resolve, reject) => {
    rejectJob = reject;
    worker.onmessage = (event: MessageEvent<AnalysisMessage>) => {
      const message = event.data;
      switch (message.type) {
        case "progress":
          onProgress(message.fraction);
          break;
        case "done":
          worker.terminate();
          resolve(message.analysis);
          break;
        case "error":
          worker.terminate();
          reject(new Error(message.message));
          break;
        default:
          assertNever(message);
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Ошибка воркера анализа"));
    };

    // getChannelData отдаёт view на буфер AudioBuffer, поэтому в воркер уходят копии.
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i).slice());
    const request: AnalysisRequest = { channels, sampleRate: buffer.sampleRate };
    worker.postMessage(request, { transfer: channels.map((c) => c.buffer) });
  });

  return {
    result,
    cancel() {
      worker.terminate();
      rejectJob(new Error("cancelled"));
    },
  };
}
