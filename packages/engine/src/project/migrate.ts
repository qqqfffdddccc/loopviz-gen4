import { PROJECT_FORMAT, PROJECT_VERSION } from "./types";
import { isRaw, ProjectError, type Raw } from "./read";

/** Переход с версии N на N+1. Ключ равен N. Пока формат один, таблица пуста. */
const MIGRATIONS: Readonly<Record<number, (raw: Raw) => Raw>> = {};

export function migrateProject(input: unknown, current = PROJECT_VERSION, migrations = MIGRATIONS): Raw {
  if (!isRaw(input)) throw new ProjectError("файл проекта должен быть JSON-объектом");
  if (input["format"] !== PROJECT_FORMAT) throw new ProjectError("это не файл LoopViz (поле format)", "format");

  const version = input["version"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new ProjectError("версия должна быть целым числом от 1", "version");
  }
  if (version > current) {
    throw new ProjectError(`проект сохранён в более новой версии формата (${version}), эта сборка понимает до ${current}`, "version");
  }

  let raw: Raw = input;
  for (let from = version; from < current; from++) {
    const step = migrations[from];
    if (!step) throw new ProjectError(`нет миграции с версии ${from}`, "version");
    raw = { ...step(raw), version: from + 1 };
  }
  return raw;
}
