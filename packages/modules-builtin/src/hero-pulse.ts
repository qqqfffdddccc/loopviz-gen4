import { ShaderMaterial, Vector3 } from "three";
import { clamp, defineModule, type ModuleContext, type ParamSchema, type WebGLModuleContext } from "@loopviz/mod-api";

type HeroPulseParams = { speed: number; intensity: number };

const FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform vec3 uBg;
uniform vec3 uAccent;
uniform vec3 uGlow;
uniform float uPulse;
uniform float uIntensity;
uniform float uAspect;

void main() {
  vec2 p = (vUv - vec2(0.5)) * vec2(uAspect, 1.0);
  float d = length(p);
  float radius = mix(0.18, 0.34, uPulse);
  float body = smoothstep(radius + 0.45, 0.0, d);
  vec3 col = mix(uBg, uAccent, body * uIntensity);
  col += uGlow * pow(body, 3.0) * 0.35 * uPulse * uIntensity;
  gl_FragColor = vec4(col, 1.0);
}
`;

const params: ParamSchema<HeroPulseParams> = {
  speed: { kind: "slider", label: "СКОРОСТЬ", min: 0.1, max: 2, step: 0.05, default: 0.5 },
  intensity: { kind: "slider", label: "ЯРКОСТЬ", min: 0, max: 1, step: 0.01, default: 0.85 },
};

export const heroPulse = defineModule<HeroPulseParams>(
  { id: "builtin.hero.pulse", slot: "hero", name: "Pulse Gradient", surface: "webgl", params },
  () => {
    let gl: WebGLModuleContext | null = null;
    let material: ShaderMaterial | null = null;
    let aspect = 1;

    return {
      init(ctx: ModuleContext) {
        if (ctx.surface !== "webgl") throw new Error("hero.pulse requires a webgl surface");
        gl = ctx;
        material = new ShaderMaterial({
          vertexShader: ctx.helpers.fullscreenVertex,
          fragmentShader: FRAGMENT,
          depthTest: false,
          depthWrite: false,
          uniforms: {
            uBg: { value: new Vector3() },
            uAccent: { value: new Vector3() },
            uGlow: { value: new Vector3() },
            uPulse: { value: 0 },
            uIntensity: { value: 1 },
            uAspect: { value: 1 },
          },
        });
      },
      resize(w, h) {
        aspect = w / Math.max(1, h);
      },
      render(frame, values) {
        if (!gl || !material) return;
        const { uBg, uAccent, uGlow, uPulse, uIntensity, uAspect } = material.uniforms;
        if (!uBg || !uAccent || !uGlow || !uPulse || !uIntensity || !uAspect) return;
        const { rms, bands } = frame.audio;
        const bass = Math.max(bands[0] ?? 0, bands[1] ?? 0);
        const breathing = 0.5 + 0.5 * Math.sin(frame.t * values.speed * Math.PI * 2);
        const level = clamp(rms * 0.7 + bass * 0.5, 0, 1);
        (uBg.value as Vector3).set(...frame.theme.bg);
        (uAccent.value as Vector3).set(...frame.theme.accent);
        (uGlow.value as Vector3).set(...frame.theme.accentGlow);
        uPulse.value = clamp(0.1 * breathing + level, 0, 1);
        uIntensity.value = values.intensity * (0.35 + 0.65 * clamp(rms + bass * 0.5, 0, 1));
        uAspect.value = aspect;
        gl.helpers.renderFullscreenPass(material);
      },
      dispose() {
        material?.dispose();
        material = null;
        gl = null;
      },
    };
  },
);
