import { clamp, defineModule, lerp, smoothstep, type Canvas2DModuleContext, type ModuleContext, type ParamSchema } from "@loopviz/mod-api";
import { css, fadeEdges, mixRgb, requireCanvas2d, strokeLine, unitOf } from "../common/canvas";
import { fitPitchRange, noteHeat } from "./note-math";

type FallingParams = {
  lookahead: number;
  noteWidth: number;
  velocity: number;
  tail: number;
  padding: number;
  keyboard: boolean;
};

const params: ParamSchema<FallingParams> = {
  lookahead: { kind: "slider", label: "ВЫСОТА ПАДЕНИЯ, С", min: 1, max: 4, step: 0.1, default: 2.5 },
  noteWidth: { kind: "slider", label: "ШИРИНА", min: 3, max: 24, step: 0.5, default: 9 },
  velocity: { kind: "slider", label: "ВЛИЯНИЕ ГРОМКОСТИ", min: 0, max: 1, step: 0.05, default: 0.7 },
  tail: { kind: "slider", label: "ХВОСТ, С", min: 0.1, max: 1.5, step: 0.05, default: 0.6 },
  padding: { kind: "slider", label: "ЗАПАС ПО ВЫСОТЕ", min: 0, max: 8, step: 1, default: 2 },
  keyboard: { kind: "toggle", label: "КЛАВИАТУРА", default: true },
};

const BLACK_KEYS: ReadonlySet<number> = new Set([1, 3, 6, 8, 10]);

export const midiFalling = defineModule<FallingParams>(
  { id: "builtin.midi.falling", slot: "midi", name: "Falling Notes", surface: "canvas2d", params },
  () => {
    let c2d: Canvas2DModuleContext | null = null;
    return {
      init(ctx: ModuleContext) {
        c2d = requireCanvas2d(ctx, "midi.falling");
      },
      resize() {},
      render(frame, p) {
        if (!c2d) return;
        const { ctx, canvas } = c2d;
        const { width: w, height: h } = canvas;
        const u = unitOf(frame);
        const { theme } = frame;
        const t = frame.loopT;
        const hairline = Math.max(0.75, 1.5 * u);

        const [low, high] = fitPitchRange(frame.midi.range, p.padding);
        const marginX = 36 * u;
        const spacing = (w - marginX * 2) / (high - low + 1);
        const xOf = (pitch: number): number => marginX + (pitch - low + 0.5) * spacing;
        const landY = h - (p.keyboard ? 62 : 28) * u;
        const topY = 12 * u;
        const pxPerSec = (landY - topY) / p.lookahead;
        const baseWidth = Math.min(p.noteWidth * u, spacing * 0.8);

        const keyHeat = new Map<number, number>();
        const falling: { x: number; top: number; bottom: number; width: number; alpha: number; heat: number }[] = [];
        for (const note of frame.midi.window) {
          const heat = noteHeat(note, t, p.tail);
          if (heat > 0) keyHeat.set(note.pitch, Math.max(keyHeat.get(note.pitch) ?? 0, heat));
          const bottom = Math.min(landY, landY - (note.start - t) * pxPerSec);
          const top = landY - (note.end - t) * pxPerSec;
          if (note.end <= t || top > landY || bottom < topY) continue;
          const vel = clamp(note.velocity, 0, 1);
          falling.push({
            x: xOf(note.pitch),
            top: Math.max(top, topY - 40 * u),
            bottom,
            width: baseWidth * lerp(1, 0.4 + 0.6 * vel, p.velocity),
            alpha: lerp(0.7, 0.25 + 0.75 * vel, p.velocity),
            heat,
          });
        }

        for (const note of falling) {
          const lit = note.heat > 0.01;
          const color = lit ? mixRgb(theme.ink, theme.accent, smoothstep(0, 0.6, note.heat)) : theme.ink;
          const alpha = lit ? note.alpha + (1 - note.alpha) * note.heat : note.alpha * 0.6;
          const length = Math.max(note.width, note.bottom - note.top);
          ctx.save();
          if (lit) {
            ctx.shadowColor = css(theme.accentGlow, 0.8 * note.heat);
            ctx.shadowBlur = 18 * u * note.heat;
          }
          ctx.fillStyle = css(color, alpha);
          ctx.beginPath();
          ctx.roundRect(note.x - note.width / 2, note.bottom - length, note.width, length, note.width / 2);
          ctx.fill();
          ctx.restore();
        }
        fadeEdges(ctx, { w, h }, { top: h * 0.18 });

        strokeLine(ctx, [marginX, landY], [w - marginX, landY], css(theme.ink, 0.22), hairline);
        for (const [pitch, heat] of keyHeat) {
          const x = xOf(pitch);
          const glow = ctx.createRadialGradient(x, landY, 0, x, landY, 46 * u);
          glow.addColorStop(0, css(theme.accentGlow, 0.9 * heat));
          glow.addColorStop(1, css(theme.accentGlow, 0));
          ctx.fillStyle = glow;
          ctx.fillRect(x - 46 * u, landY - 46 * u, 92 * u, 92 * u);
          strokeLine(ctx, [x - spacing * 0.4, landY], [x + spacing * 0.4, landY], css(theme.accent, heat), hairline * 2);
        }

        if (p.keyboard) {
          const keysY = landY + 12 * u;
          strokeLine(ctx, [marginX, keysY], [w - marginX, keysY], css(theme.ink, 0.4), hairline);
          for (let pitch = low; pitch <= high; pitch++) {
            const black = BLACK_KEYS.has(((pitch % 12) + 12) % 12);
            const heat = keyHeat.get(pitch) ?? 0;
            const x = xOf(pitch);
            const len = (black ? 12 : 24) * u;
            const color = heat > 0.01 ? css(mixRgb(theme.ink, theme.accent, smoothstep(0, 0.6, heat)), 0.4 + 0.6 * heat) : css(theme.ink, 0.4);
            strokeLine(ctx, [x, keysY], [x, keysY + len], color, hairline * (1 + heat));
          }
        }
      },
      dispose() {
        c2d = null;
      },
    };
  },
);
