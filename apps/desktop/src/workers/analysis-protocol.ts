import type { AudioAnalysis } from "@loopviz/engine";

export interface AnalysisRequest {
  channels: Float32Array[];
  sampleRate: number;
}

export type AnalysisMessage =
  | { type: "progress"; fraction: number }
  | { type: "done"; analysis: AudioAnalysis }
  | { type: "error"; message: string };
