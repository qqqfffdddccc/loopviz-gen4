import { clamp, type ParamSchema } from "@loopviz/mod-api";
import { defineHero, floatUniform, loopPhase } from "./define-hero";

export type FogParams = {
  density: number;
  turbulence: number;
  scale: number;
  softness: number;
  width: number;
  accent: number;
  flow: number;
  loopBars: number;
};

const SPECTRUM_BINS = 64;
const PERIOD_CELLS = 4;

const FRAGMENT = /* glsl */ `
#define PERIOD ${PERIOD_CELLS.toFixed(1)}
uniform float uTheta;
uniform float uFlow;
uniform float uDensity;
uniform float uTurb;
uniform float uScale;
uniform float uSoft;
uniform int uOct;
uniform float uHpx;
uniform float uThread;
uniform float uWidth;
uniform float uAccentAmt;
uniform float uSpec[${SPECTRUM_BINS}];

// Спектр вдоль высоты зоны: низ зоны это бас, верх это верха. Между полосами линейная интерполяция.
float specAt(float y01) {
  float x = clamp(y01, 0.0, 1.0) * ${SPECTRUM_BINS - 1}.0;
  int i = int(floor(x));
  int j = min(i + 1, ${SPECTRUM_BINS - 1});
  return mix(uSpec[i], uSpec[j], x - float(i));
}

void main() {
  vec2 p = heroCoord();
  vec2 loop = vec2(cos(uTheta), sin(uTheta));

  // Пока uFlow растёт на целое число, поле сдвигается ровно на период решётки и картина повторяется.
  vec2 u = vec2(p.x * 1.15, p.y * 0.6) * uScale * 2.4;
  u.y -= uFlow * PERIOD;

  vec2 q = vec2(
    fbm(u + loop * 0.55, PERIOD, 3),
    fbm(u + vec2(5.2, 1.3) + loop.yx * 0.55, PERIOD, 3));
  vec2 r = vec2(
    fbm(u + uTurb * 1.9 * q + vec2(1.7, 9.2), PERIOD, 3),
    fbm(u + uTurb * 1.9 * q + vec2(8.3, 2.8), PERIOD, 3));
  float f = fbm(u + uTurb * 1.8 * r, PERIOD, uOct);
  float ridgeSrc = fbm(u + uTurb * 1.6 * r + vec2(3.1, 7.0), PERIOD, 2);

  float band = 0.25 * specAt(vUv.y - 0.1) + 0.5 * specAt(vUv.y) + 0.25 * specAt(vUv.y + 0.1);
  float shift = (band - 0.2) * 0.55;

  float soft = 0.32 + uSoft * 0.9;
  float lo = -0.15 - soft * 0.5;
  float dens = smoothstep(lo, lo + soft + 0.55, f + uDensity * 0.7 - 0.2 + shift);

  float wx = p.x + 0.22 * uWidth * q.x;
  float column = exp(-(wx * wx) / (uWidth * uWidth));
  float edge = smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
  dens *= column * edge;

  // Нить: нулевой уровень поля, толщина постоянна в долях высоты зоны и не зависит от наклона поля.
  float slope = max(length(vec2(dFdx(ridgeSrc), dFdy(ridgeSrc))), 1e-4);
  float line = ridgeSrc / (slope * uThread * uHpx);
  float filament = exp(-line * line) * smoothstep(0.1, 0.03, abs(ridgeSrc)) * smoothstep(0.7, 0.98, dens);
  float accent = filament * uAccentAmt * (0.45 + 1.1 * band);
  accent = clamp(accent, 0.0, 1.0);

  vec3 col = mix(uInk, uAccent, smoothstep(0.1, 0.65, accent));
  col = mix(col, uGlow, smoothstep(0.6, 1.0, accent) * 0.6);
  float alpha = max(dens * 0.92, smoothstep(0.05, 0.5, accent));
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

const params: ParamSchema<FogParams> = {
  density: { kind: "slider", label: "ПЛОТНОСТЬ", min: 0, max: 1, step: 0.01, default: 0.55 },
  turbulence: { kind: "slider", label: "ТУРБУЛЕНТНОСТЬ", min: 0, max: 1, step: 0.01, default: 0.55 },
  scale: { kind: "slider", label: "МАСШТАБ", min: 0.4, max: 2.5, step: 0.05, default: 1 },
  softness: { kind: "slider", label: "МЯГКОСТЬ", min: 0, max: 1, step: 0.01, default: 0.6 },
  width: { kind: "slider", label: "ШИРИНА ПОТОКА", min: 0.2, max: 1.4, step: 0.01, default: 0.5 },
  accent: { kind: "slider", label: "АКЦЕНТНЫЕ НИТИ", min: 0, max: 1, step: 0.01, default: 0.6 },
  flow: { kind: "slider", label: "ПОТОК, ЦИКЛОВ НА ПЕТЛЮ", min: 1, max: 4, step: 1, default: 1 },
  loopBars: { kind: "slider", label: "ПЕТЛЯ ДВИЖЕНИЯ, ТАКТОВ", min: 1, max: 8, step: 1, default: 4 },
};

export const heroFog = defineHero({
  meta: { id: "builtin.hero.fog", name: "Ink Fog", params },
  fragment: FRAGMENT,
  setup() {
    const uniforms = {
      uTheta: floatUniform(),
      uFlow: floatUniform(),
      uDensity: floatUniform(),
      uTurb: floatUniform(),
      uScale: floatUniform(1),
      uSoft: floatUniform(),
      uOct: { value: 4 },
      uHpx: floatUniform(1000),
      uThread: floatUniform(0.004),
      uWidth: floatUniform(0.5),
      uAccentAmt: floatUniform(),
      uSpec: { value: new Float32Array(SPECTRUM_BINS) },
    };
    return {
      uniforms,
      update: (frame, values, view) => {
        const u = uniforms;
        u.uHpx.value = view.h;
        const phase = loopPhase(frame.bar, values.loopBars);
        const { bands, spectrum } = frame.audio;
        const highs = clamp(((bands[4] ?? 0) + (bands[5] ?? 0) + (bands[6] ?? 0)) / 3, 0, 1);

        u.uTheta.value = phase * Math.PI * 2;
        u.uFlow.value = phase * Math.round(values.flow);
        u.uDensity.value = values.density;
        u.uTurb.value = values.turbulence * (0.75 + 0.7 * highs);
        u.uScale.value = values.scale;
        u.uSoft.value = values.softness;
        u.uOct.value = Math.round(5 - 2 * values.softness);
        u.uWidth.value = values.width;
        u.uAccentAmt.value = values.accent;
        u.uSpec.value.set(spectrum.subarray(0, SPECTRUM_BINS));
      },
    };
  },
});
