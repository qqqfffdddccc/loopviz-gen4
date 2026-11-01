import { create } from "zustand";
import { parseLayout, type Layout, type LayoutPreset } from "@loopviz/engine";

const STORAGE_KEY = "loopviz.layoutPresets.v1";
const MAX_NAME_LENGTH = 24;

interface PresetsState {
  user: LayoutPreset[];
  save(name: string, layout: Layout): void;
  remove(id: string): void;
}

function parsePreset(value: unknown): LayoutPreset | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, name, layout } = value as Record<string, unknown>;
  const parsed = parseLayout(layout);
  return typeof id === "string" && typeof name === "string" && parsed ? { id, name, layout: parsed } : null;
}

function load(): LayoutPreset[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.map(parsePreset).filter((p): p is LayoutPreset => p !== null) : [];
  } catch {
    return [];
  }
}

function persist(user: LayoutPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Хранилище недоступно или переполнено: пресеты живут до перезапуска.
  }
}

export const useLayoutPresets = create<PresetsState>()((set) => ({
  user: load(),
  save: (rawName, layout) => {
    const name = rawName.trim().slice(0, MAX_NAME_LENGTH).toUpperCase();
    if (!name) return;
    set((s) => {
      const existing = s.user.find((p) => p.name === name);
      const preset: LayoutPreset = { id: existing?.id ?? `user-${Date.now().toString(36)}`, name, layout };
      const user = existing ? s.user.map((p) => (p.id === existing.id ? preset : p)) : [...s.user, preset];
      persist(user);
      return { user };
    });
  },
  remove: (id) =>
    set((s) => {
      const user = s.user.filter((p) => p.id !== id);
      persist(user);
      return { user };
    }),
}));
