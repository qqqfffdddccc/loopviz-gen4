import type { ModuleRegistry } from "@loopviz/engine";
import { heroPulse } from "./hero-pulse";
import { midiRoll } from "./midi-roll";
import { overlayText } from "./overlay-text";
import { wavePeaks } from "./wave-peaks";

export { heroPulse, midiRoll, overlayText, wavePeaks };

export function registerBuiltinModules(registry: ModuleRegistry): void {
  registry.register(heroPulse);
  registry.register(midiRoll);
  registry.register(wavePeaks);
  registry.register(overlayText);
}
