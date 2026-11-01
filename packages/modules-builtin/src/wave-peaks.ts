import {
  defineModule,
  linearToCss,
  type Canvas2DModuleContext,
  type ModuleContext,
  type ParamSchema,
} from "@loopviz/mod-api";

type WavePeaksParams = { amplitude: number };

const params: ParamSchema<WavePeaksParams> = {
  amplitude: { kind: "slider", label: "АМПЛИТУДА", min: 0.2, max: 1, step: 0.05, default: 0.9 },
};

/** Заглушка этапа 2: контур frame.wave.peaks, пройденная часть закрашена акцентом. */
export const wavePeaks = defineModule<WavePeaksParams>(
  { id: "builtin.wave.peaks", slot: "wave", name: "Peaks", surface: "canvas2d", params },
  () => {
    let c2d: Canvas2DModuleContext | null = null;
    return {
      init(ctx: ModuleContext) {
        if (ctx.surface !== "canvas2d") throw new Error("wave.peaks requires a canvas2d surface");
        c2d = ctx;
      },
      resize() {},
      render(frame, values) {
        if (!c2d) return;
        const { ctx, canvas } = c2d;
        const { peaks, progress } = frame.wave;
        const points = peaks.length / 2;
        const mid = canvas.height / 2;
        const half = mid * values.amplitude;
        const ink = linearToCss(frame.theme.ink, 0.4);
        const unit = Math.max(1, frame.size.h / 1920);
        const bar = Math.max(1, Math.round(unit * 1.5));
        const accent = linearToCss(frame.theme.accent);
        const playedX = progress * canvas.width;

        for (let x = 0; x < canvas.width; x += bar * 2) {
          const from = Math.floor((x / canvas.width) * points);
          const to = Math.max(from + 1, Math.floor(((x + bar * 2) / canvas.width) * points));
          let min = 0;
          let max = 0;
          for (let i = from; i < to; i++) {
            min = Math.min(min, peaks[i * 2] ?? 0);
            max = Math.max(max, peaks[i * 2 + 1] ?? 0);
          }
          ctx.fillStyle = x < playedX ? accent : ink;
          ctx.fillRect(x, mid - max * half, bar, Math.max(unit, (max - min) * half));
        }
      },
      dispose() {
        c2d = null;
      },
    };
  },
);
