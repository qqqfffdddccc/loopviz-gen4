import { API_VERSION, SLOT_KINDS, type ModManifest, type SlotKind } from "@loopviz/mod-api";

export const MOD_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;
export const MOD_MODULE_PREFIX = "mod.";

const MAX_NAME = 64;
const MAX_VERSION = 32;
const MAX_AUTHOR = 100;
const MAX_DESCRIPTION = 500;
const ENTRY_EXTENSION = /\.m?js$/;

export type ManifestResult = { ok: true; manifest: ModManifest } | { ok: false; errors: string[] };

/** Id в реестре: префикс гарантирует, что мод не затрёт встроенный модуль. */
export function modModuleId(manifestId: string): string {
  return `${MOD_MODULE_PREFIX}${manifestId}`;
}

export function isModModuleId(id: string): boolean {
  return id.startsWith(MOD_MODULE_PREFIX);
}

export function isSlotKind(value: unknown): value is SlotKind {
  return SLOT_KINDS.some((slot) => slot === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textField(raw: Record<string, unknown>, key: string, max: number, errors: string[]): string | null {
  const value = raw[key];
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`поле «${key}» должно быть непустой строкой`);
    return null;
  }
  if (value.length > max) {
    errors.push(`поле «${key}» длиннее ${max} символов`);
    return null;
  }
  return value;
}

function optionalText(raw: Record<string, unknown>, key: string, max: number, errors: string[]): string | undefined {
  const value = raw[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > max) {
    errors.push(`поле «${key}» должно быть строкой не длиннее ${max} символов`);
    return undefined;
  }
  return value;
}

/** Путь внутри папки мода: относительный, без `..`, обратных слэшей и нулевых байтов. */
export function isSafeRelativePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

export function parseManifest(raw: unknown): ManifestResult {
  if (!isRecord(raw)) return { ok: false, errors: ["manifest.json должен быть JSON-объектом"] };
  const errors: string[] = [];

  const id = textField(raw, "id", 48, errors);
  if (id !== null && !MOD_ID_PATTERN.test(id)) {
    errors.push("id: допустимы строчные латинские буквы, цифры и дефис, 2-48 символов, первым идёт буква или цифра");
  }
  const name = textField(raw, "name", MAX_NAME, errors);
  const version = textField(raw, "version", MAX_VERSION, errors);
  const entry = textField(raw, "entry", 120, errors);
  if (entry !== null && (!isSafeRelativePath(entry) || !ENTRY_EXTENSION.test(entry))) {
    errors.push("entry: относительный путь к .js или .mjs файлу внутри папки мода, без «..»");
  }

  const slot = raw["slot"];
  if (!isSlotKind(slot)) errors.push(`slot: ожидается одно из ${SLOT_KINDS.join(", ")}`);

  const apiVersion = raw["apiVersion"];
  if (typeof apiVersion !== "number" || !Number.isInteger(apiVersion)) {
    errors.push("apiVersion должен быть целым числом");
  } else if (apiVersion !== API_VERSION) {
    errors.push(`несовместимая версия API: мод рассчитан на v${apiVersion}, приложение поддерживает v${API_VERSION}`);
  }

  const author = optionalText(raw, "author", MAX_AUTHOR, errors);
  const description = optionalText(raw, "description", MAX_DESCRIPTION, errors);

  if (errors.length > 0 || id === null || name === null || version === null || entry === null || !isSlotKind(slot)) {
    return { ok: false, errors };
  }
  if (typeof apiVersion !== "number") return { ok: false, errors };
  const manifest: ModManifest = { id, name, slot, version, apiVersion, entry };
  if (author !== undefined) manifest.author = author;
  if (description !== undefined) manifest.description = description;
  return { ok: true, manifest };
}
