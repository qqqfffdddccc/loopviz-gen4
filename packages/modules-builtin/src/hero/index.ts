import type { ModuleDefinition, ParamValues } from "@loopviz/mod-api";
import { heroFog } from "./fog";
import { heroOrb } from "./orb";
import { heroPetals } from "./petals";
import { heroRings } from "./rings";

export { heroFog, heroOrb, heroPetals, heroRings };

/** Порядок важен: первый модуль становится выбранным по умолчанию. */
export const heroModules: readonly ModuleDefinition<ParamValues>[] = [
  heroOrb,
  heroFog,
  heroRings,
  heroPetals,
] as unknown as readonly ModuleDefinition<ParamValues>[];
