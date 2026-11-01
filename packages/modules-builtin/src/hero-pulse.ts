import { ShaderMaterial, Vector3 } from "three";
import { clamp, defineModule, type ModuleContext, type ParamSchema, type WebGLModuleContext } from "@loopviz/mod-api";

type HeroPulseParams = { speed: number; intensity: number };

const FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform vec3 uInk;
uniform vec3 uAccent;
uniform vec3 uGlow;
uniform float uPulse;
uniform float uIntensity;
uniform float uAspect;
uniform float uTime;

// Гауссово пятно: exp(-d^2 / r^2) даёт мягкий тяжёлый блюр без жёсткого края.
float blob(vec2 p, vec2 c, float r) {
  vec2 d = p - c;
  return exp(-dot(d, d) / (r * r));
}

void main() {
  vec2 p = (vUv - vec2(0.5)) * vec2(uAspect, 1.0);
  vec2 upper = vec2(0.03 * sin(uTime * 0.7), 0.1 + 0.02 * sin(uTime * 0.5));
  vec2 lower = vec2(-0.04 * sin(uTime * 0.6 + 1.0), -0.12 + 0.02 * cos(uTime * 0.4));

  float body = blob(p, upper, 0.17 + 0.035 * uPulse) + 0.8 * blob(p, lower, 0.12 + 0.03 * uPulse);
  float inkAlpha = smoothstep(0.02, 1.0, body) * 0.72;

  float core = blob(p, upper, 0.055 + 0.04 * uPulse) * uIntensity;
  float coreMask = smoothstep(0.0, 0.7, core);
  vec3 col = mix(uInk, uAccent, coreMask);
  col = mix(col, uGlow, pow(core, 3.0) * 0.8);

  gl_FragColor = vec4(col, max(inkAlpha, coreMask * 0.97));
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
            uInk: { value: new Vector3() },
            uAccent: { value: new Vector3() },
            uGlow: { value: new Vector3() },
            uPulse: { value: 0 },
            uIntensity: { value: 1 },
            uAspect: { value: 1 },
            uTime: { value: 0 },
          },
        });
      },
      resize(w, h) {
        aspect = w / Math.max(1, h);
      },
      render(frame, values) {
        if (!gl || !material) return;
        const { uInk, uAccent, uGlow, uPulse, uIntensity, uAspect, uTime } = material.uniforms;
        if (!uInk || !uAccent || !uGlow || !uPulse || !uIntensity || !uAspect || !uTime) return;
        const { rms, bands } = frame.audio;
        const bass = Math.max(bands[0] ?? 0, bands[1] ?? 0);
        const breathing = 0.5 + 0.5 * Math.sin(frame.t * values.speed * Math.PI * 2);
        const level = clamp(rms * 0.7 + bass * 0.5, 0, 1);
        (uInk.value as Vector3).set(...frame.theme.ink);
        (uAccent.value as Vector3).set(...frame.theme.accent);
        (uGlow.value as Vector3).set(...frame.theme.accentGlow);
        uPulse.value = clamp(0.1 * breathing + level, 0, 1);
        uIntensity.value = values.intensity * (0.8 + 0.2 * clamp(rms + bass * 0.5, 0, 1));
        uAspect.value = aspect;
        uTime.value = frame.t * values.speed;
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
