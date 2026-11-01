import {
  HalfFloatType,
  LinearFilter,
  NoColorSpace,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import type { Theme } from "@loopviz/mod-api";
import { BloomChain } from "./bloom-chain";
import { FULLSCREEN_VERTEX, FullscreenRenderer } from "./fullscreen";
import { grainAmplitudeScale, grainCellSize, grainSeed, type PostSettings } from "./post-settings";
import { FINAL_FRAGMENT } from "./shaders";

/** Множитель bloom от theme.glow: 0 даёт 0.4 от настройки, 1 даёт 1.6. */
const GLOW_GAIN_MIN = 0.4;
const GLOW_GAIN_MAX = 1.6;
/** Нормировка: средняя яркость маски после размытия мала, k подбирает видимый, но мягкий ореол. */
const BLOOM_K = 4;
/** Амплитуда зерна в sRGB при grain = 1. */
const GRAIN_K = 0.14;

function createHalfFloatTarget(): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  });
}

/**
 * Пост-цепочка: цвет сцены и маска свечения приходят снаружи (их рисует compositor),
 * здесь bloom, тонирование, виньетка, зерно и вывод на экран или в offscreen-цель.
 * Цели создаются в setSize и пересоздаются только при смене разрешения.
 */
export class PostPipeline {
  readonly sceneTarget = createHalfFloatTarget();
  readonly glowTarget = createHalfFloatTarget();
  private readonly fullscreen: FullscreenRenderer;
  private readonly bloom: BloomChain;
  private readonly finalMaterial: ShaderMaterial;
  private output: WebGLRenderTarget | null = null;
  private width = 0;
  private height = 0;

  constructor(private readonly renderer: WebGLRenderer) {
    this.fullscreen = new FullscreenRenderer(renderer);
    this.bloom = new BloomChain(this.fullscreen);
    this.finalMaterial = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: FINAL_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uGlowColor: { value: new Vector3() },
        uInk: { value: new Vector3() },
        uBloom: { value: 0 },
        uVignette: { value: 0 },
        uGrain: { value: 0 },
        uGrainCell: { value: 1 },
        uSeed: { value: 0 },
      },
    });
  }

  setSize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.sceneTarget.setSize(width, height);
    this.glowTarget.setSize(width, height);
    this.bloom.setSize(width, height);
  }

  /** RGBA8 цель с уже закодированным sRGB. Живёт до следующей смены размера. */
  getOutputTarget(width: number, height: number): WebGLRenderTarget {
    if (!this.output) {
      this.output = new WebGLRenderTarget(width, height, { type: UnsignedByteType, depthBuffer: false });
      this.output.texture.colorSpace = NoColorSpace;
    } else if (this.output.width !== width || this.output.height !== height) {
      this.output.setSize(width, height);
    }
    return this.output;
  }

  /** Читает sceneTarget и glowTarget, пишет результат в output (null означает canvas). */
  resolve(theme: Theme, settings: PostSettings, t: number, output: WebGLRenderTarget | null): void {
    const halo = this.bloom.render(this.glowTarget.texture, settings.bloomRadius);
    const { uniforms } = this.finalMaterial;
    const { tScene, tBloom, uGlowColor, uInk, uBloom, uVignette, uGrain, uGrainCell, uSeed } = uniforms;
    if (!tScene || !tBloom || !uGlowColor || !uInk || !uBloom || !uVignette || !uGrain || !uGrainCell || !uSeed) return;
    tScene.value = this.sceneTarget.texture;
    tBloom.value = halo;
    (uGlowColor.value as Vector3).set(...theme.accentGlow);
    (uInk.value as Vector3).set(...theme.ink);
    const gain = GLOW_GAIN_MIN + (GLOW_GAIN_MAX - GLOW_GAIN_MIN) * theme.glow;
    uBloom.value = settings.bloomStrength * gain * BLOOM_K;
    uVignette.value = settings.vignette;
    uGrain.value = settings.grain * GRAIN_K * grainAmplitudeScale(this.height, settings.grainSize);
    uGrainCell.value = grainCellSize(this.height, settings.grainSize);
    uSeed.value = grainSeed(t);
    this.fullscreen.render(this.finalMaterial, output);
    this.renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.sceneTarget.dispose();
    this.glowTarget.dispose();
    this.output?.dispose();
    this.bloom.dispose();
    this.finalMaterial.dispose();
    this.fullscreen.dispose();
  }
}
