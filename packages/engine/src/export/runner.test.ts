import { describe, expect, it } from "vitest";
import { defaultOutputName, exportFrameCount, exportSize, flipRowsInto, frameByteLength, inFlightWindow } from "./plan";
import { ExportCancelled, progressAt, runFrameLoop, type FrameRenderer, type FrameSink } from "./runner";

class FakeRenderer implements FrameRenderer {
  readonly times: number[] = [];
  render(index: number, t: number, out: Uint8Array): void {
    this.times.push(t);
    out.fill(index % 256);
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("plan", () => {
  it("считает кадры и размеры", () => {
    expect(exportFrameCount(16, 60)).toBe(960);
    expect(exportFrameCount(15, 30)).toBe(450);
    expect(exportFrameCount(2.5 / 3, 30)).toBe(25);
    expect(exportSize("4k")).toEqual({ width: 2160, height: 3840 });
    expect(frameByteLength(exportSize("1080p"))).toBe(1080 * 1920 * 4);
  });

  it("ограничивает окно бюджетом памяти", () => {
    expect(inFlightWindow(frameByteLength(exportSize("1080p")))).toBe(8);
    expect(inFlightWindow(frameByteLength(exportSize("4k")))).toBe(8);
    expect(inFlightWindow(100 * 1024 * 1024)).toBe(2);
  });

  it("переворачивает строки", () => {
    const source = new Uint8Array([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
    const target = new Uint8Array(12);
    flipRowsInto(source, target, 1, 3);
    expect([...target]).toEqual([3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1]);
  });

  it("называет файл по пресету", () => {
    expect(defaultOutputName("my loop.wav", "4k", 60)).toBe("my_loop_2160x3840_60.mp4");
    expect(defaultOutputName("", "1080p", 30)).toBe("loopviz_1080x1920_30.mp4");
  });
});

describe("runFrameLoop", () => {
  it("отправляет все кадры по порядку с t = i / fps и целыми данными", async () => {
    const received: { index: number; first: number }[] = [];
    const sink: FrameSink = {
      async sendFrame(index, bytes) {
        await tick();
        received.push({ index, first: bytes[0] ?? -1 });
      },
    };
    const renderer = new FakeRenderer();
    await runFrameLoop({ frameCount: 40, fps: 30, frameBytes: 4, window: 3, renderer, sink });
    expect(received.map((r) => r.index)).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect(received.every((r) => r.first === r.index % 256)).toBe(true);
    expect(renderer.times[39]).toBeCloseTo(39 / 30, 12);
  });

  it("не даёт убежать вперёд окна", async () => {
    let inFlight = 0;
    let peak = 0;
    const sink: FrameSink = {
      async sendFrame() {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await tick();
        inFlight--;
      },
    };
    await runFrameLoop({ frameCount: 30, fps: 60, frameBytes: 4, window: 4, renderer: new FakeRenderer(), sink });
    expect(peak).toBeLessThanOrEqual(4);
  });

  it("прерывается по сигналу отмены", async () => {
    const controller = new AbortController();
    let sent = 0;
    const sink: FrameSink = {
      async sendFrame() {
        sent++;
        if (sent === 5) controller.abort();
      },
    };
    await expect(
      runFrameLoop({ frameCount: 100, fps: 60, frameBytes: 4, window: 2, renderer: new FakeRenderer(), sink, signal: controller.signal }),
    ).rejects.toBeInstanceOf(ExportCancelled);
    expect(sent).toBeLessThan(10);
  });

  it("пробрасывает ошибку sink", async () => {
    const sink: FrameSink = {
      async sendFrame(index) {
        if (index === 3) throw new Error("ffmpeg упал");
      },
    };
    await expect(runFrameLoop({ frameCount: 20, fps: 60, frameBytes: 4, window: 2, renderer: new FakeRenderer(), sink })).rejects.toThrow(
      "ffmpeg упал",
    );
  });

  it("считает прогресс и оценку времени", () => {
    const progress = progressAt(100, 400, 2);
    expect(progress.renderFps).toBe(50);
    expect(progress.etaSec).toBe(6);
  });
});
