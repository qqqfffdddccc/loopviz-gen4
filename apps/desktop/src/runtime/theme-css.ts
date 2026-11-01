import { buildTheme, linearToHex, type ThemeSettings } from "@loopviz/engine";
import { useAppStore } from "../state/store";

let cachedSettings: ThemeSettings | null = null;
let cachedHex = "#ff5e30";

/** Hex акцента темы. Результат запоминается по ссылке на настройки, поэтому вызов из rAF почти бесплатен. */
export function accentHexFor(settings: ThemeSettings): string {
  if (settings !== cachedSettings) {
    cachedSettings = settings;
    cachedHex = linearToHex(buildTheme(settings).accent);
  }
  return cachedHex;
}

/** Держит CSS-переменную --accent в синхроне с темой, чтобы интерфейс красился акцентом. */
export function syncThemeCss(): () => void {
  const root = document.documentElement;
  const apply = (settings: ThemeSettings): void => root.style.setProperty("--accent", accentHexFor(settings));
  apply(useAppStore.getState().theme);
  return useAppStore.subscribe((state, previous) => {
    if (state.theme !== previous.theme) apply(state.theme);
  });
}
