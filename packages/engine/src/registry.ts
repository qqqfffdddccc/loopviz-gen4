import type { ModuleDefinition, ParamValues, SlotKind, VisualModule } from "@loopviz/mod-api";

export type AnyDefinition = ModuleDefinition<ParamValues>;

export class ModuleRegistry {
  private readonly definitions = new Map<string, AnyDefinition>();

  register<P extends ParamValues>(definition: ModuleDefinition<P>): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Module already registered: ${definition.id}`);
    }
    this.definitions.set(definition.id, definition as unknown as AnyDefinition);
  }

  list(slot: SlotKind): AnyDefinition[] {
    return [...this.definitions.values()].filter((d) => d.slot === slot);
  }

  get(id: string): AnyDefinition | undefined {
    return this.definitions.get(id);
  }

  /** Каждый вызов даёт новый независимый экземпляр. */
  create(id: string): VisualModule<ParamValues> | undefined {
    return this.definitions.get(id)?.create();
  }
}
