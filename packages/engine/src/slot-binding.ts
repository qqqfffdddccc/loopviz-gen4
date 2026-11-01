import type { WebGLRenderer } from "three";
import { defaultParams, type FrameInput, type ModuleDefinition, type ParamValues, type VisualModule } from "@loopviz/mod-api";
import { createSurface, type Surface } from "./surfaces";

export class SlotBinding {
  readonly surface: Surface;
  params: ParamValues;
  ready = false;
  private disposed = false;
  private width = 0;
  private height = 0;

  readonly module: VisualModule<ParamValues>;

  constructor(definition: ModuleDefinition<ParamValues>, renderer: WebGLRenderer) {
    this.module = definition.create();
    this.surface = createSurface(definition.surface, renderer);
    this.params = defaultParams(definition.params);
  }

  async init(): Promise<void> {
    await this.module.init(this.surface.context);
    this.ready = !this.disposed;
  }

  async prepare(): Promise<void> {
    await this.module.prepare?.(this.params);
  }

  resize(w: number, h: number): void {
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.surface.resize(w, h);
    this.module.resize(w, h);
  }

  render(frame: FrameInput): void {
    this.surface.begin();
    try {
      this.module.render(frame, this.params);
    } finally {
      this.surface.end();
    }
  }

  /** Идемпотентен: модуль могут отпустить и при замене слота, и при завершении устаревшего init. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    this.module.dispose();
    this.surface.dispose();
  }
}
