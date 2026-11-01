import { defaultProjectState } from "./defaults";
import { migrateProject } from "./migrate";
import {
  parseExport,
  parseLayoutSection,
  parseMedia,
  parseModules,
  parsePost,
  parseSource,
  parseTheme,
  parseTimeline,
} from "./parse-sections";
import { ProjectError, readObject, readString } from "./read";
import { DEFAULT_PROJECT_NAME, type ParsedProject, type ProjectState } from "./types";

const MAX_NAME_LENGTH = 120;

function decode(input: string | unknown): unknown {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ProjectError(`файл не является корректным JSON (${reason})`);
  }
}

/**
 * Разбирает файл проекта. Неверный тип известного поля даёт ProjectError с путём к полю,
 * отсутствующие поля берутся из `defaults`, неизвестные игнорируются.
 */
export function parseProject(input: string | unknown, defaults: ProjectState = defaultProjectState()): ParsedProject {
  const raw = migrateProject(decode(input));
  const name = readString(raw, "name", "", defaults.name).trim().slice(0, MAX_NAME_LENGTH) || DEFAULT_PROJECT_NAME;
  const state: ProjectState = {
    name,
    media: parseMedia(readObject(raw, "media", "")),
    source: parseSource(readObject(raw, "source", ""), defaults.source),
    timeline: parseTimeline(readObject(raw, "timeline", ""), defaults.timeline),
    modules: parseModules(readObject(raw, "modules", ""), defaults.modules),
    layout: parseLayoutSection(readObject(raw, "layout", ""), defaults.layout),
    theme: parseTheme(readObject(raw, "theme", ""), defaults.theme),
    post: parsePost(readObject(raw, "post", ""), defaults.post),
    export: parseExport(readObject(raw, "export", ""), defaults.export),
  };
  return { savedAt: readString(raw, "savedAt", "", ""), state };
}
