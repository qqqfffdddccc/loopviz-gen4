import type { Texture } from "three";
import {
  defaultParams,
  type FrameInput,
  type ModuleDefinition,
  type ParamValues,
  type SurfaceKind,
  type VisualModule,
} from "@loopviz/mod-api";
import { ModuleCrashError, describeError, type FailurePolicy, type FailureStage, type ModuleFailure } from "./module-failure";
import { drawPlaceholder } from "./placeholder";
import type { Surface } from "./surfaces";

export type SurfaceFactory = (kind: SurfaceKind) => Surface;

/**
 * Экземпляр модуля в слоте. Любое исключение модуля (init, prepare, resize, render) отключает экземпляр:
 * он освобождается, об ошибке один раз сообщается, а слот рисует заглушку. При `policy.failFast`
 * ошибка вместо заглушки уходит наружу как ModuleCrashError.
 */
export class SlotBinding {
  params: ParamValues;
  /** True после завершения init, в том числе неудачного: слот с заглушкой тоже рисуется. */
  ready = false;
  failure: ModuleFailure | null = null;
  private disposed = false;
  private width = 0;
  private height = 0;
  private module: VisualModule<ParamValues> | null = null;
  private surface: Surface | null = null;
  private placeholder: Surface | null = null;
  private placeholderSize = { w: 0, h: 0 };

  constructor(
    private readonly definition: ModuleDefinition<ParamValues>,
    private readonly createSurface: SurfaceFactory,
    private readonly policy: FailurePolicy,
  ) {
    this.params = defaultParams(definition.params);
  }

  get texture(): Texture {
    const surface = this.failure ? this.placeholder : this.surface;
    if (!surface) throw new Error(`Слот ${this.definition.id} ещё не готов к рисованию`);
    return surface.texture;
  }

  async init(): Promise<void> {
    try {
      this.module = this.definition.create();
      this.surface = this.createSurface(this.definition.surface);
      await this.module.init(this.surface.context);
    } catch (error) {
      this.fail("init", error);
    }
    this.ready = !this.disposed;
  }

  async prepare(): Promise<void> {
    if (this.failure || !this.module) return;
    try {
      await this.module.prepare?.(this.params);
    } catch (error) {
      this.fail("prepare", error);
    }
  }

  resize(w: number, h: number): void {
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    if (this.failure || !this.module || !this.surface) return;
    try {
      this.surface.resize(w, h);
      this.module.resize(w, h);
    } catch (error) {
      this.fail("resize", error);
    }
  }

  render(frame: FrameInput): void {
    if (this.failure) {
      this.drawPlaceholder(frame);
      return;
    }
    const { module, surface } = this;
    if (!module || !surface) return;
    let failed = false;
    let cause: unknown;
    surface.begin();
    try {
      module.render(frame, this.params);
    } catch (error) {
      failed = true;
      cause = error;
    } finally {
      surface.end();
    }
    if (failed) {
      this.fail("render", cause);
      this.drawPlaceholder(frame);
    }
  }

  /** Идемпотентен: модуль могут отпустить и при замене слота, и при завершении устаревшего init. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    this.release();
    this.placeholder?.dispose();
    this.placeholder = null;
  }

  private fail(stage: FailureStage, error: unknown): void {
    if (this.failure) return;
    const failure: ModuleFailure = {
      moduleId: this.definition.id,
      moduleName: this.definition.name,
      stage,
      message: describeError(error),
    };
    this.failure = failure;
    this.release();
    if (this.disposed) return;
    console.error(`[LoopViz] модуль ${failure.moduleId} отключён (${stage}):`, error);
    this.policy.onFailure?.(failure);
    if (this.policy.failFast) throw new ModuleCrashError(failure);
  }

  /** Освобождает модуль и его поверхность; ошибки dispose самого модуля не должны мешать остальному. */
  private release(): void {
    const { module, surface } = this;
    this.module = null;
    this.surface = null;
    try {
      module?.dispose();
    } catch (error) {
      console.warn(`[LoopViz] dispose модуля ${this.definition.id} бросил ошибку:`, error);
    }
    surface?.dispose();
  }

  private drawPlaceholder(frame: FrameInput): void {
    const placeholder = (this.placeholder ??= this.createSurface("canvas2d"));
    if (this.placeholderSize.w !== this.width || this.placeholderSize.h !== this.height) {
      placeholder.resize(this.width, this.height);
      this.placeholderSize = { w: this.width, h: this.height };
    }
    const { context } = placeholder;
    if (context.surface !== "canvas2d") return;
    placeholder.begin();
    drawPlaceholder(
      context.ctx,
      { w: this.width, h: this.height, frameHeight: frame.size.h },
      frame.theme,
      this.definition.name,
    );
    placeholder.end();
  }
}
