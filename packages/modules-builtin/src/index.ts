import type { ModuleRegistry } from "@loopviz/engine";
import { createHeroPulse } from "./hero-pulse";
import { createMidiBlocks } from "./midi-blocks";
import { createOverlayText } from "./overlay-text";
import { createWaveSine } from "./wave-sine";

export { createHeroPulse, createMidiBlocks, createOverlayText, createWaveSine };

export function registerBuiltinModules(registry: ModuleRegistry): void {
  registry.register(createHeroPulse());
  registry.register(createMidiBlocks());
  registry.register(createWaveSine());
  registry.register(createOverlayText());
}
