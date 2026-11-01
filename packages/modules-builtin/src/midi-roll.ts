import {
  clamp,
  defineModule,
  linearToCss,
  type Canvas2DModuleContext,
  type ModuleContext,
  type ParamSchema,
} from "@loopviz/mod-api";

type MidiRollParams = { noteHeight: number };

const params: ParamSchema<MidiRollParams> = {
  noteHeight: { kind: "slider", label: "ВЫСОТА НОТ", min: 0.3, max: 1, step: 0.05, default: 0.8 },
};

/** Заглушка этапа 2: горизонтальный piano roll по frame.midi.window, плейхед на доле lookbehind окна. */
export const midiRoll = defineModule<MidiRollParams>(
  { id: "builtin.midi.roll", slot: "midi", name: "Piano Roll", surface: "canvas2d", params },
  () => {
    let c2d: Canvas2DModuleContext | null = null;
    return {
      init(ctx: ModuleContext) {
        if (ctx.surface !== "canvas2d") throw new Error("midi.roll requires a canvas2d surface");
        c2d = ctx;
      },
      resize() {},
      render(frame, values) {
        if (!c2d) return;
        const { ctx, canvas } = c2d;
        const { window, active, range, lookbehind, lookahead } = frame.midi;
        const span = lookbehind + lookahead;
        const rows = range[1] - range[0] + 1;
        const rowH = canvas.height / Math.max(rows, 12);
        const unit = Math.max(1, frame.size.h / 1920);
        const playheadX = (lookbehind / span) * canvas.width;
        const activeSet = new Set(active.map((n) => `${n.track}:${n.pitch}:${n.start}`));

        for (const note of window) {
          const x = playheadX + ((note.start - frame.loopT) / span) * canvas.width;
          const w = Math.max(2, ((note.end - note.start) / span) * canvas.width);
          const y = canvas.height - (note.pitch - range[0] + 1) * rowH;
          const lit = activeSet.has(`${note.track}:${note.pitch}:${note.start}`);
          ctx.fillStyle = linearToCss(lit ? frame.theme.accent : frame.theme.ink, lit ? 1 : 0.14 + 0.26 * clamp(note.velocity, 0, 1));
          ctx.fillRect(x, y + rowH * (1 - values.noteHeight) * 0.5, w, rowH * values.noteHeight);
        }

        ctx.fillStyle = linearToCss(frame.theme.ink, 0.55);
        ctx.fillRect(Math.round(playheadX), 0, Math.round(unit), canvas.height);
      },
      dispose() {
        c2d = null;
      },
    };
  },
);
