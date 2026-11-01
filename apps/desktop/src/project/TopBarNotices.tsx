import { declineRestore, resolvePending, restoreSession } from "./actions";
import { useProjectStore } from "./project-store";

export function TopBarNotices() {
  const recover = useProjectStore((s) => s.recover);
  const pending = useProjectStore((s) => s.pending);
  const message = useProjectStore((s) => s.message);
  const patch = useProjectStore((s) => s.patch);

  return (
    <>
      {recover ? (
        <p className="topbar-notice" role="status">
          ВОССТАНОВИТЬ ПОСЛЕДНЮЮ СЕССИЮ?
          <button type="button" onClick={() => void restoreSession()}>
            [ДА]
          </button>
          <button type="button" onClick={() => void declineRestore()}>
            [НЕТ]
          </button>
        </p>
      ) : null}
      {pending ? (
        <p className="topbar-notice" role="status" aria-label="Несохранённые изменения">
          В ПРОЕКТЕ ЕСТЬ НЕСОХРАНЁННЫЕ ИЗМЕНЕНИЯ.
          <button type="button" onClick={() => void resolvePending("save")}>
            [СОХРАНИТЬ]
          </button>
          <button type="button" onClick={() => void resolvePending("discard")}>
            [НЕ СОХРАНЯТЬ]
          </button>
          <button type="button" onClick={() => void resolvePending("cancel")}>
            [ОТМЕНА]
          </button>
        </p>
      ) : null}
      {message ? (
        <p className={`topbar-notice ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
          <button type="button" aria-label="Скрыть сообщение" onClick={() => patch({ message: null })}>
            [×]
          </button>
        </p>
      ) : null}
    </>
  );
}
