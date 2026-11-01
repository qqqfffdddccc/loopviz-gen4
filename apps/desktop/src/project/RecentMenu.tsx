import { useEffect, useRef, useState } from "react";
import { requestOpenProject } from "./actions";
import { fileStem, useProjectStore } from "./project-store";

function folderOf(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf("/"))).replace(/^\/Users\/[^/]+/, "~");
}

export function RecentMenu({ disabled }: { disabled: boolean }) {
  const recent = useProjectStore((s) => s.recent);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  const empty = recent.length === 0;
  return (
    <div className="recent" ref={rootRef}>
      <button type="button" aria-expanded={open} disabled={disabled || empty} onClick={() => setOpen((v) => !v)}>
        [{open ? "▴" : "▾"}] НЕДАВНИЕ
      </button>
      {open ? (
        <ul className="recent-list" aria-label="Недавние проекты">
          {recent.map((path) => (
            <li key={path}>
              <button
                type="button"
                title={path}
                onClick={() => {
                  setOpen(false);
                  requestOpenProject(path);
                }}
              >
                {fileStem(path)}
                <span className="muted"> {folderOf(path)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
