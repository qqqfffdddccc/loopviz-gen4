import {
  linearToCss,
  type Canvas2DModuleContext,
  type FrameInput,
  type ModuleContext,
  type Rgb,
} from "@loopviz/mod-api";

const REFERENCE_HEIGHT = 1920;

export function requireCanvas2d(ctx: ModuleContext, moduleId: string): Canvas2DModuleContext {
  if (ctx.surface !== "canvas2d") throw new Error(`${moduleId} requires a canvas2d surface`);
  return ctx;
}

/** Размеры модулей заданы в пикселях кадра 1080x1920. Единица масштабирует их под текущую высоту кадра. */
export function unitOf(frame: FrameInput): number {
  return frame.size.h / REFERENCE_HEIGHT;
}

export function mixRgb(a: Rgb, b: Rgb, k: number): Rgb {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function css(rgb: Rgb, alpha = 1): string {
  return linearToCss(rgb, alpha);
}

/** Гасит края холста: горизонтальные зоны в пикселях, альфа 1 у края и 0 на внутренней границе зоны. */
export function fadeEdges(
  ctx: OffscreenCanvasRenderingContext2D,
  size: { w: number; h: number },
  edges: { left?: number; right?: number; top?: number; bottom?: number },
): void {
  const { w, h } = size;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  const strip = (x0: number, y0: number, x1: number, y1: number, rect: [number, number, number, number]): void => {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(...rect);
  };
  if (edges.left) strip(0, 0, edges.left, 0, [0, 0, edges.left, h]);
  if (edges.right) strip(w, 0, w - edges.right, 0, [w - edges.right, 0, edges.right, h]);
  if (edges.top) strip(0, 0, 0, edges.top, [0, 0, w, edges.top]);
  if (edges.bottom) strip(0, h, 0, h - edges.bottom, [0, h - edges.bottom, w, edges.bottom]);
  ctx.restore();
}

export function strokeLine(
  ctx: OffscreenCanvasRenderingContext2D,
  from: readonly [number, number],
  to: readonly [number, number],
  color: string,
  width: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
}
