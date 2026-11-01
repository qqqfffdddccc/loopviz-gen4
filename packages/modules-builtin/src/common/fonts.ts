export const FONT_FALLBACK = "ui-monospace, monospace";

const pending = new Set<string>();

function fontFaces(): FontFaceSet | null {
  return typeof document === "undefined" ? null : document.fonts;
}

export function fontSpec(family: string, weight: number, px: number): string {
  return `${weight} ${px}px "${family}", ${FONT_FALLBACK}`;
}

/** Текст нужен: шрифты нарезаны по unicode-range, и без образца браузер загрузит только латиницу. */
export function isFontReady(family: string, weight: number, text: string): boolean {
  const faces = fontFaces();
  return !faces || faces.check(fontSpec(family, weight, 16), text);
}

export async function ensureFont(family: string, weight: number, text: string): Promise<void> {
  const faces = fontFaces();
  if (!faces) return;
  await faces.load(fontSpec(family, weight, 16), text);
}

/** Для превью: запускает загрузку без ожидания, повторные вызовы с тем же текстом ничего не делают. */
export function requestFont(family: string, weight: number, text: string): void {
  if (isFontReady(family, weight, text)) return;
  const key = `${family}|${weight}|${text}`;
  if (pending.has(key)) return;
  pending.add(key);
  ensureFont(family, weight, text)
    .catch(() => undefined)
    .finally(() => pending.delete(key));
}
