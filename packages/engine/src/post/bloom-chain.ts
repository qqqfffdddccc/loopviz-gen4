import {
  HalfFloatType,
  LinearFilter,
  RedFormat,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Texture,
} from "three";
import { FULLSCREEN_VERTEX, type FullscreenRenderer } from "./fullscreen";
import { BLOOM_LEVELS, bloomWeights } from "./post-settings";
import { DOWNSAMPLE_FRAGMENT, UPSAMPLE_FRAGMENT } from "./shaders";

function createTarget(): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    format: RedFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  });
}

function createMaterial(fragmentShader: string, defines: Record<string, string>): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader,
    defines,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tSrc: { value: null },
      tLow: { value: null },
      tHigh: { value: null },
      uTexel: { value: new Vector2() },
      uWeight: { value: 1 },
      uLowWeight: { value: 1 },
    },
  });
}

/**
 * Mip-цепочка bloom: префильтр + даунсэмпл на BLOOM_LEVELS уровней, затем апсэмпл с весами.
 * Число уровней фиксировано, а смещения выборок заданы в текселях каждого уровня, поэтому ореол
 * занимает одну и ту же долю кадра при любом разрешении выхода.
 */
export class BloomChain {
  private readonly down = Array.from({ length: BLOOM_LEVELS }, createTarget);
  private readonly up = Array.from({ length: BLOOM_LEVELS - 1 }, createTarget);
  private readonly prefilter = createMaterial(DOWNSAMPLE_FRAGMENT, { PREFILTER: "1" });
  private readonly downsample = createMaterial(DOWNSAMPLE_FRAGMENT, {});
  private readonly upsample = createMaterial(UPSAMPLE_FRAGMENT, {});
  private width = 0;
  private height = 0;

  constructor(private readonly fullscreen: FullscreenRenderer) {}

  /** Пересоздаёт размеры уровней только при смене разрешения. */
  setSize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    for (const [i, target] of [...this.down, ...this.up].entries()) {
      const level = i < BLOOM_LEVELS ? i : i - BLOOM_LEVELS;
      target.setSize(Math.max(1, Math.ceil(width / 2 ** (level + 1))), Math.max(1, Math.ceil(height / 2 ** (level + 1))));
    }
  }

  /** Возвращает текстуру ореола с половинным разрешением. `glowSource` лежит в полном разрешении. */
  render(glowSource: Texture, radius: number): Texture {
    this.runDownsample(this.prefilter, glowSource, this.width, this.height, this.down[0]);
    for (let i = 1; i < BLOOM_LEVELS; i++) {
      const src = this.down[i - 1];
      const dst = this.down[i];
      if (src && dst) this.runDownsample(this.downsample, src.texture, src.width, src.height, dst);
    }

    const weights = bloomWeights(radius);
    const last = this.down[BLOOM_LEVELS - 1];
    if (!last) throw new Error("Bloom chain is empty");
    let low: WebGLRenderTarget = last;
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
      const high = this.down[i];
      const dst = this.up[i];
      if (!high || !dst) continue;
      const { uniforms } = this.upsample;
      if (!uniforms.tLow || !uniforms.tHigh || !uniforms.uTexel || !uniforms.uWeight || !uniforms.uLowWeight) continue;
      uniforms.tLow.value = low.texture;
      uniforms.tHigh.value = high.texture;
      (uniforms.uTexel.value as Vector2).set(1 / low.width, 1 / low.height);
      uniforms.uWeight.value = weights[i] ?? 0;
      // Самый нижний уровень входит в цепочку один раз, со своим весом.
      uniforms.uLowWeight.value = i === BLOOM_LEVELS - 2 ? (weights[BLOOM_LEVELS - 1] ?? 0) : 1;
      this.fullscreen.render(this.upsample, dst);
      low = dst;
    }
    return low.texture;
  }

  dispose(): void {
    for (const target of [...this.down, ...this.up]) target.dispose();
    this.prefilter.dispose();
    this.downsample.dispose();
    this.upsample.dispose();
  }

  private runDownsample(
    material: ShaderMaterial,
    src: Texture,
    srcWidth: number,
    srcHeight: number,
    dst: WebGLRenderTarget | undefined,
  ): void {
    const { tSrc, uTexel } = material.uniforms;
    if (!dst || !tSrc || !uTexel) return;
    tSrc.value = src;
    (uTexel.value as Vector2).set(1 / srcWidth, 1 / srcHeight);
    this.fullscreen.render(material, dst);
  }
}
