import { NoBlending, ShaderMaterial, Vector3, type IUniform } from "three";
import {
  defineModule,
  type FrameInput,
  type ModuleContext,
  type ModuleDefinition,
  type ModuleMeta,
  type ParamValues,
  type WebGLModuleContext,
} from "@loopviz/mod-api";
import { HERO_PRELUDE } from "./glsl";

export interface HeroView {
  w: number;
  h: number;
  aspect: number;
}

export type HeroUniforms = Record<string, IUniform>;

export interface HeroInstance<P extends ParamValues, U extends HeroUniforms> {
  uniforms: U;
  /** Чистая функция от кадра и параметров: выставляет только свои uniforms. Допустимы лишь кэши данных. */
  update(frame: FrameInput, values: P, view: HeroView): void;
}

export interface HeroSpec<P extends ParamValues, U extends HeroUniforms> {
  meta: Omit<ModuleMeta<P>, "slot" | "surface">;
  /** Тело фрагментного шейдера. Пролог (цвета, шум) добавляется автоматически. */
  fragment: string;
  /** Вызывается на каждый новый экземпляр модуля: замыкание хранит кэши только этого экземпляра. */
  setup(): HeroInstance<P, U>;
}

/**
 * Hero-модуль из одного полноэкранного прохода. Вывод без премультипликации: rgb и alpha покрытия,
 * поэтому материал пишет в цель без смешивания, а compositor кладёт слот на бумагу.
 */
export function defineHero<P extends ParamValues, U extends HeroUniforms>(spec: HeroSpec<P, U>): ModuleDefinition<P> {
  return defineModule<P>({ ...spec.meta, slot: "hero", surface: "webgl" }, () => {
    let gl: WebGLModuleContext | null = null;
    let material: ShaderMaterial | null = null;
    let instance: HeroInstance<P, U> | null = null;
    const view: HeroView = { w: 1, h: 1, aspect: 1 };
    const colors = {
      uInk: { value: new Vector3() },
      uAccent: { value: new Vector3() },
      uGlow: { value: new Vector3() },
      uBg: { value: new Vector3() },
      uAspect: { value: 1 },
    };

    return {
      init(ctx: ModuleContext) {
        if (ctx.surface !== "webgl") throw new Error(`${spec.meta.id} requires a webgl surface`);
        gl = ctx;
        instance = spec.setup();
        material = new ShaderMaterial({
          vertexShader: ctx.helpers.fullscreenVertex,
          fragmentShader: HERO_PRELUDE + spec.fragment,
          blending: NoBlending,
          depthTest: false,
          depthWrite: false,
          uniforms: { ...colors, ...instance.uniforms },
        });
      },
      resize(w, h) {
        view.w = Math.max(1, w);
        view.h = Math.max(1, h);
        view.aspect = view.w / view.h;
      },
      render(frame, values) {
        if (!gl || !material || !instance) return;
        colors.uInk.value.set(...frame.theme.ink);
        colors.uAccent.value.set(...frame.theme.accent);
        colors.uGlow.value.set(...frame.theme.accentGlow);
        colors.uBg.value.set(...frame.theme.bg);
        colors.uAspect.value = view.aspect;
        instance.update(frame, values, view);
        gl.helpers.renderFullscreenPass(material);
      },
      dispose() {
        material?.dispose();
        material = null;
        instance = null;
        gl = null;
      },
    };
  });
}

/** Фаза движения 0..1: целое число петель по тактам исходника, поэтому периодическое движение замыкается на стыке лупа. */
export function loopPhase(bar: number, loopBars: number): number {
  const cycles = bar / Math.max(1, Math.round(loopBars));
  return cycles - Math.floor(cycles);
}

export function floatUniform(value = 0): IUniform<number> {
  return { value };
}
