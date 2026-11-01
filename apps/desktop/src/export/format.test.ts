import { describe, expect, it } from "vitest";
import { formatDuration, progressBar, progressLines } from "./format";

describe("export format", () => {
  it("рисует полосу прогресса", () => {
    expect(progressBar(0)).toBe("[░░░░░░░░░░░░░░░░] 0%");
    expect(progressBar(0.5)).toBe("[████████░░░░░░░░] 50%");
    expect(progressBar(2)).toBe("[████████████████] 100%");
  });

  it("форматирует время", () => {
    expect(formatDuration(7.4)).toBe("7 С");
    expect(formatDuration(75)).toBe("1 МИН 15 С");
  });

  it("собирает строки прогресса", () => {
    const lines = progressLines({ frame: 30, frameCount: 60, renderFps: 15, elapsedSec: 2, etaSec: 2 });
    expect(lines[0]).toContain("50%");
    expect(lines[1]).toBe("КАДР 30/60 · 15.0 К/С");
    expect(lines[2]).toBe("ПРОШЛО 2 С · ОСТАЛОСЬ 2 С");
  });
});
