import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/space-mono/400.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { maybeRunAutotest } from "./export/autotest";
import { startMods } from "./mods/startup";
import { maybeRunProjectAutotest } from "./project/autotest";
import { syncThemeCss } from "./runtime/theme-css";
import "./styles.css";

syncThemeCss();

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

void maybeRunAutotest();
void maybeRunProjectAutotest();
startMods();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
