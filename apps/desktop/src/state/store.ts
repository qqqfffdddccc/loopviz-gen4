import { create } from "zustand";
import {
  DEFAULT_LAYOUT,
  DEFAULT_POST_SETTINGS,
  DEFAULT_THEME_SETTINGS,
  findPreset,
  withHidden,
  withRatio,
  type Layout,
  type OklchColor,
  type PostSettings,
  type ThemeSettings,
  type ZoneKind,
} from "@loopviz/engine";
import { defaultParams, type ParamValues, type SlotKind } from "@loopviz/mod-api";
import { registry } from "../runtime/registry";
import { ALL_SLOTS } from "./slots";

export type GlobalPostKey = Exclude<keyof PostSettings, "slotGlow">;

export interface AppState {
  layout: Layout;
  gap: number;
  moduleIds: Record<SlotKind, string | null>;
  params: Record<SlotKind, ParamValues>;
  selectedSlot: SlotKind;
  theme: ThemeSettings;
  post: PostSettings;
  setModule(slot: SlotKind, id: string | null): void;
  setZoneHidden(zone: ZoneKind, hidden: boolean): void;
  setZoneRatio(zone: ZoneKind, ratio: number): void;
  selectSlot(slot: SlotKind): void;
  setThemePreset(id: string): void;
  setAccent(accent: Partial<OklchColor>): void;
  setPaperTint(value: number): void;
  setThemeGlow(value: number): void;
  setPost(key: GlobalPostKey, value: number): void;
  setSlotGlow(slot: SlotKind, value: number): void;
}

function paramsFor(id: string | null): ParamValues {
  const module = id ? registry.get(id) : undefined;
  return module ? defaultParams(module.params) : {};
}

function initialSlots(): Pick<AppState, "moduleIds" | "params"> {
  const moduleIds: Record<SlotKind, string | null> = { hero: null, midi: null, wave: null, overlay: null };
  const params: Record<SlotKind, ParamValues> = { hero: {}, midi: {}, wave: {}, overlay: {} };
  for (const slot of ALL_SLOTS) {
    const id = registry.list(slot)[0]?.id ?? null;
    moduleIds[slot] = id;
    params[slot] = paramsFor(id);
  }
  return { moduleIds, params };
}

export const useAppStore = create<AppState>()((set) => ({
  layout: DEFAULT_LAYOUT,
  gap: 12,
  ...initialSlots(),
  selectedSlot: "hero",
  theme: DEFAULT_THEME_SETTINGS,
  post: DEFAULT_POST_SETTINGS,
  setModule: (slot, id) =>
    set((s) => ({
      moduleIds: { ...s.moduleIds, [slot]: id },
      params: { ...s.params, [slot]: paramsFor(id) },
    })),
  setZoneHidden: (zone, hidden) => set((s) => ({ layout: withHidden(s.layout, zone, hidden) })),
  setZoneRatio: (zone, ratio) => set((s) => ({ layout: withRatio(s.layout, zone, ratio) })),
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
