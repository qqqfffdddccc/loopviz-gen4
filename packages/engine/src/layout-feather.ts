import type { SlotRect, ZoneKind } from "./layout";

/** Мягкость края по умолчанию: доля высоты зоны. */
export const DEFAULT_FEATHER = 0.06;
export const MAX_FEATHER = 0.25;

export interface ZoneFeather {
  slot: ZoneKind;
  /** Доли высоты самой зоны, от 0 до 0.5. Край у границы холста не размывается. */
  top: number;
  bottom: number;
}

/**
 * Размытие считается долей высоты зоны, поэтому при любом выходном размере оно занимает ту же
 * часть кадра: превью, 1080p и 4K совпадают. Размываются только края, обращённые к соседней зоне.
 */
export function zoneFeathers(rects: readonly SlotRect[], feather: number): ZoneFeather[] {
  const amount = Math.min(Math.max(feather, 0), MAX_FEATHER);
  return rects.map((rect, i) => ({
    slot: rect.slot,
    top: i > 0 && rect.h > 0 ? amount : 0,
    bottom: i < rects.length - 1 && rect.h > 0 ? amount : 0,
  }));
}
