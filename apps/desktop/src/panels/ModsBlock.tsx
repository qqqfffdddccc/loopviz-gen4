import { useState } from "react";
import { Section } from "../ui/Section";
import { errorMessage, isTauri } from "../export/ipc";
import { revealModsDir } from "../mods/ipc";
import { loadMods } from "../mods/loader";
import { useModsStore } from "../mods/mods-store";
import "../mods/mods.css";

const BROWSER_NOTE = "Моды работают только в приложении LoopViz. В браузере папка модов недоступна.";

export function ModsBlock() {
  const status = useModsStore((s) => s.status);
  const results = useModsStore((s) => s.results);
  const listError = useModsStore((s) => s.listError);
  const failures = useModsStore((s) => s.runtimeFailures);
  const [actionError, setActionError] = useState<string | null>(null);
  const desktop = isTauri();
  const loading = status === "loading";

  const reveal = async (): Promise<void> => {
    try {
      await revealModsDir();
      setActionError(null);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  return (
    <Section title="МОДЫ" defaultOpen={false}>
      <div className="mods-block">
        {!desktop ? <p className="muted">{BROWSER_NOTE}</p> : null}
        {desktop && status === "ready" && results.length === 0 && !listError ? (
          <p className="muted">МОДОВ НЕТ. ПОЛОЖИТЕ ПАПКУ МОДА В ПАПКУ МОДОВ И НАЖМИТЕ ПЕРЕЗАГРУЗИТЬ.</p>
        ) : null}
        <ul className="mods-list">
          {results.map((result) => {
            if (result.status === "ok") {
              const crash = failures[result.moduleId];
              return (
                <li key={result.moduleId}>
                  [{crash ? "!" : "●"}] {result.manifest.name} v{result.manifest.version} ({result.manifest.slot})
                  {crash ? <span className="mod-error">упал в {crash.stage}: {crash.message}</span> : null}
                </li>
              );
            }
            return (
              <li key={result.path}>
                [ ] {result.label}
                {result.errors.map((error) => (
                  <span key={error} className="mod-error">
                    {error}
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
        {listError ? <p className="notice">{listError}</p> : null}
        {actionError ? <p className="notice">{actionError}</p> : null}
        <div className="mods-actions">
          <button type="button" className="file-button" disabled={!desktop || loading} onClick={() => void loadMods()}>
            [↻] ПЕРЕЗАГРУЗИТЬ
          </button>
          <button type="button" className="file-button" disabled={!desktop} onClick={() => void reveal()}>
            [↗] ПАПКА МОДОВ
          </button>
        </div>
      </div>
    </Section>
  );
}
