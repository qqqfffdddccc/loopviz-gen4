import { create } from "zustand";
import { DEFAULT_PROJECT_NAME, type MediaRef } from "@loopviz/engine";

export type MessageKind = "info" | "warn" | "error";

export interface ProjectMessage {
  kind: MessageKind;
  text: string;
}

/** Действие, которое ждёт ответа на вопрос о несохранённых изменениях. */
export type PendingAction = { kind: "new" } | { kind: "open"; path: string | null };

export interface RecoverOffer {
  path: string | null;
  json: string;
}

export interface ProjectStoreState {
  name: string;
  path: string | null;
  dirty: boolean;
  media: { audio: MediaRef | null; midi: MediaRef | null };
  /** Выбор треков из файла, чей MIDI не нашёлся: чтобы повторное сохранение не теряло его. */
  carriedTracks: number[] | null;
  recent: string[];
  /** Текст длинной операции (открытие, сохранение) или null. */
  busy: string | null;
  message: ProjectMessage | null;
  pending: PendingAction | null;
  recover: RecoverOffer | null;
  patch(partial: Partial<Omit<ProjectStoreState, "patch" | "setMedia">>): void;
  setMedia(kind: "audio" | "midi", ref: MediaRef | null): void;
}

export const useProjectStore = create<ProjectStoreState>()((set) => ({
  name: DEFAULT_PROJECT_NAME,
  path: null,
  dirty: false,
  media: { audio: null, midi: null },
  carriedTracks: null,
  recent: [],
  busy: null,
  message: null,
  pending: null,
  recover: null,
  patch: (partial) => set(partial),
  setMedia: (kind, ref) =>
    set((s) => ({ media: { ...s.media, [kind]: ref }, carriedTracks: kind === "midi" ? null : s.carriedTracks })),
}));

export function notify(kind: MessageKind, text: string): void {
  useProjectStore.getState().patch({ message: { kind, text } });
}

export function fileStem(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.loopviz$/i, "");
}
