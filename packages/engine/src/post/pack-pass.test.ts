import { describe, expect, it } from "vitest";
import { readbackByteLength, resolveReadbackFormat, yuvSupported } from "./pack-pass";

describe("pack-pass layout", () => {
  it("считает размер буфера чтения", () => {
    expect(readbackByteLength("rgba", { width: 1080, height: 1920 })).toBe(1080 * 1920 * 4);
    expect(readbackByteLength("yuv420p", { width: 1080, height: 1920 })).toBe(1080 * 1920 * 1.5);
    expect(readbackByteLength("yuv420p", { width: 2160, height: 3840 })).toBe(2160 * 3840 * 1.5);
  });

  it("упаковывает yuv420p только в кратные размеры", () => {
    expect(yuvSupported({ width: 1080, height: 1920 })).toBe(true);
    expect(yuvSupported({ width: 2160, height: 3840 })).toBe(true);
    expect(yuvSupported({ width: 1082, height: 1920 })).toBe(false);
    expect(yuvSupported({ width: 1080, height: 1922 })).toBe(false);
  });

  it("откатывается на RGBA, если yuv420p не помещается", () => {
    expect(resolveReadbackFormat("yuv420p", { width: 1080, height: 1920 })).toBe("yuv420p");
    expect(resolveReadbackFormat("yuv420p", { width: 1082, height: 1920 })).toBe("rgba");
    expect(resolveReadbackFormat("rgba", { width: 1080, height: 1920 })).toBe("rgba");
  });
});
