import type { FrameInput } from "@loopviz/mod-api";
import type { Compositor } from "../compositor";
import { readbackByteLength, type ReadbackFormat } from "../post/pack-pass";
import { AsyncReadback } from "./readback";
import type { ExportSize } from "./plan";
import type { FrameRenderer } from "./runner";
import { NO_PROFILER, type StageProfiler } from "./stage-profiler";

export interface FrameRendererOptions {
  format: ReadbackFormat;
  /** Сколько кадров может висеть между submit и collect: столько PBO в кольце. */
  depth: number;
  profiler?: StageProfiler;
}

function webgl2(gl: WebGLRenderingContext | WebGL2RenderingContext): WebGL2RenderingContext {
  if (!("fenceSync" in gl)) throw new Error("Экспорту нужен WebGL2");
  return gl;
}

/**
 * Рендерит кадр в offscreen-цель целевого размера, упаковывает его на GPU и читает через кольцо PBO.
 * submit только ставит работу в очередь GPU, collect дожидается готовности и копирует байты.
 */
export class CompositorFrameRenderer implements FrameRenderer {
  readonly depth: number;
  private readonly readback: AsyncReadback;
  private readonly profiler: StageProfiler;

  constructor(
    private readonly compositor: Compositor,
    private readonly size: ExportSize,
    private readonly buildFrame: (t: number, size: { w: number; h: number; dpr: number }) => FrameInput,
    private readonly options: FrameRendererOptions,
  ) {
    this.depth = Math.max(1, options.depth);
    this.profiler = options.profiler ?? NO_PROFILER;
    const gl = webgl2(compositor.renderer.getContext());
    this.readback = new AsyncReadback(gl, readbackByteLength(options.format, size), this.depth);
  }

  submit(index: number, t: number): void {
    const { width, height } = this.size;
    this.profiler.start();
    const frame = this.buildFrame(t, { w: width, h: height, dpr: 1 });
    this.profiler.lap("frameInput");
    const target = this.compositor.renderFramePacked(frame, this.size, this.options.format);
    this.readback.start(index, target.width, target.height);
    this.profiler.lap("readStart");
    this.profiler.frames++;
  }

  async collect(index: number, out: Uint8Array): Promise<void> {
    const startedAt = performance.now();
    await this.readback.finish(index, out);
    this.profiler.add("readWait", performance.now() - startedAt);
  }

  dispose(): void {
    this.readback.dispose();
  }
}
