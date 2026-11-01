import { BUNDLED_FONTS, defineModule, type Canvas2DModuleContext, type ModuleContext, type ParamSchema } from "@loopviz/mod-api";
import { css, requireCanvas2d, unitOf } from "../common/canvas";
import { ensureFont, fontSpec, requestFont } from "../common/fonts";
import { OVERLAY_POSITIONS, anchorFor, formatBpm, lineLeft, metaLine, type HorizontalAlign, type OverlayPosition } from "./layout";
import { getLogo, loadLogo } from "./logo-cache";

type OverlayTextParams = {
  enabled: boolean;
  title: string;
  artist: string;
  bpm: string;
  key: string;
  logo: string;
  font: string;
  size: number;
  tracking: number;
  position: OverlayPosition;
  opacity: number;
  uppercase: boolean;
};

const params: ParamSchema<OverlayTextParams> = {
  enabled: { kind: "toggle", label: "ПОКАЗЫВАТЬ", default: true },
  title: { kind: "text", label: "НАЗВАНИЕ", default: "LOOP 01" },
  artist: { kind: "text", label: "АРТИСТ", default: "LOOPVIZ" },
  bpm: { kind: "text", label: "BPM (ПУСТО = АВТО)", default: "" },
  key: { kind: "text", label: "ТОНАЛЬНОСТЬ", default: "" },
  logo: { kind: "image", label: "ЛОГОТИП", default: "" },
  font: { kind: "font", label: "ШРИФТ", default: BUNDLED_FONTS[0] },
  size: { kind: "slider", label: "РАЗМЕР", min: 10, max: 48, step: 1, default: 22 },
  tracking: { kind: "slider", label: "ИНТЕРВАЛ", min: 0, max: 0.6, step: 0.01, default: 0.22 },
  position: { kind: "select", label: "ПОЛОЖЕНИЕ", options: OVERLAY_POSITIONS, default: "ЛЕВО ВЕРХ" },
  opacity: { kind: "slider", label: "ПРОЗРАЧНОСТЬ", min: 0, max: 1, step: 0.01, default: 0.85 },
  uppercase: { kind: "toggle", label: "ЗАГЛАВНЫЕ", default: true },
};

const WEIGHT = 400;
const MARGIN = 64;
const LINE_GAP = 0.9;

interface TextLine {
  text: string;
  px: number;
  alpha: number;
}

function sampleText(p: OverlayTextParams): string {
  return `${p.title}${p.artist}${p.bpm}${p.key} BPM0123456789`;
}

function buildLines(p: OverlayTextParams, bpm: string, px: number): TextLine[] {
  const shape = (text: string): string => (p.uppercase ? text.toUpperCase() : text);
  const lines: TextLine[] = [
    { text: shape(p.title), px, alpha: 1 },
    { text: shape(p.artist), px: px * 0.82, alpha: 0.7 },
    { text: shape(metaLine(bpm, p.key)), px: px * 0.82, alpha: 0.55 },
  ];
  return lines.filter((line) => line.text.length > 0);
}

/** Моноширинный текст рисуется посимвольно: так интервал одинаков в любом браузере, без ctx.letterSpacing. */
function drawTracked(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: HorizontalAlign,
): void {
  const chars = [...text];
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(0, chars.length - 1);
  let cursor = lineLeft(x, total, align);
  chars.forEach((char, i) => {
    ctx.fillText(char, cursor, y);
    cursor += (widths[i] ?? 0) + tracking;
  });
}

export const overlayText = defineModule<OverlayTextParams>(
  { id: "builtin.overlay.text", slot: "overlay", name: "Text Layer", surface: "canvas2d", params },
  () => {
    let c2d: Canvas2DModuleContext | null = null;
    return {
      init(ctx: ModuleContext) {
        c2d = requireCanvas2d(ctx, "overlay.text");
      },
      async prepare(p) {
        await Promise.all([ensureFont(p.font, WEIGHT, sampleText(p)), loadLogo(p.logo)]);
      },
      resize() {},
      render(frame, p) {
        if (!c2d || !p.enabled) return;
        const { ctx, canvas } = c2d;
        const u = unitOf(frame);
        const px = Math.max(6, Math.round(p.size * u));
        requestFont(p.font, WEIGHT, sampleText(p));

        const lines = buildLines(p, formatBpm(p.bpm, frame.bpm), px);
        const logo = getLogo(p.logo);
        const logoH = logo ? px * 2.6 : 0;
        const logoW = logo ? (logo.width / logo.height) * logoH : 0;
        const gap = px * LINE_GAP;
        const blockH = lines.reduce((sum, line) => sum + line.px + gap, 0) - (lines.length > 0 ? gap : 0) + (logo ? logoH + gap : 0);
        const anchor = anchorFor(p.position, { w: canvas.width, h: canvas.height }, { h: blockH }, MARGIN * u);

        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.globalAlpha = p.opacity;
        let y = anchor.y;
        if (logo) {
          ctx.drawImage(logo, lineLeft(anchor.x, logoW, anchor.align), y, logoW, logoH);
          y += logoH + gap;
        }
        for (const line of lines) {
          ctx.font = fontSpec(p.font, WEIGHT, line.px);
          ctx.fillStyle = css(frame.theme.ink, line.alpha);
          drawTracked(ctx, line.text, anchor.x, y + line.px / 2, line.px * p.tracking, anchor.align);
          y += line.px + gap;
        }
      },
      dispose() {
        c2d = null;
      },
    };
  },
);
