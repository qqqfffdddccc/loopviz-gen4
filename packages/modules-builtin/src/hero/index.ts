import type { ModuleDefinition, ParamValues } from "@loopviz/mod-api";
import { heroFog } from "./fog";
import { heroOrb } from "./orb";
import { heroPetals } from "./petals";
import { heroRings } from "./rings";
import { skyModules } from "./sky";

export { heroFog, heroOrb, heroPetals, heroRings };

const legacyHeroModules = [heroOrb, heroFog, heroRings, heroPetals] as unknown as readonly ModuleDefinition<ParamValues>[];

/** Порядок важен: первый видимый модуль становится выбранным по умолчанию. Старые скрыты из списка, но открываются в проектах. */
export const heroModules: readonly ModuleDefinition<ParamValues>[] = [
  ...skyModules,
  ...legacyHeroModules.map((definition) => ({ ...definition, hidden: true })),
];
