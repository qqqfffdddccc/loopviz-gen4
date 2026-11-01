import { barLines, secondsPerBar, secondsPerBeat, type Fragment, type Timeline } from "@loopviz/engine";

export interface WaveformView {
  width: number;
  height: number;
  dpr: number;
  extent: number | null;
  peaks: Float32Array | null;
  timeline: Timeline;
  /** Выделение в процессе перетаскивания, ещё не записанное в стор. */
  draft: Fragment | null;
  /** Время исходника под плейхедом. */
  playheadSec: number;
  /** CSS-цвет акцента темы для выделения фрагмента. */
  accent: string;
}

const INK = "#2a2a2e";
const MUTED = "#8a877f";
const LINE = "#cfcabd";
const MIN_LINE_PX = 7;
const MIN_LABEL_PX = 42;

export function timeAtPixel(x: number, width: number, extent: number): number {
  return Math.min(Math.max(x / Math.max(1, width), 0), 1) * extent;
}

function formatClock(sec: number): string {
  const whole = Math.floor(sec);
  const tenths = Math.floor((sec - whole) * 10);
  const minutes = Math.floor(whole / 60);
  return `${String(minutes).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}.${tenths}`;
}

function drawPeaks(ctx: CanvasRenderingContext2D, view: WaveformView, extent: number, fragment: Fragment): void {
  const { width, height, peaks } = view;
  if (!peaks) return;
  const points = peaks.length / 2;
  const mid = height / 2;
  const half = height * 0.42;
  const fromPx = (fragment.startSec / extent) * width;
  const toPx = (fragment.endSec / extent) * width;
  for (let x = 0; x < width; x++) {
    const from = Math.floor((x / width) * points);
    const to = Math.max(from + 1, Math.floor(((x + 1) / width) * points));
    let min = 0;
    let max = 0;
    for (let i = from; i < to; i++) {
      min = Math.min(min, peaks[i * 2] ?? 0);
      max = Math.max(max, peaks[i * 2 + 1] ?? 0);
    }
    ctx.fillStyle = x >= fromPx && x <= toPx ? INK : LINE;
    ctx.fillRect(x, mid - max * half, 1, Math.max(1, (max - min) * half));
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, view: WaveformView, extent: number): void {
  const { width, height, timeline } = view;
  const pxPerBar = (secondsPerBar(timeline) / extent) * width;
  const pxPerBeat = (secondsPerBeat(timeline) / extent) * width;
  if (pxPerBar < 1) return;

  if (pxPerBeat >= MIN_LINE_PX) {
    ctx.fillStyle = LINE;
    for (const sec of barLines({ bpm: timeline.bpm, beatsPerBar: 1 }, 0, extent)) {
      ctx.fillRect(Math.round((sec / extent) * width), height - 6, 1, 6);
    }
  }

  const everyBars = 2 ** Math.max(0, Math.ceil(Math.log2(MIN_LINE_PX / pxPerBar)));
  const labelEvery = 2 ** Math.max(0, Math.ceil(Math.log2(MIN_LABEL_PX / (pxPerBar * everyBars)))) * everyBars;
  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.textBaseline = "top";
  for (const sec of barLines(timeline, 0, extent, everyBars)) {
    const x = Math.round((sec / extent) * width);
    ctx.fillStyle = MUTED;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x, 0, 1, height);
    ctx.globalAlpha = 1;
    const barIndex = Math.round(sec / secondsPerBar(timeline));
    if (barIndex % labelEvery === 0) ctx.fillText(String(barIndex + 1), x + 3, 2);
  }
}

export function drawWaveform(ctx: CanvasRenderingContext2D, view: WaveformView): void {
  const { width, height, dpr, extent } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.textBaseline = "middle";
  ctx.font = "11px 'JetBrains Mono', monospace";

  if (extent === null) {
    ctx.fillStyle = MUTED;
    ctx.fillText("ЗАГРУЗИТЕ АУДИО ИЛИ MIDI", 12, height / 2);
    return;
  }

  const fragment = view.draft ?? view.timeline.fragment;
  drawPeaks(ctx, view, extent, fragment);
  drawGrid(ctx, view, extent);

  const left = (fragment.startSec / extent) * width;
  const right = (fragment.endSec / extent) * width;
  ctx.fillStyle = view.accent;
  ctx.globalAlpha = 0.1;
  ctx.fillRect(left, 0, right - left, height);
  ctx.globalAlpha = 1;
  ctx.fillRect(Math.round(left), 0, 2, height);
  ctx.fillRect(Math.round(right) - 1, 0, 2, height);

  const playX = Math.round((view.playheadSec / extent) * width);
  ctx.fillStyle = INK;
  ctx.fillRect(playX, 0, 1, height);

  ctx.textBaseline = "bottom";
  ctx.textAlign = "right";
  ctx.fillStyle = INK;
  ctx.fillText(`${formatClock(view.playheadSec)} / ${formatClock(extent)}`, width - 6, height - 3);
  ctx.textAlign = "left";
}
