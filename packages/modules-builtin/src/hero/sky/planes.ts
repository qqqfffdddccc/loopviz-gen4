import { Vector2, Vector4 } from "three";
import { clamp, type ParamSchema } from "@loopviz/mod-api";
import { defineHero, floatUniform, loopPhase } from "../define-hero";
import { MAX_PLANES, planeLayout, vanishingPoint } from "./planes-motion";
import { SKY_GLSL } from "./glsl";

export type PlanesParams = {
  depth: number;
  count: number;
  softness: number;
  tilt: number;
  step: number;
  reaction: number;
};

const LOOP_BARS = 4;

const FRAGMENT = /* glsl */ `
${SKY_GLSL}
#define PLANES ${MAX_PLANES}
uniform vec4 uPlaneA[PLANES];
uniform vec4 uPlaneB[PLANES];
uniform vec2 uVp;
uniform float uDepth;
uniform float uGlowAmt;
uniform float uShimmer;
uniform float uPulse;
uniform float uTheta;

void main() {
  vec2 p = heroCoord();
  vec2 loop = vec2(cos(uTheta), sin(uTheta));

  vec3 col = skyGradient(p.y, uDepth);
  vec3 lit = mix(uGlow, vec3(1.0), 0.6);
  vec3 shade = mix(skyZenith(min(uDepth + 0.35, 1.0)), uAccent, 0.5);

  // Световая утечка: широкая диагональная полоса, медленно дышит по петле.
  vec2 leakDir = normalize(vec2(-0.62, 0.78));
  float leakK = (dot(p - uVp, leakDir) + 0.42) / 0.2;
  float leak = exp(-leakK * leakK) * (0.14 + 0.05 * loop.x);
  col = 1.0 - (1.0 - col) * (1.0 - lit * leak);

  // Пол с перспективной сеткой, уходящей к горизонту. Сдвиг ровно на целое число линий за петлю.
  float below = uVp.y - p.y;
  float floorK = smoothstep(0.0, 0.03, below);
  float fz = 0.1 / max(below, 1e-3);
  vec2 g = vec2((p.x - uVp.x) * fz * 2.2, fz * 1.6 - uTheta / TAU * 4.0);
  vec2 tri = abs(fract(g - 0.5) - 0.5);
  vec2 fw = max(fwidth(g), vec2(1e-4));
  vec2 gl = (1.0 - smoothstep(0.0, 1.0, tri / (fw * 1.3))) * (1.0 - smoothstep(0.25, 0.7, fw));
  float grid = max(gl.x, gl.y) * floorK * (1.0 - exp(-below * 14.0));
  col = mix(col, mix(skyHorizon(uDepth), lit, 0.45), floorK * smoothstep(0.0, 0.45, below) * 0.3);
  col = 1.0 - (1.0 - col) * (1.0 - lit * grid * 0.6);

  float rim = 0.0;
  for (int i = 0; i < PLANES; i++) {
    vec4 a = uPlaneA[i];
    vec4 b = uPlaneB[i];
    if (b.z <= 0.001) continue;

    vec2 d = p - a.xy;
    float c = cos(b.x);
    float s = sin(b.x);
    vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
    vec2 e = abs(q) - a.zw;
    float sd = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);

    float soft = max(b.y, 1e-3);
    float body = 1.0 - smoothstep(-soft, soft, sd);
    // Плоскость ярче к стороне, обращённой к точке схода.
    float toward = -s * (uVp.x - a.x) + c * (uVp.y - a.y);
    float lean = 0.62 + 0.38 * smoothstep(-a.w, a.w, toward >= 0.0 ? q.y : -q.y);
    float k = body * lean * b.z;

    vec3 screened = 1.0 - (1.0 - col) * (1.0 - lit * k * 0.6);
    vec3 shaded = mix(col, shade, k * 0.55);
    col = mix(screened, shaded, b.w);

    rim += exp(-(sd * sd) / (soft * soft)) * b.z * (1.0 - b.w);
  }

  // Горизонт: пятно у точки схода и вытянутая полоса вдоль линии горизонта.
  vec2 h = p - uVp;
  float spot = exp(-dot(h, h) / 0.11);
  float band = exp(-(h.y * h.y) / 0.0016) * exp(-(h.x * h.x) / 0.55);
  vec3 horizonCol = mix(uGlow, vec3(1.0), 0.75);
  float glow = (spot * 0.6 + band * 0.4) * uGlowAmt;
  col = 1.0 - (1.0 - col) * (1.0 - horizonCol * clamp(glow, 0.0, 0.95));

  // Мерцание на кромках от верхов: шум замкнут по петле через вектор loop.
  float n = 0.5 + 0.5 * gnoise(p * 16.0 + loop * 1.4, 0.0);
  col += lit * rim * n * uShimmer * 0.5;

  col += lit * uPulse * 0.08 * (spot + 0.4 * band);

  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (dither - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const params: ParamSchema<PlanesParams> = {
  depth: { kind: "slider", label: "ГЛУБИНА НЕБА", min: 0, max: 1, step: 0.01, default: 0.5 },
  count: { kind: "slider", label: "КОЛИЧЕСТВО ПЛОСКОСТЕЙ", min: 3, max: MAX_PLANES, step: 1, default: 9 },
  softness: { kind: "slider", label: "РАЗМЫТИЕ КРАЁВ", min: 0, max: 1, step: 0.01, default: 0.55 },
  tilt: { kind: "slider", label: "НАКЛОН, °", min: -45, max: 45, step: 1, default: 16 },
  step: { kind: "slider", label: "ШАГ НА ДОЛЕ", min: 0, max: 1, step: 0.01, default: 0.7 },
  reaction: { kind: "slider", label: "РЕАКЦИЯ НА МУЗЫКУ", min: 0, max: 1, step: 0.01, default: 0.6 },
};

export const heroPlanes = defineHero({
  meta: { id: "builtin.hero.sky-planes", name: "LIGHT PLANES", params },
  fragment: FRAGMENT,
  setup() {
    const uniforms = {
      uPlaneA: { value: Array.from({ length: MAX_PLANES }, () => new Vector4()) },
      uPlaneB: { value: Array.from({ length: MAX_PLANES }, () => new Vector4()) },
      uVp: { value: new Vector2() },
      uDepth: floatUniform(0.35),
      uGlowAmt: floatUniform(),
      uShimmer: floatUniform(),
      uPulse: floatUniform(),
      uTheta: floatUniform(),
    };
    return {
      uniforms,
      update: (frame, values, view) => {
        const { rms, bands, onset } = frame.audio;
        const react = values.reaction;
        const lows = clamp(((bands[0] ?? 0) + (bands[1] ?? 0)) / 2, 0, 1);
        const highs = clamp(((bands[5] ?? 0) + (bands[6] ?? 0) + (bands[7] ?? 0)) / 3, 0, 1);

        const planes = planeLayout(frame.beat, {
          aspect: view.aspect,
          count: values.count,
          softness: values.softness,
          tilt: (values.tilt * Math.PI) / 180,
          step: values.step,
          push: lows * 0.03 * react,
        });
        planes.forEach((plane, i) => {
          uniforms.uPlaneA.value[i]?.set(plane.cx, plane.cy, plane.hw, plane.hh);
          uniforms.uPlaneB.value[i]?.set(plane.angle, plane.soft, plane.intensity, plane.tone);
        });

        const vp = vanishingPoint(view.aspect);
        uniforms.uVp.value.set(vp.x, vp.y);
        uniforms.uDepth.value = values.depth;
        uniforms.uGlowAmt.value = 0.5 + react * (0.55 * clamp(rms * 1.4, 0, 1) + 0.15 * onset);
        uniforms.uShimmer.value = react * highs * 1.4 + 0.08;
        uniforms.uPulse.value = react * onset;
        uniforms.uTheta.value = loopPhase(frame.bar, LOOP_BARS) * Math.PI * 2;
      },
    };
  },
});
