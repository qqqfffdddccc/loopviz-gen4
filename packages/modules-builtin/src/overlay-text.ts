import { defineModule, linearToCss, type Canvas2DModuleContext, type ModuleContext, type ParamSchema } from "@loopviz/mod-api";

type OverlayTextParams = { text: string; font: string; size: number; opacity: number };

const params: ParamSchema<OverlayTextParams> = {
  text: { kind: "text", label: "ТЕКСТ", default: "LOOPVIZ" },
  font: { kind: "font", label: "ШРИФТ", default: "JetBrains Mono" },
  size: { kind: "slider", label: "РАЗМЕР", min: 0.02, max: 0.12, step: 0.002, default: 0.045 },
  opacity: { kind: "slider", label: "ПРОЗРАЧНОСТЬ", min: 0, max: 1, step: 0.01, default: 0.9 },
};

export const overlayText = defineModule<OverlayTextParams>(
  { id: "builtin.overlay.text", slot: "overlay", name: "Text Layer", surface: "canvas2d", params },
  () => {
    let c2d: Canvas2DModuleContext | null = null;
    return {
      init(ctx: ModuleContext) {
        if (ctx.surface !== "canvas2d") throw new Error("overlay.text requires a canvas2d surface");
        c2d = ctx;
      },
      resize() {},
      render(frame, values) {
        if (!c2d) return;
        const { ctx, canvas } = c2d;
        const px = Math.round(canvas.width * values.size);
        const margin = canvas.width * 0.05;
        ctx.font = `700 ${px}px "${values.font}", monospace`;
        ctx.textBaseline = "top";
        ctx.fillStyle = linearToCss(frame.theme.ink, values.opacity);
        ctx.fillText(values.text, margin, margin);
      },
      dispose() {
        c2d = null;
      },
    };
  },
);
