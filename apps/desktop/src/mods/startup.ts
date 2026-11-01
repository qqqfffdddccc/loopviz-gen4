import { maybeRunModsAutotest } from "./autotest";
import { loadMods } from "./loader";

/** Первая загрузка модов при старте приложения; в обычном браузере loadMods отметит моды недоступными. */
export function startMods(): void {
  void loadMods();
  void maybeRunModsAutotest();
}
