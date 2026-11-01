import { describe, expect, it } from "vitest";
import { defaultOutputName, exportFrameCount, exportSize, frameByteLength, inFlightWindow } from "./plan";
import { ExportCancelled, progressAt, runFrameLoop, type FrameRenderer, type FrameSink } from "./runner";

class FakeRenderer implements FrameRenderer {
  readonly times: number[] = [];
  readonly order: string[] = [];
  private peak = 0;
  private open = 0;

  constructor(readonly depth = 3) {}

  get maxOpen(): number {
    return this.peak;
  }

  submit(index: number, t: number): void {
    this.times.push(t);
    this.order.push(`s${index}`);
    this.open++;
    this.peak = Math.max(this.peak, this.open);
  }

  async collect(index: number, out: Uint8Array): Promise<void> {
    await tick();
    this.order.push(`c${index}`);
    this.open--;
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
    expect(frameByteLength(exportSize("1080p"), "rgba")).toBe(1080 * 1920 * 4);
    expect(frameByteLength(exportSize("1080p"), "yuv420p")).toBe(1080 * 1920 * 1.5);
  });

  it("ограничивает окно бюджетом памяти", () => {
    expect(inFlightWindow(frameByteLength(exportSize("1080p"), "yuv420p"))).toBe(8);
    expect(inFlightWindow(frameByteLength(exportSize("4k"), "rgba"))).toBe(8);
    expect(inFlightWindow(100 * 1024 * 1024)).toBe(2);
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

  it("держит на GPU не больше depth кадров и собирает их по порядку", async () => {
    const renderer = new FakeRenderer(3);
    const sink: FrameSink = { sendFrame: async () => undefined };
    await runFrameLoop({ frameCount: 10, fps: 60, frameBytes: 4, window: 4, renderer, sink });
    expect(renderer.maxOpen).toBe(3);
    expect(renderer.order.slice(0, 4)).toEqual(["s0", "s1", "s2", "c0"]);
    const collected = renderer.order.filter((entry) => entry.startsWith("c"));
    expect(collected).toEqual(Array.from({ length: 10 }, (_, i) => `c${i}`));
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
