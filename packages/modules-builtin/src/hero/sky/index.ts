import type { ModuleDefinition, ParamValues } from "@loopviz/mod-api";
import { heroSkyCollage } from "./collage";
import { heroCirrus } from "./cirrus";
import { skyHalo } from "./halo";
import { heroSkyNodes } from "./nodes";
import { heroPlanes } from "./planes";

/** Небесные hero-модули. Первый из них выбирается по умолчанию в новом проекте. */
export const skyModules = [heroSkyCollage, skyHalo, heroCirrus, heroSkyNodes, heroPlanes] as unknown as readonly ModuleDefinition<ParamValues>[];
