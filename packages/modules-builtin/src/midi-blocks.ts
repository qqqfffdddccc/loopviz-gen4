import { linearToCss, type Canvas2DModuleContext, type ModuleContext, type ParamSchema, type VisualModule } from "@loopviz/mod-api";

type MidiBlocksParams = { speed: number };

const ROWS = 6;

export function createMidiBlocks(): VisualModule<MidiBlocksParams> {
  let c2d: Canvas2DModuleContext | null = null;

  const params: ParamSchema<MidiBlocksParams> = {
    speed: { kind: "slider", label: "СКОРОСТЬ", min: 0, max: 2, step: 0.05, default: 0.3 },
  };

  return {
    id: "builtin.midi.blocks",
    slot: "midi",
    name: "Moving Blocks",
    surface: "canvas2d",
    params,
    init(ctx: ModuleContext) {
      if (ctx.surface !== "canvas2d") throw new Error("midi.blocks requires a canvas2d surface");
      c2d = ctx;
    },
    resize() {},
    render(frame, values) {
      if (!c2d) return;
      const { ctx, canvas } = c2d;
      const rowH = canvas.height / ROWS;
      ctx.fillStyle = linearToCss(frame.theme.accent);
      for (let row = 0; row < ROWS; row++) {
        const length = canvas.width * (0.12 + 0.05 * ((row * 7) % 4));
        const phase = (row * 0.37 + frame.t * values.speed * (0.6 + 0.15 * row)) % 1;
        const x = phase * (canvas.width + length) - length;
        ctx.globalAlpha = 0.45 + 0.1 * (row % 5);
        ctx.fillRect(x, row * rowH + rowH * 0.2, length, rowH * 0.6);
      }
      ctx.globalAlpha = 1;
    },
    dispose() {
      c2d = null;
    },
  };
}
