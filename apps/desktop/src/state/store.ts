import { create } from "zustand";
import { DEFAULT_LAYOUT, withHidden, withRatio, type Layout, type ZoneKind } from "@loopviz/engine";
import { defaultParams, type ParamValues, type SlotKind } from "@loopviz/mod-api";
import { registry } from "../runtime/registry";
import { ALL_SLOTS } from "./slots";

export interface AppState {
  layout: Layout;
  gap: number;
  moduleIds: Record<SlotKind, string | null>;
  params: Record<SlotKind, ParamValues>;
  selectedSlot: SlotKind;
  setModule(slot: SlotKind, id: string | null): void;
  setZoneHidden(zone: ZoneKind, hidden: boolean): void;
  setZoneRatio(zone: ZoneKind, ratio: number): void;
  selectSlot(slot: SlotKind): void;
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
  setModule: (slot, id) =>
    set((s) => ({
      moduleIds: { ...s.moduleIds, [slot]: id },
      params: { ...s.params, [slot]: paramsFor(id) },
    })),
  setZoneHidden: (zone, hidden) => set((s) => ({ layout: withHidden(s.layout, zone, hidden) })),
  setZoneRatio: (zone, ratio) => set((s) => ({ layout: withRatio(s.layout, zone, ratio) })),
  selectSlot: (slot) => set({ selectedSlot: slot }),
}));
