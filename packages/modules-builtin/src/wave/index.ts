import type { ModuleRegistry } from "@loopviz/engine";
import { waveDots } from "./dots";
import { waveMirror } from "./mirror";
import { waveScope } from "./scope";

export { waveDots, waveMirror, waveScope };

export const waveModules = [waveMirror, waveDots, waveScope] as const;

export function registerWaveModules(registry: ModuleRegistry): void {
  registry.register(waveMirror);
  registry.register(waveDots);
  registry.register(waveScope);
}
