import { mapVideoTimeToSourceTime } from "@loopviz/engine";
import { useSourceStore } from "../state/source-store";
import { getAudioBuffer, getAudioContext } from "./source-data";

const now = (): number => performance.now() / 1000;

/**
 * Часы превью. С аудио время идёт от AudioContext.currentTime, без аудио от performance.now.
 * Время ролика t копится от `baseT`; при паузе оно заморожено.
 */
class Transport {
  private node: AudioBufferSourceNode | null = null;
  private running = true;
  private baseT = 0;
  private startedAt = now();

  constructor() {
    useSourceStore.subscribe((state, previous) => {
      if (state.timeline.fragment !== previous.timeline.fragment) this.restartFromStart();
    });
  }

  /** Новое аудио: превью встаёт на паузу в нуле. Без аудио часы свободно идут. */
  attachAudio(): void {
    this.stopNode();
    this.baseT = 0;
    this.running = false;
    useSourceStore.getState().setPlaying(false);
  }

  getTime(): number {
    if (!this.running) return this.baseT;
    const elapsed = this.clock() - this.startedAt;
    return this.baseT + Math.max(0, elapsed - this.latency());
  }

  async play(): Promise<void> {
    if (this.running) return;
    const buffer = getAudioBuffer();
    if (buffer) {
      const context = getAudioContext();
      await context.resume();
      if (this.running || getAudioBuffer() !== buffer) return;
      this.startNode(buffer, context);
    }
    this.startedAt = this.clock();
    this.running = true;
    useSourceStore.getState().setPlaying(true);
  }

  pause(): void {
    if (!this.running) return;
    this.baseT = this.getTime();
    this.stopNode();
    this.running = false;
    useSourceStore.getState().setPlaying(false);
  }

  stop(): void {
    this.stopNode();
    this.baseT = 0;
    this.running = false;
    useSourceStore.getState().setPlaying(false);
  }

  private clock(): number {
    return getAudioBuffer() ? getAudioContext().currentTime : now();
  }

  private latency(): number {
    if (!getAudioBuffer()) return 0;
    const context = getAudioContext();
    return context.outputLatency || context.baseLatency || 0;
  }

  /** Фрагмент изменился во время воспроизведения: позиция внутри старого фрагмента потеряла смысл, играем с начала. */
  private restartFromStart(): void {
    const buffer = getAudioBuffer();
    if (!buffer) return;
    this.baseT = 0;
    if (!this.running) return;
    this.stopNode();
    const context = getAudioContext();
    this.startNode(buffer, context);
    this.startedAt = this.clock();
  }

  private startNode(buffer: AudioBuffer, context: AudioContext): void {
    const { timeline } = useSourceStore.getState();
    let loopStart = timeline.fragment.startSec;
    let loopEnd = Math.min(timeline.fragment.endSec, buffer.duration);
    if (loopEnd <= loopStart) {
      loopStart = 0;
      loopEnd = buffer.duration;
    }
    const offset = Math.min(Math.max(mapVideoTimeToSourceTime(timeline, this.baseT), loopStart), loopEnd - 1e-3);

    const node = context.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    node.loopStart = loopStart;
    node.loopEnd = loopEnd;
    node.connect(context.destination);
    this.startedAt = context.currentTime;
    node.start(0, offset);
    this.node = node;
  }

  private stopNode(): void {
    if (!this.node) return;
    this.node.stop();
    this.node.disconnect();
    this.node = null;
  }
}

export const transport = new Transport();
