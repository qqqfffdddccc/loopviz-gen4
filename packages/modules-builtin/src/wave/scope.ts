import { clamp, defineModule, type Canvas2DModuleContext, type ModuleContext, type ParamSchema } from "@loopviz/mod-api";
import { css, fadeEdges, requireCanvas2d, strokeLine, unitOf } from "../common/canvas";
import { fragmentProgress, peakGain, sliceWrappedPeaks } from "./peaks";

type ScopeParams = {
  window: number;
  amplitude: number;
  line: number;
  glow: number;
  trail: number;
  smooth: number;
};

const params: ParamSchema<ScopeParams> = {
  window: { kind: "slider", label: "ОКНО, ДОЛЯ ФРАГМЕНТА", min: 0.04, max: 0.6, step: 0.01, default: 0.2 },
  amplitude: { kind: "slider", label: "АМПЛИТУДА", min: 0.2, max: 1, step: 0.05, default: 0.75 },
  line: { kind: "slider", label: "ТОЛЩИНА ЛИНИИ", min: 1, max: 8, step: 0.25, default: 3 },
  glow: { kind: "slider", label: "СВЕЧЕНИЕ", min: 0, max: 1, step: 0.05, default: 0.7 },
  trail: { kind: "slider", label: "ШЛЕЙФ, КОПИЙ", min: 0, max: 8, step: 1, default: 4 },
  smooth: { kind: "slider", label: "СГЛАЖИВАНИЕ", min: 0, max: 1, step: 0.05, default: 0.5 },
};

const COLUMNS = 360;
const TRAIL_STEP = 0.35;

/** Знакопеременная кривая из пар [min, max]: чётные столбцы по максимуму, нечётные по минимуму. */
export function scopeSamples(pairs: Float32Array, smooth: number, gain = 1): Float32Array {
  const columns = pairs.length / 2;
  const raw = new Float32Array(columns);
  for (let i = 0; i < columns; i++) raw[i] = Math.max(-1, Math.min(1, ((i % 2 === 0 ? pairs[i * 2 + 1] : pairs[i * 2]) ?? 0) * gain));
  const side = smooth / 3;
  const result = new Float32Array(columns);
  for (let i = 0; i < columns; i++) {
    const prev = raw[Math.max(0, i - 1)] ?? 0;
    const next = raw[Math.min(columns - 1, i + 1)] ?? 0;
    result[i] = (raw[i] ?? 0) * (1 - side * 2) + (prev + next) * side;
  }
  return result;
}

function tracePath(values: Float32Array, w: number, mid: number, half: number): Path2D {
  const path = new Path2D();
  const last = values.length - 1;
  path.moveTo(0, mid - (values[0] ?? 0) * half);
  for (let i = 1; i <= last; i++) {
    const x = (i / last) * w;
    const prevX = ((i - 1) / last) * w;
    const mx = (x + prevX) / 2;
    const my = mid - (((values[i] ?? 0) + (values[i - 1] ?? 0)) / 2) * half;
    path.quadraticCurveTo(prevX, mid - (values[i - 1] ?? 0) * half, mx, my);
  }
  return path;
}

export const waveScope = defineModule<ScopeParams>(
  { id: "builtin.wave.scope", slot: "wave", name: "Scope", surface: "canvas2d", params },
  () => {
    let c2d: Canvas2DModuleContext | null = null;
    return {
      init(ctx: ModuleContext) {
        c2d = requireCanvas2d(ctx, "wave.scope");
      },
      resize() {},
      render(frame, p) {
        if (!c2d) return;
        const { ctx, canvas } = c2d;
        const { width: w, height: h } = canvas;
        const u = unitOf(frame);
        const { theme } = frame;
        const mid = h / 2;
        const half = (h / 2 - 12 * u) * p.amplitude;
        const lineWidth = Math.max(0.75, p.line * u);
        const center = fragmentProgress(frame.wave.progress, frame.wave.fragment);
        const gain = peakGain(frame.wave.peaks);
        const view = (offset: number): Float32Array =>
          scopeSamples(
            sliceWrappedPeaks(frame.wave.peaks, frame.wave.fragment, { from: center + offset - p.window / 2, to: center + offset + p.window / 2 }, COLUMNS),
            p.smooth,
            gain,
          );

        strokeLine(ctx, [0, mid], [w, mid], css(theme.ink, 0.16), Math.max(0.75, 1.5 * u));

        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        const copies = Math.round(p.trail);
        for (let k = copies; k >= 1; k--) {
          ctx.lineWidth = Math.max(0.75, lineWidth * 0.4);
          ctx.strokeStyle = css(theme.ink, 0.22 * (1 - k / (copies + 1)) ** 2);
          ctx.stroke(tracePath(view(-k * p.window * TRAIL_STEP * 0.5), w, mid, half));
        }

        const path = tracePath(view(0), w, mid, half);
        ctx.save();
        ctx.shadowColor = css(theme.accentGlow, clamp(p.glow, 0, 1));
        ctx.shadowBlur = 26 * u * p.glow;
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = css(theme.accent, 0.95);
        ctx.stroke(path);
        ctx.restore();

        fadeEdges(ctx, { w, h }, { left: w * 0.22, right: w * 0.22 });
        ctx.fillStyle = css(theme.accent, 1);
        ctx.beginPath();
        ctx.arc(w / 2, mid, 3.2 * u, 0, Math.PI * 2);
        ctx.fill();
        strokeLine(ctx, [w / 2, mid - half - 8 * u], [w / 2, mid + half + 8 * u], css(theme.ink, 0.3), Math.max(0.75, 1.5 * u));
      },
      dispose() {
        c2d = null;
      },
    };
  },
);
