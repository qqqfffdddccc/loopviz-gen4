import { useEffect } from "react";
import {
  checkRecovery,
  refreshRecent,
  requestNewProject,
  requestOpenProject,
  saveProject,
  saveProjectAs,
} from "./actions";
import { cancelAutosaveTimer, scheduleAutosave } from "./autosave";
import { startProjectWatch } from "./watch";

function isMac(): boolean {
  return navigator.platform.toUpperCase().includes("MAC");
}

function handleShortcut(event: KeyboardEvent): void {
  const modifier = isMac() ? event.metaKey : event.ctrlKey;
  if (!modifier || event.altKey) return;
  switch (event.key.toLowerCase()) {
    case "s":
      event.preventDefault();
      void (event.shiftKey ? saveProjectAs() : saveProject());
      break;
    case "o":
      event.preventDefault();
      requestOpenProject(null);
      break;
    case "n":
      event.preventDefault();
      requestNewProject();
      break;
    default:
      break;
  }
}

/** Слежение за изменениями, автосохранение, горячие клавиши и проверка автосохранения при старте. */
export function useProjectRuntime(): void {
  useEffect(() => {
    const stopWatch = startProjectWatch(scheduleAutosave);
    window.addEventListener("keydown", handleShortcut);
    void refreshRecent();
    void checkRecovery();
    return () => {
      stopWatch();
      window.removeEventListener("keydown", handleShortcut);
      cancelAutosaveTimer();
    };
  }, []);
}
