import { create } from "zustand";
import {
  BUILTIN_LAYOUT_PRESETS,
  DEFAULT_FEATHER,
  DEFAULT_LAYOUT,
  DEFAULT_POST_SETTINGS,
  DEFAULT_THEME_SETTINGS,
  findPreset,
  moveZone,
  resetSplitToPreset,
  withHidden,
  withRatio,
  type Layout,
  type LayoutPreset,
  type OklchColor,
  type PostSettings,
  type ThemeSettings,
  type ZoneKind,
} from "@loopviz/engine";
import { defaultParams, type ParamValue, type ParamValues, type SlotKind } from "@loopviz/mod-api";
import { registry } from "../runtime/registry";
import { ALL_SLOTS } from "./slots";

export type GlobalPostKey = Exclude<keyof PostSettings, "slotGlow">;

export interface AppState {
  layout: Layout;
  /** Пресет, с которого началась раскладка: к нему возвращает двойной клик по разделителю. */
  basePreset: LayoutPreset;
  /** Отступ между зонами в CSS-пикселях превью. */
  gap: number;
  /** Мягкость краёв зон, доля высоты зоны. */
  feather: number;
  moduleIds: Record<SlotKind, string | null>;
  /** Значения параметров по слоту и id модуля: при смене модуля значения прежнего сохраняются. */
  moduleParams: Record<SlotKind, Record<string, ParamValues>>;
  selectedSlot: SlotKind;
  theme: ThemeSettings;
  post: PostSettings;
  setModule(slot: SlotKind, id: string | null): void;
  setParam(slot: SlotKind, key: string, value: ParamValue): void;
  resetParams(slot: SlotKind): void;
  setZoneHidden(zone: ZoneKind, hidden: boolean): void;
  setZoneRatio(zone: ZoneKind, ratio: number): void;
  setLayout(layout: Layout): void;
  moveZone(from: number, to: number): void;
  applyLayoutPreset(preset: LayoutPreset): void;
  resetSplitter(upper: ZoneKind, lower: ZoneKind): void;
  setGap(gap: number): void;
  setFeather(feather: number): void;
  selectSlot(slot: SlotKind): void;
  setThemePreset(id: string): void;
  setAccent(accent: Partial<OklchColor>): void;
  setPaperTint(value: number): void;
  setThemeGlow(value: number): void;
  setPost(key: GlobalPostKey, value: number): void;
  setSlotGlow(slot: SlotKind, value: number): void;
}

const NO_PARAMS: ParamValues = {};

function defaultsFor(id: string): ParamValues {
  const module = registry.get(id);
  return module ? defaultParams(module.params) : {};
}

/** Текущие значения слота. Читается из рендер-цикла через getState(), без подписки React. */
export function activeParams(state: Pick<AppState, "moduleIds" | "moduleParams">, slot: SlotKind): ParamValues {
  const id = state.moduleIds[slot];
  return (id ? state.moduleParams[slot][id] : undefined) ?? NO_PARAMS;
}

function initialSlots(): Pick<AppState, "moduleIds" | "moduleParams"> {
  const moduleIds: Record<SlotKind, string | null> = { hero: null, midi: null, wave: null, overlay: null };
  const moduleParams: Record<SlotKind, Record<string, ParamValues>> = { hero: {}, midi: {}, wave: {}, overlay: {} };
  for (const slot of ALL_SLOTS) {
    const id = registry.listVisible(slot)[0]?.id ?? null;
    moduleIds[slot] = id;
    if (id) moduleParams[slot][id] = defaultsFor(id);
  }
  return { moduleIds, moduleParams };
}

export const useAppStore = create<AppState>()((set) => ({
  layout: DEFAULT_LAYOUT,
  basePreset: BUILTIN_LAYOUT_PRESETS[0] ?? { id: "default", name: "КЛАССИКА", layout: DEFAULT_LAYOUT },
  gap: 0,
  feather: DEFAULT_FEATHER,
  ...initialSlots(),
  selectedSlot: "hero",
  theme: DEFAULT_THEME_SETTINGS,
  post: DEFAULT_POST_SETTINGS,
  setModule: (slot, id) =>
    set((s) => {
      const known = id ? s.moduleParams[slot][id] : undefined;
      const moduleParams =
        id && !known ? { ...s.moduleParams, [slot]: { ...s.moduleParams[slot], [id]: defaultsFor(id) } } : s.moduleParams;
      return { moduleIds: { ...s.moduleIds, [slot]: id }, moduleParams };
    }),
  setParam: (slot, key, value) =>
    set((s) => {
      const id = s.moduleIds[slot];
      if (!id) return {};
      const current = s.moduleParams[slot][id] ?? defaultsFor(id);
      return { moduleParams: { ...s.moduleParams, [slot]: { ...s.moduleParams[slot], [id]: { ...current, [key]: value } } } };
    }),
  resetParams: (slot) =>
    set((s) => {
      const id = s.moduleIds[slot];
      if (!id) return {};
      return { moduleParams: { ...s.moduleParams, [slot]: { ...s.moduleParams[slot], [id]: defaultsFor(id) } } };
    }),
  setZoneHidden: (zone, hidden) => set((s) => ({ layout: withHidden(s.layout, zone, hidden) })),
  setZoneRatio: (zone, ratio) => set((s) => ({ layout: withRatio(s.layout, zone, ratio) })),
  setLayout: (layout) => set({ layout }),
  moveZone: (from, to) => set((s) => ({ layout: moveZone(s.layout, from, to) })),
  applyLayoutPreset: (preset) => set({ layout: preset.layout, basePreset: preset }),
  resetSplitter: (upper, lower) => set((s) => ({ layout: resetSplitToPreset(s.layout, upper, lower, s.basePreset) })),
  setGap: (gap) => set({ gap: Math.max(0, gap) }),
  setFeather: (feather) => set({ feather: Math.max(0, feather) }),
  selectSlot: (slot) => set({ selectedSlot: slot }),
  setThemePreset: (id) => {
    const preset = findPreset(id);
    if (preset) set({ theme: { accent: preset.accent, paperTint: preset.paperTint, glow: preset.glow } });
  },
  setAccent: (accent) => set((s) => ({ theme: { ...s.theme, accent: { ...s.theme.accent, ...accent } } })),
  setPaperTint: (paperTint) => set((s) => ({ theme: { ...s.theme, paperTint } })),
  setThemeGlow: (glow) => set((s) => ({ theme: { ...s.theme, glow } })),
  setPost: (key, value) => set((s) => ({ post: { ...s.post, [key]: value } })),
  setSlotGlow: (slot, value) => set((s) => ({ post: { ...s.post, slotGlow: { ...s.post.slotGlow, [slot]: value } } })),
}));
