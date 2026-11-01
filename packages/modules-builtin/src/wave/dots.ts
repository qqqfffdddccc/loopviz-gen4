import { clamp, defineModule, type Canvas2DModuleContext, type ModuleContext, type ParamSchema } from "@loopviz/mod-api";
import { css, mixRgb, requireCanvas2d, unitOf } from "../common/canvas";
import { amplitudes, fragmentProgress, peakGain, scaled, sliceFragmentPeaks, smoothAmplitudes } from "./peaks";

type DotsParams = {
  bars: number;
  dotSize: number;
  amplitude: number;
  pulse: number;
  pulseZone: number;
};

const params: ParamSchema<DotsParams> = {
  bars: { kind: "slider", label: "СТОЛБИКОВ", min: 12, max: 96, step: 1, default: 36 },
  dotSize: { kind: "slider", label: "ТОЧКА", min: 3, max: 16, step: 0.5, default: 9 },
  amplitude: { kind: "slider", label: "АМПЛИТУДА", min: 0.2, max: 1, step: 0.05, default: 0.85 },
  pulse: { kind: "slider", label: "ПУЛЬС", min: 0, max: 1, step: 0.05, default: 0.7 },
  pulseZone: { kind: "slider", label: "ЗОНА ПУЛЬСА", min: 0.02, max: 0.3, step: 0.01, default: 0.1 },
};

const DOT_GAP = 0.9;

/** Вес пульса: 1 под плейхедом, колоколом спадает с расстоянием `zone` (доли ширины). */
export function pulseWeight(distance: number, zone: number): number {
  const x = distance / Math.max(zone, 1e-3);
  return Math.exp(-x * x);
}

export const waveDots = defineModule<DotsParams>(
  { id: "builtin.wave.dots", slot: "wave", name: "Dot Bars", surface: "canvas2d", params },
  () => {
    let c2d: Canvas2DModuleContext | null = null;
    return {
      init(ctx: ModuleContext) {
        c2d = requireCanvas2d(ctx, "wave.dots");
      },
      resize() {},
      render(frame, p) {
        if (!c2d) return;
        const { ctx, canvas } = c2d;
        const { width: w, height: h } = canvas;
        const u = unitOf(frame);
        const { theme } = frame;
        const bars = Math.round(p.bars);
        const radius = (p.dotSize * u) / 2;
        const step = radius * 2 * (1 + DOT_GAP * 0.35);
        const marginX = 32 * u;
        const mid = h / 2;
        const maxHalf = (h / 2 - 12 * u) * p.amplitude;
        const span = w - marginX * 2;

        const fragment = frame.wave.fragment;
        const gain = peakGain(frame.wave.peaks);
        const values = smoothAmplitudes(scaled(amplitudes(sliceFragmentPeaks(frame.wave.peaks, fragment, bars)), gain), 0.3);
        const progress = fragmentProgress(frame.wave.progress, fragment);
        const level = clamp(frame.audio.rms * 2.2, 0, 1);

        for (let i = 0; i < bars; i++) {
          const center = (i + 0.5) / bars;
          const weight = pulseWeight(center - progress, p.pulseZone) * p.pulse * level;
          const played = center <= progress;
          const x = marginX + center * span;
          const reach = Math.min(maxHalf, (values[i] ?? 0) * maxHalf * (1 + 0.45 * weight));
          const dots = Math.max(0, Math.floor(reach / step));
          const remainder = reach / step - dots;
          const color = played ? mixRgb(theme.accent, theme.accentGlow, weight * 0.5) : theme.ink;
          const alpha = played ? 0.75 + 0.25 * weight : 0.4;
          ctx.fillStyle = css(color, alpha);
          ctx.beginPath();
          const dotRadius = radius * (1 + 0.3 * weight);
          ctx.arc(x, mid, dotRadius, 0, Math.PI * 2);
          for (let k = 1; k <= dots + 1; k++) {
            const r = k <= dots ? dotRadius : dotRadius * remainder;
            if (r < 0.2) continue;
            for (const sign of [-1, 1]) {
              ctx.moveTo(x + r, mid + sign * k * step);
              ctx.arc(x, mid + sign * k * step, r, 0, Math.PI * 2);
            }
          }
          ctx.fill();
        }
      },
      dispose() {
        c2d = null;
      },
    };
  },
);
