import {
  NearestFilter,
  NoColorSpace,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type Texture,
} from "three";
import { assertNever } from "@loopviz/mod-api";
import { FULLSCREEN_VERTEX, type FullscreenRenderer } from "./fullscreen";
import { PACK_FRAGMENT } from "./shaders";

/** Что читается с GPU: готовый yuv420p (1.5 байта на пиксель) или RGBA (4 байта), в обоих случаях строки сверху вниз. */
export type ReadbackFormat = "yuv420p" | "rgba";

export interface FrameSize {
  width: number;
  height: number;
}

/** yuv420p упаковывается по 4 байта в тексель: ширина кратна 8, высота кратна 4 (плоскость U целиком в строках кадра). */
export function yuvSupported({ width, height }: FrameSize): boolean {
  return width % 8 === 0 && height % 4 === 0;
}

/** Запрошенный формат или RGBA, если размер кадра не позволяет упаковать yuv420p. */
export function resolveReadbackFormat(preferred: ReadbackFormat, size: FrameSize): ReadbackFormat {
  return preferred === "yuv420p" && !yuvSupported(size) ? "rgba" : preferred;
}

export function readbackByteLength(format: ReadbackFormat, { width, height }: FrameSize): number {
  switch (format) {
    case "yuv420p":
      return (width * height * 3) / 2;
    case "rgba":
      return width * height * 4;
    default:
      return assertNever(format);
  }
}

function packedSize(format: ReadbackFormat, { width, height }: FrameSize): FrameSize {
  switch (format) {
    case "yuv420p":
      return { width: width / 4, height: (height * 3) / 2 };
    case "rgba":
      return { width, height };
    default:
      return assertNever(format);
  }
}

/**
 * Последний проход: переворачивает кадр в порядок видео и, для yuv420p, считает BT.709 limited-range
 * с усреднением хроматики по 2x2. Результат лежит в RGBA8-цели так, что readPixels отдаёт готовый
 * плоский буфер (Y, затем U, затем V) или RGBA без CPU-перестановки строк.
 */
export class PackPass {
  private target: WebGLRenderTarget | null = null;
  private readonly materials = new Map<ReadbackFormat, ShaderMaterial>();

  constructor(private readonly fullscreen: FullscreenRenderer) {}

  /** Рисует `source` (RGBA8, sRGB, строки снизу вверх) в упакованную цель и возвращает её. */
  render(format: ReadbackFormat, source: Texture, frame: FrameSize): WebGLRenderTarget {
    const material = this.materialFor(format);
    const { tSrc, uSize } = material.uniforms;
    if (!tSrc || !uSize) throw new Error("PackPass: нет uniform-ов");
    tSrc.value = source;
    (uSize.value as Vector2).set(frame.width, frame.height);
    const target = this.targetFor(packedSize(format, frame));
    this.fullscreen.render(material, target);
    return target;
  }

  dispose(): void {
    this.target?.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }

  private targetFor({ width, height }: FrameSize): WebGLRenderTarget {
    if (!this.target) {
      this.target = new WebGLRenderTarget(width, height, {
        type: UnsignedByteType,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        depthBuffer: false,
      });
      this.target.texture.colorSpace = NoColorSpace;
    } else if (this.target.width !== width || this.target.height !== height) {
      this.target.setSize(width, height);
    }
    return this.target;
  }

  private materialFor(format: ReadbackFormat): ShaderMaterial {
    const cached = this.materials.get(format);
    if (cached) return cached;
    const material = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: PACK_FRAGMENT,
      defines: format === "yuv420p" ? { YUV420: "1" } : {},
      depthTest: false,
      depthWrite: false,
      uniforms: { tSrc: { value: null }, uSize: { value: new Vector2() } },
    });
    this.materials.set(format, material);
    return material;
  }
}
