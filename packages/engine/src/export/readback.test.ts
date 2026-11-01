import { describe, expect, it } from "vitest";
import { AsyncReadback, type ReadbackGl } from "./readback";

const SIGNALED = 0x911a;
const TIMEOUT = 0x911b;

function fakeGl(statuses: number[]) {
  const calls: string[] = [];
  let polls = 0;
  const gl = {
    PIXEL_PACK_BUFFER: 1,
    STREAM_READ: 2,
    RGBA: 3,
    UNSIGNED_BYTE: 4,
    SYNC_GPU_COMMANDS_COMPLETE: 5,
    ALREADY_SIGNALED: SIGNALED,
    CONDITION_SATISFIED: 0x911c,
    WAIT_FAILED: 0x911d,
    createBuffer: () => ({}) as WebGLBuffer,
    deleteBuffer: () => calls.push("deleteBuffer"),
    bindBuffer: () => undefined,
    bufferData: () => undefined,
    readPixels: () => calls.push("readPixels"),
    fenceSync: () => ({}) as WebGLSync,
    clientWaitSync: () => {
      calls.push("poll");
      return statuses[Math.min(polls++, statuses.length - 1)] ?? SIGNALED;
    },
    deleteSync: () => calls.push("deleteSync"),
    getBufferSubData: (_target: number, _offset: number, dst: Uint8Array) => {
      dst.fill(7);
      calls.push("getBufferSubData");
    },
    flush: () => calls.push("flush"),
  } as unknown as ReadbackGl;
  return { gl, calls };
}

describe("AsyncReadback", () => {
  it("ждёт fence через опрос и копирует байты только после сигнала", async () => {
    const { gl, calls } = fakeGl([TIMEOUT, TIMEOUT, SIGNALED]);
    const readback = new AsyncReadback(gl, 4, 2);
    readback.start(0, 1, 1);
    const out = new Uint8Array(4);
    await readback.finish(0, out);
    expect([...out]).toEqual([7, 7, 7, 7]);
    expect(calls.filter((call) => call === "poll")).toHaveLength(3);
    expect(calls.indexOf("getBufferSubData")).toBeGreaterThan(calls.lastIndexOf("poll"));
    expect(calls).toContain("flush");
    readback.dispose();
  });

  it("не даёт собрать кадр, чтение которого не запускали", async () => {
    const { gl } = fakeGl([SIGNALED]);
    const readback = new AsyncReadback(gl, 4, 2);
    await expect(readback.finish(1, new Uint8Array(4))).rejects.toThrow("не было запущено");
    readback.dispose();
  });

  it("освобождает буферы и fence", () => {
    const { gl, calls } = fakeGl([SIGNALED]);
    const readback = new AsyncReadback(gl, 4, 3);
    readback.start(0, 1, 1);
    readback.dispose();
    expect(calls.filter((call) => call === "deleteBuffer")).toHaveLength(3);
    expect(calls).toContain("deleteSync");
  });
});
