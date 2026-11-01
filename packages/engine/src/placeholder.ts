import { linearToCss, type Theme } from "@loopviz/mod-api";

/** Подмножество 2D-контекста, которое нужно заглушке: так её можно проверить без браузера. */
export type PlaceholderContext = Pick<
  OffscreenCanvasRenderingContext2D,
  "strokeRect" | "fillText" | "measureText" | "strokeStyle" | "fillStyle" | "lineWidth" | "font" | "textAlign" | "textBaseline"
>;

const REFERENCE_HEIGHT = 1920;
const FRAME_ALPHA = 0.28;
const TEXT_ALPHA = 0.5;

export function placeholderLabel(name: string): string {
  return `МОДУЛЬ УПАЛ: ${name}`;
}

/** Обрезает строку с многоточием, пока она не влезет в maxWidth. */
export function fitText(measure: (text: string) => number, text: string, maxWidth: number): string {
  if (measure(text) <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && measure(`${text.slice(0, end)}…`) > maxWidth) end -= 1;
  return `${text.slice(0, end)}…`;
}

/** Тонкая рамка и подпись чернилами темы с малой альфой. Холст перед вызовом должен быть чистым. */
export function drawPlaceholder(
  ctx: PlaceholderContext,
  size: { w: number; h: number; frameHeight: number },
  theme: Theme,
  name: string,
): void {
  const unit = size.frameHeight / REFERENCE_HEIGHT;
  const hairline = Math.max(1, unit);
  const inset = Math.max(6, 14 * unit) + hairline / 2;
  ctx.lineWidth = hairline;
  ctx.strokeStyle = linearToCss(theme.ink, FRAME_ALPHA);
  ctx.strokeRect(inset, inset, Math.max(0, size.w - inset * 2), Math.max(0, size.h - inset * 2));

  const fontPx = Math.max(10, Math.round(22 * unit));
  ctx.font = `${fontPx}px "JetBrains Mono", monospace`;
  ctx.fillStyle = linearToCss(theme.ink, TEXT_ALPHA);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = fitText((text) => ctx.measureText(text).width, placeholderLabel(name), size.w - inset * 4);
  ctx.fillText(label, size.w / 2, size.h / 2);
}
