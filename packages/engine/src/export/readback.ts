import { Yielder } from "./yielder";

/** Минимум WebGL2, который нужен кольцу: так его можно проверить подделкой без GPU. */
export type ReadbackGl = Pick<
  WebGL2RenderingContext,
  | "PIXEL_PACK_BUFFER"
  | "STREAM_READ"
  | "RGBA"
  | "UNSIGNED_BYTE"
  | "SYNC_GPU_COMMANDS_COMPLETE"
  | "ALREADY_SIGNALED"
  | "CONDITION_SATISFIED"
  | "WAIT_FAILED"
  | "createBuffer"
  | "deleteBuffer"
  | "bindBuffer"
  | "bufferData"
  | "readPixels"
  | "fenceSync"
  | "clientWaitSync"
  | "deleteSync"
  | "getBufferSubData"
  | "flush"
>;

interface Slot {
  buffer: WebGLBuffer;
  sync: WebGLSync | null;
}

/**
 * Кольцо PIXEL_PACK_BUFFER с fence на каждый кадр. `start` ставит чтение кадра в очередь GPU и сразу
 * возвращается, `finish` ждёт fence и копирует байты. Пока ждём, GPU успевает рисовать следующие кадры.
 * Fence в WebGL получает статус только между задачами, поэтому ожидание отдаёт цикл событий.
 */
export class AsyncReadback {
  private readonly slots: Slot[] = [];
  private readonly yielder = new Yielder();

  constructor(
    private readonly gl: ReadbackGl,
    readonly byteLength: number,
    readonly depth: number,
  ) {
    for (let i = 0; i < depth; i++) {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, byteLength, gl.STREAM_READ);
      this.slots.push({ buffer, sync: null });
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  }

  /** Читает привязанный framebuffer в буфер кольца кадра `frame`. */
  start(frame: number, width: number, height: number): void {
    const { gl } = this;
    const slot = this.slotOf(frame);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.buffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.dropSync(slot);
    slot.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    // Без flush команды могут застрять в очереди, и fence не сработает, пока их что-то не вытолкнет.
    gl.flush();
  }

  async finish(frame: number, out: Uint8Array): Promise<void> {
    const { gl } = this;
    const slot = this.slotOf(frame);
    const { sync } = slot;
    if (!sync) throw new Error(`Чтение кадра ${frame} не было запущено`);
    for (;;) {
      const status = gl.clientWaitSync(sync, 0, 0);
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) break;
      if (status === gl.WAIT_FAILED) throw new Error("clientWaitSync вернул WAIT_FAILED");
      await this.yielder.turn();
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.buffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out, 0, this.byteLength);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.dropSync(slot);
  }

  dispose(): void {
    this.yielder.close();
    for (const slot of this.slots) {
      this.dropSync(slot);
      this.gl.deleteBuffer(slot.buffer);
    }
    this.slots.length = 0;
  }

  private slotOf(frame: number): Slot {
    const slot = this.slots[frame % this.depth];
    if (!slot) throw new Error("Кольцо чтения уже освобождено");
    return slot;
  }

  private dropSync(slot: Slot): void {
    if (slot.sync) this.gl.deleteSync(slot.sync);
    slot.sync = null;
  }
}
