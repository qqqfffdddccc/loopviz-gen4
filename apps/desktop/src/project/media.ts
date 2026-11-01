import { allowedExtensions, type MediaKind, type MediaRef } from "@loopviz/engine";
import { errorMessage, isTauri } from "../export/ipc";
import { mediaRead, mediaStore } from "./ipc";
import { notify, useProjectStore } from "./project-store";

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

async function browserHash(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Кладёт копию импортированного файла в кеш медиа приложения и запоминает ссылку в проекте.
 * В браузере кеша нет: ссылка с хешем остаётся, а при открытии проекта файл будет считаться потерянным.
 */
export async function registerMedia(kind: MediaKind, name: string, bytes: ArrayBuffer): Promise<MediaRef | null> {
  const ext = extensionOf(name);
  if (!allowedExtensions(kind).includes(ext)) {
    useProjectStore.getState().setMedia(kind, null);
    notify("warn", `Формат .${ext} проект открыть не сможет: ${name} не сохранён в проект`);
    return null;
  }
  try {
    const hash = isTauri() ? (await mediaStore(new Uint8Array(bytes), ext)).hash : await browserHash(bytes);
    const ref: MediaRef = { name, hash, ext, size: bytes.byteLength };
    useProjectStore.getState().setMedia(kind, ref);
    return ref;
  } catch (error) {
    useProjectStore.getState().setMedia(kind, null);
    notify("warn", `Копия ${name} не сохранена в кеш, проект не сможет открыть её позже: ${errorMessage(error)}`);
    return null;
  }
}

/** Бросает ошибку, если файла нет в кеше или нет десктопного приложения. */
export async function readMedia(ref: MediaRef): Promise<ArrayBuffer> {
  if (!isTauri()) throw new Error("кеш медиа доступен только в десктопном приложении");
  return mediaRead(ref.hash, ref.ext);
}
