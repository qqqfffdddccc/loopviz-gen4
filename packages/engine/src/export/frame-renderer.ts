import type { FrameInput } from "@loopviz/mod-api";
import type { Compositor } from "../compositor";
import { flipRowsInto, type ExportSize } from "./plan";
import type { FrameRenderer } from "./runner";

/** Рендер в offscreen-цель целевого размера и чтение пикселей в переиспользуемый буфер. */
export class CompositorFrameRenderer implements FrameRenderer {
  private readonly scratch: Uint8Array;

  constructor(
    private readonly compositor: Compositor,
    private readonly size: ExportSize,
    private readonly buildFrame: (t: number, size: { w: number; h: number; dpr: number }) => FrameInput,
  ) {
    this.scratch = new Uint8Array(size.width * size.height * 4);
  }

  render(_index: number, t: number, out: Uint8Array): void {
    const { width, height } = this.size;
    const frame = this.buildFrame(t, { w: width, h: height, dpr: 1 });
    const target = this.compositor.renderFrameToTarget(frame, this.size);
    this.compositor.renderer.readRenderTargetPixels(target, 0, 0, width, height, this.scratch);
    flipRowsInto(this.scratch, out, width, height);
  }
}
