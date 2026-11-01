import type { ModuleRegistry } from "@loopviz/engine";
import { heroModules } from "./hero";
import { registerMidiModules } from "./midi";
import { registerOverlayModules } from "./overlay";
import { registerWaveModules } from "./wave";

export { heroModules };
export { overlayModules } from "./overlay";
export { midiModules } from "./midi";
export { waveModules } from "./wave";

export function registerBuiltinModules(registry: ModuleRegistry): void {
  for (const definition of heroModules) registry.register(definition);
  registerMidiModules(registry);
  registerWaveModules(registry);
  registerOverlayModules(registry);
}
