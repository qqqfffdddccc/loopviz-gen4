import { linearToCss, type Canvas2DModuleContext, type ModuleContext, type ParamSchema, type VisualModule } from "@loopviz/mod-api";

type WaveSineParams = { amplitude: number; frequency: number };

export function createWaveSine(): VisualModule<WaveSineParams> {
  let c2d: Canvas2DModuleContext | null = null;

  const params: ParamSchema<WaveSineParams> = {
    amplitude: { kind: "slider", label: "АМПЛИТУДА", min: 0.05, max: 0.5, step: 0.01, default: 0.3 },
    frequency: { kind: "slider", label: "ЧАСТОТА", min: 1, max: 12, step: 0.5, default: 4 },
  };

  return {
    id: "builtin.wave.sine",
    slot: "wave",
    name: "Sine Line",
    surface: "canvas2d",
    params,
    init(ctx: ModuleContext) {
      if (ctx.surface !== "canvas2d") throw new Error("wave.sine requires a canvas2d surface");
      c2d = ctx;
    },
    resize() {},
    render(frame, values) {
      if (!c2d) return;
      const { ctx, canvas } = c2d;
      const mid = canvas.height / 2;
      ctx.strokeStyle = linearToCss(frame.theme.ink);
      ctx.lineWidth = Math.max(1, frame.size.dpr);
      ctx.beginPath();
      for (let x = 0; x <= canvas.width; x++) {
        const phase = (x / canvas.width) * values.frequency * Math.PI * 2 - frame.t * 2;
        const y = mid + Math.sin(phase) * canvas.height * values.amplitude;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    },
    dispose() {
      c2d = null;
    },
  };
}
