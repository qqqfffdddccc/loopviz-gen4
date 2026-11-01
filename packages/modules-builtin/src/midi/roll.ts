import { clamp, defineModule, smoothstep, type Canvas2DModuleContext, type ModuleContext, type ParamSchema } from "@loopviz/mod-api";
import { css, fadeEdges, mixRgb, requireCanvas2d, strokeLine, unitOf } from "../common/canvas";
import { fitPitchRange, noteHeat } from "./note-math";

type RollParams = {
  lookahead: number;
  playhead: number;
  thickness: number;
  tail: number;
  padding: number;
  octaveGrid: boolean;
};

const params: ParamSchema<RollParams> = {
  lookahead: { kind: "slider", label: "ОКНО, С", min: 1, max: 4, step: 0.1, default: 3 },
  playhead: { kind: "slider", label: "ПЛЕЙХЕД", min: 0.1, max: 0.5, step: 0.01, default: 0.25 },
  thickness: { kind: "slider", label: "ТОЛЩИНА", min: 2, max: 24, step: 0.5, default: 8 },
  tail: { kind: "slider", label: "ХВОСТ, С", min: 0.1, max: 1.5, step: 0.05, default: 0.7 },
  padding: { kind: "slider", label: "ЗАПАС ПО ВЫСОТЕ", min: 0, max: 8, step: 1, default: 2 },
  octaveGrid: { kind: "toggle", label: "СЕТКА ОКТАВ", default: true },
};

const INK_ALPHA_MIN = 0.2;
const INK_ALPHA_VELOCITY = 0.3;

export const midiRoll = defineModule<RollParams>(
  { id: "builtin.midi.roll", slot: "midi", name: "Piano Roll", surface: "canvas2d", params },
  () => {
    let c2d: Canvas2DModuleContext | null = null;
    return {
      init(ctx: ModuleContext) {
        c2d = requireCanvas2d(ctx, "midi.roll");
      },
      resize() {},
      render(frame, p) {
        if (!c2d) return;
        const { ctx, canvas } = c2d;
        const { width: w, height: h } = canvas;
        const u = unitOf(frame);
        const { theme } = frame;
        const t = frame.loopT;

        const [low, high] = fitPitchRange(frame.midi.range, p.padding);
        const margin = 24 * u;
        const rowH = (h - margin * 2) / (high - low + 1);
        const rowY = (pitch: number): number => h - margin - (pitch - low + 0.5) * rowH;
        const playX = w * p.playhead;
        const pxPerSec = (w * (1 - p.playhead)) / p.lookahead;
        const thick = Math.min(p.thickness * u, rowH * 0.9);
        const hairline = Math.max(0.75, 1.5 * u);

        if (p.octaveGrid) {
          const gridColor = css(theme.ink, 0.1);
          for (let pitch = Math.ceil(low / 12) * 12; pitch <= high; pitch += 12) {
            const y = rowY(pitch) + rowH / 2;
            strokeLine(ctx, [0, y], [w, y], gridColor, hairline);
          }
        }

        const lit: { x: number; y: number; len: number; heat: number }[] = [];
        for (const note of frame.midi.window) {
          const x0 = playX + (note.start - t) * pxPerSec;
          const len = Math.max(thick, (note.end - note.start) * pxPerSec);
          if (x0 + len < 0 || x0 > w) continue;
          const heat = noteHeat(note, t, p.tail);
          const y = rowY(note.pitch);
          if (heat > 0.01) {
            lit.push({ x: x0, y, len, heat });
            continue;
          }
          ctx.fillStyle = css(theme.ink, INK_ALPHA_MIN + INK_ALPHA_VELOCITY * clamp(note.velocity, 0, 1));
          ctx.beginPath();
          ctx.roundRect(x0, y - thick / 2, len, thick, thick / 2);
          ctx.fill();
        }

        // Горячие ноты поверх спокойных, чтобы свечение не перекрывалось соседями.
        for (const note of lit) {
          const color = mixRgb(theme.ink, theme.accent, smoothstep(0, 0.6, note.heat));
          ctx.save();
          ctx.shadowColor = css(theme.accentGlow, 0.85 * note.heat);
          ctx.shadowBlur = 22 * u * note.heat;
          ctx.fillStyle = css(color, INK_ALPHA_MIN + (1 - INK_ALPHA_MIN) * note.heat);
          ctx.beginPath();
          ctx.roundRect(note.x, note.y - thick / 2, note.len, thick, thick / 2);
          ctx.fill();
          ctx.restore();
        }

        fadeEdges(ctx, { w, h }, { left: playX * 0.7, right: w * 0.2 });
        strokeLine(ctx, [Math.round(playX), margin * 0.5], [Math.round(playX), h - margin * 0.5], css(theme.ink, 0.5), hairline);
      },
      dispose() {
        c2d = null;
      },
    };
  },
);
