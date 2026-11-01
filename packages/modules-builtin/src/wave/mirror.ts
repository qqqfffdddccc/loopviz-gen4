import { defineModule, type Canvas2DModuleContext, type ModuleContext, type ParamSchema } from "@loopviz/mod-api";
import { css, requireCanvas2d, strokeLine, unitOf } from "../common/canvas";
import { amplitudes, fragmentProgress, peakGain, scaled, sliceFragmentPeaks, smoothAmplitudes } from "./peaks";

type MirrorParams = {
  amplitude: number;
  detail: number;
  smooth: number;
  line: number;
  fill: number;
  playhead: boolean;
};

const params: ParamSchema<MirrorParams> = {
  amplitude: { kind: "slider", label: "АМПЛИТУДА", min: 0.2, max: 1, step: 0.05, default: 0.8 },
  detail: { kind: "slider", label: "ДЕТАЛИЗАЦИЯ", min: 48, max: 480, step: 8, default: 220 },
  smooth: { kind: "slider", label: "СГЛАЖИВАНИЕ", min: 0, max: 1, step: 0.05, default: 0.6 },
  line: { kind: "slider", label: "ТОЛЩИНА ЛИНИИ", min: 1, max: 6, step: 0.25, default: 2.5 },
  fill: { kind: "slider", label: "ЗАЛИВКА ПРОЙДЕННОГО", min: 0, max: 0.6, step: 0.01, default: 0.18 },
  playhead: { kind: "toggle", label: "ПЛЕЙХЕД", default: true },
};

export const waveMirror = defineModule<MirrorParams>(
  { id: "builtin.wave.mirror", slot: "wave", name: "Mirror Line", surface: "canvas2d", params },
  () => {
    let c2d: Canvas2DModuleContext | null = null;
    return {
      init(ctx: ModuleContext) {
        c2d = requireCanvas2d(ctx, "wave.mirror");
      },
      resize() {},
      render(frame, p) {
        if (!c2d) return;
        const { ctx, canvas } = c2d;
        const { width: w, height: h } = canvas;
        const u = unitOf(frame);
        const { theme } = frame;
        const columns = Math.round(p.detail);
        const lineWidth = Math.max(0.75, p.line * u);
        const marginX = 32 * u;
        const mid = h / 2;
        const half = (h / 2 - 12 * u) * p.amplitude;
        const span = w - marginX * 2;

        const fragment = frame.wave.fragment;
        const gain = peakGain(frame.wave.peaks);
        const values = smoothAmplitudes(scaled(amplitudes(sliceFragmentPeaks(frame.wave.peaks, fragment, columns)), gain), p.smooth);
        const xAt = (i: number): number => marginX + (i / (columns - 1)) * span;

        const outline = new Path2D();
        outline.moveTo(xAt(0), mid - (values[0] ?? 0) * half);
        for (let i = 1; i < columns; i++) outline.lineTo(xAt(i), mid - (values[i] ?? 0) * half);
        for (let i = columns - 1; i >= 0; i--) outline.lineTo(xAt(i), mid + (values[i] ?? 0) * half);
        outline.closePath();

        strokeLine(ctx, [marginX, mid], [w - marginX, mid], css(theme.ink, 0.18), Math.max(0.75, 1.5 * u));
        ctx.lineJoin = "round";
        ctx.lineWidth = lineWidth * 0.6;
        ctx.strokeStyle = css(theme.ink, 0.5);
        ctx.stroke(outline);

        const playX = marginX + fragmentProgress(frame.wave.progress, fragment) * span;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, playX, h);
        ctx.clip();
        ctx.fillStyle = css(theme.accent, p.fill);
        ctx.fill(outline);
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = css(theme.accent, 0.95);
        ctx.stroke(outline);
        ctx.restore();

        if (p.playhead) {
          strokeLine(ctx, [playX, mid - half - 10 * u], [playX, mid + half + 10 * u], css(theme.ink, 0.6), Math.max(0.75, 1.5 * u));
        }
      },
      dispose() {
        c2d = null;
      },
    };
  },
);
