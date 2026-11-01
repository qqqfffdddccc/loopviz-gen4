import type { SlotKind } from "@loopviz/mod-api";

export const ALL_SLOTS: readonly SlotKind[] = ["hero", "midi", "wave", "overlay"];

export const SLOT_LABELS: Record<SlotKind, string> = {
  hero: "АНИМАЦИЯ",
  midi: "MIDI",
  wave: "ВОЛНА",
  overlay: "ТЕКСТ",
};
