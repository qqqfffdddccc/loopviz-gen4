export class ProjectError extends Error {
  constructor(
    message: string,
    readonly path = "",
  ) {
    super(path ? `${path}: ${message}` : message);
    this.name = "ProjectError";
  }
}

export type Raw = Record<string, unknown>;

export function isRaw(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function join(path: string, key: string | number): string {
  return path ? `${path}.${key}` : String(key);
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Поле может отсутствовать (undefined), но если есть, обязано быть объектом. */
export function readObject(parent: Raw, key: string, path: string): Raw | undefined {
  const value = parent[key];
  if (value === undefined) return undefined;
  if (!isRaw(value)) throw new ProjectError("ожидался объект", join(path, key));
  return value;
}

export function readNumber(
  parent: Raw,
  key: string,
  path: string,
  fallback: number,
  range?: { min: number; max: number },
): number {
  const value = parent[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ProjectError("ожидалось число", join(path, key));
  return range ? clampNumber(value, range.min, range.max) : value;
}

export function readInt(parent: Raw, key: string, path: string, fallback: number, range: { min: number; max: number }): number {
  return Math.round(readNumber(parent, key, path, fallback, range));
}

export function readBoolean(parent: Raw, key: string, path: string, fallback: boolean): boolean {
  const value = parent[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new ProjectError("ожидалось true или false", join(path, key));
  return value;
}

export function readString(parent: Raw, key: string, path: string, fallback: string): string {
  const value = parent[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new ProjectError("ожидалась строка", join(path, key));
  return value;
}

export function readEnum<T extends string | number>(
  parent: Raw,
  key: string,
  path: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = parent[key];
  if (value === undefined) return fallback;
  const match = allowed.find((item) => item === value);
  if (match === undefined) throw new ProjectError(`допустимы ${allowed.join(", ")}`, join(path, key));
  return match;
}
