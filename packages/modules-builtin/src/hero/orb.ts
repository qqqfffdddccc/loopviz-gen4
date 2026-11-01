import { clamp, type ParamSchema } from "@loopviz/mod-api";
import { defineHero, floatUniform, loopPhase } from "./define-hero";

export type OrbParams = {
  size: number;
  blur: number;
  warp: number;
  satellite: number;
  breath: number;
  core: number;
  flare: number;
  loopBars: number;
};

const FRAGMENT = /* glsl */ `
uniform float uTheta;
uniform float uRadius;
uniform float uBlur;
uniform float uWarp;
uniform float uSat;
uniform float uCoreI;
uniform float uCoreR;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// Знаковое расстояние до капли в высотах зоны. Отрицательное внутри.
float blobField(vec2 p, vec2 loop, out float grain) {
  vec2 q = p - vec2(0.0, 0.03);
  q.y /= 1.14;
  float n = fbm(q * 2.3 + loop * 0.65, 0.0, 4);
  float n2 = gnoise(q * 4.6 + vec2(5.0, 9.0) + loop.yx * 0.9, 0.0);
  grain = n;
  float d1 = length(q) - uRadius * (1.0 + uWarp * (0.5 * n + 0.14 * n2));

  vec2 c2 = vec2(0.05 * sin(uTheta + 1.0), -uRadius * 1.55);
  vec2 s = p - c2;
  float n3 = gnoise(s * 3.4 + loop * 0.7 + vec2(13.0, 2.0), 0.0);
  float d2 = length(s) - uRadius * 0.72 * uSat * (1.0 + uWarp * 0.5 * n3);
  return smin(d1, d2 + (1.0 - step(0.01, uSat)) * 10.0, uRadius * 0.9);
}

void main() {
  vec2 p = heroCoord();
  vec2 loop = vec2(cos(uTheta), sin(uTheta));

  float grain;
  float d = blobField(p, loop, grain);

  float body = 1.0 - smoothstep(-uBlur, uBlur, d);
  float depth = smoothstep(0.0, -uRadius * 0.9, d);
  float halo = exp(-max(d, 0.0) / (uBlur * 2.2)) * 0.2;
  float inkA = body * (0.74 + 0.26 * depth) * (0.86 + 0.14 * grain);
  inkA = 1.0 - (1.0 - inkA) * (1.0 - halo * (1.0 - body));

  vec2 cc = vec2(0.028 * sin(uTheta), 0.04 + 0.03 * cos(uTheta + 0.7));
  vec2 dd = (p - cc) * vec2(1.0, 0.92);
  float core = exp(-dot(dd, dd) / (uCoreR * uCoreR)) * uCoreI;
  float wide = exp(-dot(dd, dd) / (uCoreR * uCoreR * 3.6)) * uCoreI;
  float coreMask = smoothstep(0.04, 1.7, core + 0.3 * wide);

  vec3 col = mix(uInk, uAccent, coreMask);
  col = mix(col, uGlow, smoothstep(0.55, 1.35, core) * 0.8);
  float alpha = max(inkA, smoothstep(0.02, 0.8, core));
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

const params: ParamSchema<OrbParams> = {
  size: { kind: "slider", label: "РАЗМЕР", min: 0.12, max: 0.5, step: 0.01, default: 0.29 },
  blur: { kind: "slider", label: "РАЗМЫТИЕ", min: 0.02, max: 0.3, step: 0.005, default: 0.075 },
  warp: { kind: "slider", label: "ДЕФОРМАЦИЯ", min: 0, max: 1, step: 0.01, default: 0.55 },
  satellite: { kind: "slider", label: "СПУТНИК", min: 0, max: 1, step: 0.01, default: 0.45 },
  breath: { kind: "slider", label: "ДЫХАНИЕ ОТ ГРОМКОСТИ", min: 0, max: 1, step: 0.01, default: 0.6 },
  core: { kind: "slider", label: "ЯРКОСТЬ ЯДРА", min: 0, max: 1, step: 0.01, default: 0.85 },
  flare: { kind: "slider", label: "ВСПЫШКА НА УДАРЕ", min: 0, max: 1, step: 0.01, default: 0.7 },
  loopBars: { kind: "slider", label: "ПЕТЛЯ ДВИЖЕНИЯ, ТАКТОВ", min: 1, max: 8, step: 1, default: 4 },
};

export const heroOrb = defineHero({
  meta: { id: "builtin.hero.orb", name: "Soft Orb", params },
  fragment: FRAGMENT,
  setup() {
    const uniforms = {
      uTheta: floatUniform(),
      uRadius: floatUniform(0.25),
      uBlur: floatUniform(0.1),
      uWarp: floatUniform(),
      uSat: floatUniform(),
      uCoreI: floatUniform(),
      uCoreR: floatUniform(0.1),
    };
    return {
      uniforms,
      update: (frame, values) => {
        const u = uniforms;
        const { rms, bands, onset } = frame.audio;
        const bass = clamp(((bands[0] ?? 0) + (bands[1] ?? 0) * 0.8 + (bands[2] ?? 0) * 0.4) / 1.6, 0, 1);
        const level = clamp(rms, 0, 1);
        const hit = clamp(onset, 0, 1);

        u.uTheta.value = loopPhase(frame.bar, values.loopBars) * Math.PI * 2;
        u.uRadius.value = values.size * (1 + 0.32 * values.breath * level + 0.025 * Math.sin(frame.bar * Math.PI * 2));
        u.uBlur.value = values.blur;
        u.uWarp.value = values.warp;
        u.uSat.value = values.satellite;
        u.uCoreI.value = clamp(values.core * (0.7 + 0.4 * bass) + values.flare * hit * 0.4, 0, 1.3);
        u.uCoreR.value = values.size * (0.3 + 0.12 * bass + 0.17 * values.flare * hit);
      },
    };
  },
});
