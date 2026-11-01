export type OverlayPosition = "ЛЕВО ВЕРХ" | "ПРАВО ВЕРХ" | "ЛЕВО НИЗ" | "ПРАВО НИЗ" | "ЦЕНТР";

export const OVERLAY_POSITIONS: readonly OverlayPosition[] = ["ЛЕВО ВЕРХ", "ПРАВО ВЕРХ", "ЛЕВО НИЗ", "ПРАВО НИЗ", "ЦЕНТР"];

export type HorizontalAlign = "left" | "right" | "center";

export interface Anchor {
  x: number;
  /** Верхняя граница блока. */
  y: number;
  align: HorizontalAlign;
}

/** Точка привязки блока размера `block` внутри кадра с отступом `margin`. */
export function anchorFor(position: OverlayPosition, frame: { w: number; h: number }, block: { h: number }, margin: number): Anchor {
  switch (position) {
    case "ЛЕВО ВЕРХ":
      return { x: margin, y: margin, align: "left" };
    case "ПРАВО ВЕРХ":
      return { x: frame.w - margin, y: margin, align: "right" };
    case "ЛЕВО НИЗ":
      return { x: margin, y: frame.h - margin - block.h, align: "left" };
    case "ПРАВО НИЗ":
      return { x: frame.w - margin, y: frame.h - margin - block.h, align: "right" };
    case "ЦЕНТР":
      return { x: frame.w / 2, y: (frame.h - block.h) / 2, align: "center" };
    default: {
      const unreachable: never = position;
      throw new Error(`Unknown position: ${String(unreachable)}`);
    }
  }
}

/** Левая граница строки ширины `width` при выравнивании относительно точки x. */
export function lineLeft(x: number, width: number, align: HorizontalAlign): number {
  switch (align) {
    case "left":
      return x;
    case "right":
      return x - width;
    case "center":
      return x - width / 2;
    default: {
      const unreachable: never = align;
      throw new Error(`Unknown align: ${String(unreachable)}`);
    }
  }
}

/** Пустое поле BPM берёт темп с таймлайна, целые без хвоста. */
export function formatBpm(manual: string, auto: number): string {
  const trimmed = manual.trim();
  if (trimmed) return trimmed;
  const rounded = Math.round(auto * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function metaLine(bpm: string, key: string): string {
  return [bpm ? `${bpm} BPM` : "", key.trim()].filter(Boolean).join("  /  ");
}
