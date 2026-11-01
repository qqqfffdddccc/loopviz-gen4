import type { ParamValues, SlotKind, VisualModule } from "@loopviz/mod-api";

export type AnyModule = VisualModule<ParamValues>;

export class ModuleRegistry {
  private readonly modules = new Map<string, AnyModule>();

  register<P extends ParamValues>(module: VisualModule<P>): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Module already registered: ${module.id}`);
    }
    this.modules.set(module.id, module as unknown as AnyModule);
  }

  list(slot: SlotKind): AnyModule[] {
    return [...this.modules.values()].filter((m) => m.slot === slot);
  }

  get(id: string): AnyModule | undefined {
    return this.modules.get(id);
  }
}
