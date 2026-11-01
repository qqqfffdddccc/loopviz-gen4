import { clamp, defineModule, lerp, smoothstep, type Canvas2DModuleContext, type ModuleContext, type ParamSchema } from "@loopviz/mod-api";
import { css, mixRgb, requireCanvas2d, unitOf } from "../common/canvas";
import { ensureFont, fontSpec, requestFont } from "../common/fonts";
import {
  CIRCLE_ORDERS,
  PITCH_CLASS_NAMES,
  circlePoint,
  collectVoices,
  sortAroundCircle,
  type CircleOrder,
} from "./circle-layout";

type CircleParams = {
  order: CircleOrder;
  radius: number;
  dotSize: number;
  tail: number;
  spread: number;
  connect: boolean;
  labels: boolean;
};

const params: ParamSchema<CircleParams> = {
  order: { kind: "select", label: "ПОРЯДОК", options: CIRCLE_ORDERS, default: "КВИНТЫ" },
  radius: { kind: "slider", label: "РАДИУС", min: 0.2, max: 0.46, step: 0.01, default: 0.36 },
  dotSize: { kind: "slider", label: "РАЗМЕР ТОЧЕК", min: 6, max: 40, step: 1, default: 18 },
  tail: { kind: "slider", label: "ЗАТУХАНИЕ, С", min: 0.2, max: 1.5, step: 0.05, default: 0.8 },
  spread: { kind: "slider", label: "ОКТАВЫ ПО РАДИУСУ", min: 0, max: 0.3, step: 0.01, default: 0.1 },
  connect: { kind: "toggle", label: "ЛИНИИ АККОРДА", default: true },
  labels: { kind: "toggle", label: "ПОДПИСИ", default: true },
};

const LABEL_FONT = "JetBrains Mono";
const LABEL_TEXT = PITCH_CLASS_NAMES.join("");

export const midiCircle = defineModule<CircleParams>(
  { id: "builtin.midi.circle", slot: "midi", name: "Pitch Circle", surface: "canvas2d", params },
  () => {
    let c2d: Canvas2DModuleContext | null = null;
    return {
      init(ctx: ModuleContext) {
        c2d = requireCanvas2d(ctx, "midi.circle");
      },
      prepare: () => ensureFont(LABEL_FONT, 400, LABEL_TEXT),
      resize() {},
      render(frame, p) {
        if (!c2d) return;
        const { ctx, canvas } = c2d;
        const { width: w, height: h } = canvas;
        const u = unitOf(frame);
        const { theme } = frame;
        const hairline = Math.max(0.75, 1.5 * u);
        const center: [number, number] = [w / 2, h / 2];
        const radius = Math.min(w, h) * p.radius;
        const [lowPitch, highPitch] = frame.midi.range;
        const midPitch = (lowPitch + highPitch) / 2;
        const halfSpan = Math.max(6, (highPitch - lowPitch) / 2);

        ctx.strokeStyle = css(theme.ink, 0.16);
        ctx.lineWidth = hairline;
        ctx.beginPath();
        ctx.arc(center[0], center[1], radius, 0, Math.PI * 2);
        ctx.stroke();

        requestFont(LABEL_FONT, 400, LABEL_TEXT);
        ctx.font = fontSpec(LABEL_FONT, 400, Math.round(15 * u));
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        PITCH_CLASS_NAMES.forEach((name, pitchClass) => {
          const [x, y] = circlePoint(center, radius, pitchClass, p.order);
          ctx.fillStyle = css(theme.ink, 0.45);
          ctx.beginPath();
          ctx.arc(x, y, 2.2 * u, 0, Math.PI * 2);
          ctx.fill();
          if (!p.labels) return;
          const [lx, ly] = circlePoint(center, radius + 34 * u, pitchClass, p.order);
          ctx.fillStyle = css(theme.ink, 0.6);
          ctx.fillText(name, lx, ly);
        });

        const voices = sortAroundCircle(collectVoices(frame.midi.window, frame.loopT, p.tail), p.order);
        const positioned = voices.map((voice) => {
          const offset = ((voice.pitch - midPitch) / halfSpan) * p.spread;
          const [x, y] = circlePoint(center, radius * (1 + offset), voice.pitchClass, p.order);
          return { voice, x, y };
        });

        if (p.connect && positioned.length > 1) {
          const closed = positioned.length > 2;
          positioned.forEach((from, i) => {
            const to = positioned[(i + 1) % positioned.length];
            if (!to || (!closed && i > 0)) return;
            const strength = Math.min(from.voice.heat, to.voice.heat);
            ctx.strokeStyle = css(mixRgb(theme.ink, theme.accent, 0.5 + 0.5 * strength), 0.15 + 0.7 * strength);
            ctx.lineWidth = hairline * (1 + strength);
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
          });
        }

        for (const { voice, x, y } of positioned) {
          const size = p.dotSize * u * lerp(0.55, 1, clamp(voice.velocity, 0, 1)) * (0.45 + 0.55 * smoothstep(0, 0.7, voice.heat));
          const halo = ctx.createRadialGradient(x, y, 0, x, y, size * 3.4);
          halo.addColorStop(0, css(theme.accentGlow, 0.75 * voice.heat));
          halo.addColorStop(1, css(theme.accentGlow, 0));
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(x, y, size * 3.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = css(mixRgb(theme.ink, theme.accent, smoothstep(0, 0.35, voice.heat)), 0.55 + 0.45 * voice.heat);
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      dispose() {
        c2d = null;
      },
    };
  },
);
