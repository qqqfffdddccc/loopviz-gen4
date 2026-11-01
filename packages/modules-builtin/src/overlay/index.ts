import type { ModuleRegistry } from "@loopviz/engine";
import { overlayText } from "./text";

export { overlayText };

export const overlayModules = [overlayText] as const;

export function registerOverlayModules(registry: ModuleRegistry): void {
  registry.register(overlayText);
}
