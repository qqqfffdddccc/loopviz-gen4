import { DEFAULT_PROJECT_NAME } from "@loopviz/engine";
import { assertNever } from "@loopviz/mod-api";
import { isTauri } from "../export/ipc";
import { useSourceStore, type AnalysisStatus } from "../state/source-store";
import { requestNewProject, requestOpenProject, saveProject } from "./actions";
import { useProjectStore } from "./project-store";
import { RecentMenu } from "./RecentMenu";
import { TopBarNotices } from "./TopBarNotices";
import { useProjectRuntime } from "./useProjectRuntime";

const MAX_NAME_LENGTH = 120;

function analysisText(status: AnalysisStatus): string {
  switch (status.kind) {
    case "analyzing":
      return `АНАЛИЗ ${Math.round(status.progress * 100)}%`;
    case "decoding":
      return "ДЕКОДИРОВАНИЕ";
    case "idle":
    case "ready":
    case "error":
      return "";
    default:
      return assertNever(status);
  }
}

function BusyText() {
  const busy = useProjectStore((s) => s.busy);
  const status = useSourceStore((s) => s.status);
  if (busy === null) return null;
  return <span className="topbar-status">{`${busy} ${analysisText(status)}`.trim()}</span>;
}

function NameField() {
  const name = useProjectStore((s) => s.name);
  const dirty = useProjectStore((s) => s.dirty);
  const path = useProjectStore((s) => s.path);
  const patch = useProjectStore((s) => s.patch);
  return (
    <div className="project-name" title={path ?? "Файл ещё не сохранён"}>
      <input
        type="text"
        aria-label="Название проекта"
        value={name}
        maxLength={MAX_NAME_LENGTH}
        spellCheck={false}
        onChange={(event) => patch({ name: event.target.value })}
        onBlur={() => patch({ name: name.trim() || DEFAULT_PROJECT_NAME })}
      />
      <span className="dirty-mark" role="img" aria-label={dirty ? "Есть несохранённые изменения" : "Всё сохранено"}>
        {dirty ? "●" : ""}
      </span>
    </div>
  );
}

export function TopBar() {
  useProjectRuntime();
  const busy = useProjectStore((s) => s.busy) !== null;
  const desktop = isTauri();
  return (
    <header className="topbar" aria-label="Проект">
      <div className="topbar-row">
        <NameField />
        <button type="button" disabled={!desktop || busy} onClick={() => requestOpenProject(null)}>
          [↓] ОТКРЫТЬ
        </button>
        <button type="button" disabled={!desktop || busy} onClick={() => void saveProject()}>
          [↑] СОХРАНИТЬ
        </button>
        <button type="button" disabled={busy} onClick={requestNewProject}>
          [+] НОВЫЙ
        </button>
        <RecentMenu disabled={!desktop || busy} />
        <BusyText />
        {desktop ? null : (
          <span className="muted topbar-note" title="Файлы .loopviz открываются и сохраняются только в десктопном приложении. В браузере работает автосохранение в localStorage без аудио.">
            БРАУЗЕР: ФАЙЛЫ НЕДОСТУПНЫ
          </span>
        )}
      </div>
      <TopBarNotices />
    </header>
  );
}
