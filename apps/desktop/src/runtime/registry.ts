import { ModuleRegistry } from "@loopviz/engine";
import { registerBuiltinModules } from "@loopviz/modules-builtin";

export const registry = new ModuleRegistry();
registerBuiltinModules(registry);
