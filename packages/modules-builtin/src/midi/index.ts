import type { ModuleRegistry } from "@loopviz/engine";
import { midiCircle } from "./circle";
import { midiFalling } from "./falling";
import { midiRoll } from "./roll";

export { midiCircle, midiFalling, midiRoll };

export const midiModules = [midiRoll, midiFalling, midiCircle] as const;

export function registerMidiModules(registry: ModuleRegistry): void {
  registry.register(midiRoll);
  registry.register(midiFalling);
  registry.register(midiCircle);
}
