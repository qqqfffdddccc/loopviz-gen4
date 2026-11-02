import { clamp, type ParamSchema } from "@loopviz/mod-api";
import { defineHero, floatUniform, loopPhase } from "../define-hero";
import { SKY_GLSL } from "./glsl";
import { haloPulse, highBandLevel } from "./halo-pulse";

export type SkyHaloParams = {
  depth: number;
  sunHeight: number;
  halo: number;
  pillar: number;
  haze: number;
  react: number;
};

const LOOP_BARS = 4;

const FRAGMENT = /* glsl */ `
${SKY_GLSL}
uniform float uTheta;
uniform float uDepth;
uniform float uSunY;
uniform float uHaloR;
uniform float uHaloI;
uniform float uDogsI;
uniform float uPillar;
uniform float uHaze;
uniform float uGlowK;
uniform float uCoreR;
uniform float uFlick;

vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67)));
}

// Резкий внутренний край, мягкий спад наружу: профиль кольца 22 градуса.
float ringProfile(float r, float radius, float wIn, float wOut) {
  float d = r - radius;
  return smoothstep(-wIn, 0.0, d) * exp(-max(d, 0.0) / wOut);
}

void main() {
  vec2 p = heroCoord();
  vec2 loop = vec2(cos(uTheta), sin(uTheta));
  vec2 q = p - vec2(0.0, uSunY);
  float r = length(q);
  float a = atan(q.y, q.x + 1e-5);

  vec3 sky = skyGradient(p.y, uDepth);
  vec3 tint = mix(vec3(1.0), uGlow, 0.18);
  vec3 cool = mix(tint, uAccent * 1.25, 0.3);

  float wideGlow = exp(-r * 2.6);
  float midGlow = exp(-r * r / 0.05);
  sky = mix(sky, mix(skyHorizon(uDepth), vec3(1.0), 0.5), wideGlow * 0.3);

  // Небо внутри кольца чуть темнее, как на фотографиях гало.
  float inside = smoothstep(uHaloR, uHaloR * 0.3, r);
  sky *= 1.0 - uHaloI * 0.03 * inside * (1.0 - midGlow);

  vec3 light = vec3(0.0);

  // Солнце: яркое ядро и два слоя ореола.
  float core = exp(-(r * r) / (uCoreR * uCoreR));
  float disc = 1.0 - smoothstep(uCoreR * 0.55, uCoreR * 0.95, r);
  light += tint * (core * 2.4 + disc * 3.0) * uGlowK;
  light += tint * midGlow * 0.5 * uGlowK;
  light += tint * wideGlow * 0.22 * uGlowK;

  // Гало 22 градуса с дисперсией: красный край внутри, синий снаружи.
  float azimuth = 0.8 + 0.2 * sin(a * 3.0 + 1.3) + 0.35 * pow(abs(cos(a)), 8.0);
  float wIn = 0.007;
  float wOut = uHaloR * 0.17;
  vec3 ring = vec3(
    ringProfile(r, uHaloR * 0.986, wIn, wOut),
    ringProfile(r, uHaloR, wIn, wOut),
    ringProfile(r, uHaloR * 1.014, wIn, wOut)
  );
  vec3 ringCol = mix(vec3(ring.g), ring, 0.4) * tint;
  light += ringCol * azimuth * uHaloI * 0.55;

  // Верхняя касательная дуга: касается гало сверху и уходит в стороны.
  float arcR = uHaloR * 1.6;
  vec2 arcC = vec2(0.0, uHaloR + arcR);
  float arcSigned = length(q - arcC) - arcR;
  float arcMask = smoothstep(uHaloR * 1.45, uHaloR * 0.25, abs(q.x)) * smoothstep(arcC.y + 0.01, arcC.y - 0.03, q.y);
  float arc = exp(-(arcSigned * arcSigned) / 0.00009) * arcMask;
  vec3 arcCol = mix(vec3(1.0), spectrum(clamp(0.5 + arcSigned * 28.0, 0.0, 0.7)), 0.3);
  light += arcCol * tint * arc * uHaloI * 0.16;

  // Паргелии на высоте солнца с хвостом наружу. Левый и правый симметричны.
  float side = abs(q.x);
  float dogX = uHaloR * 1.03;
  vec2 dd = vec2(side - dogX, q.y);
  float spot = exp(-dot(dd * vec2(1.0, 1.7), dd * vec2(1.0, 1.7)) / 0.00022);
  float outer = max(side - dogX, 0.0);
  float tail = exp(-abs(q.y) / 0.0055) * exp(-outer / 0.17) * smoothstep(dogX * 0.9, dogX * 1.02, side);
  vec3 dogCol = mix(vec3(1.0, 0.8, 0.7), vec3(0.72, 0.86, 1.0), smoothstep(0.0, 0.2, outer));
  light += dogCol * tint * (spot * 1.1 + tail * 0.4) * uDogsI;

  // Слабый паргелический круг по горизонту солнца.
  light += cool * exp(-abs(q.y) / 0.0035) * exp(-side * 1.5) * 0.04 * uHaloI;

  // Вертикальный столб света: вниз сильнее и шире, вверх короче.
  float below = max(-q.y, 0.0);
  float above = max(q.y, 0.0);
  float pw = 0.014 + below * 0.11 + above * 0.03;
  float streak = 0.62 + 0.38 * gnoise(vec2(q.x * 85.0, below * 1.7 + 3.0), 0.0);
  float column = exp(-(q.x * q.x) / (pw * pw));
  float downBeam = column * smoothstep(0.0, 0.05, below) * exp(-below / 0.5) * streak;
  float upBeam = column * smoothstep(0.0, 0.03, above) * exp(-above / 0.2) * 0.45;
  light += cool * (downBeam * 2.6 + upBeam * 1.4) * uPillar * uGlowK;

  // Лучи бликов: две сетки тонких спиц, мерцание от верхних полос.
  float spikes = pow(abs(cos(a * 3.0 + 0.4)), 90.0) + 0.6 * pow(abs(cos(a * 5.0 + 1.1)), 160.0);
  float flicker = 1.0 + uFlick * sin(a * 7.0 + uTheta * 3.0) * 0.8;
  light += tint * spikes * flicker * exp(-r * 3.4) * 0.45 * (0.4 + 0.6 * uGlowK);

  // Тонкая дымка перистых облаков, подсвеченная солнцем. Замкнута по петле через круг в области шума.
  vec2 hp = vec2(p.x * 1.4, p.y * 4.6) + loop * 0.55 + vec2(7.0, 2.0);
  float n = fbm(hp, 0.0, 4);
  float wisps = smoothstep(0.02, 0.6, n);
  float lit = 0.45 + exp(-r * 2.2);
  light += tint * wisps * lit * uHaze * 0.2 * smoothstep(-0.5, 0.2, p.y);

  vec3 col = 1.0 - (1.0 - sky) * exp(-light);
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const params: ParamSchema<SkyHaloParams> = {
  depth: { kind: "slider", label: "ГЛУБИНА НЕБА", min: 0, max: 1, step: 0.01, default: 0.8 },
  sunHeight: { kind: "slider", label: "ВЫСОТА СОЛНЦА", min: -0.2, max: 0.3, step: 0.01, default: 0.1 },
  halo: { kind: "slider", label: "СИЛА ГАЛО", min: 0, max: 1, step: 0.01, default: 0.7 },
  pillar: { kind: "slider", label: "СТОЛБ СВЕТА", min: 0, max: 1, step: 0.01, default: 0.6 },
  haze: { kind: "slider", label: "ПЕРИСТАЯ ДЫМКА", min: 0, max: 1, step: 0.01, default: 0.35 },
  react: { kind: "slider", label: "РЕАКЦИЯ НА МУЗЫКУ", min: 0, max: 1, step: 0.01, default: 0.7 },
};

export const skyHalo = defineHero({
  meta: { id: "builtin.hero.sky-halo", name: "HALO SUN", params },
  fragment: FRAGMENT,
  setup() {
    const uniforms = {
      uTheta: floatUniform(),
      uDepth: floatUniform(0.35),
      uSunY: floatUniform(0.1),
      uHaloR: floatUniform(0.3),
      uHaloI: floatUniform(),
      uDogsI: floatUniform(),
      uPillar: floatUniform(),
      uHaze: floatUniform(),
      uGlowK: floatUniform(1),
      uCoreR: floatUniform(0.035),
      uFlick: floatUniform(),
    };
    return {
      uniforms,
      update: (frame, values, view) => {
        const u = uniforms;
        const { rms, bands, onset } = frame.audio;
        const level = clamp(rms * 1.4, 0, 1);
        const pulse = haloPulse(onset, frame.beat);
        const highs = highBandLevel(bands);
        const r = values.react;

        u.uTheta.value = loopPhase(frame.bar, LOOP_BARS) * Math.PI * 2;
        u.uDepth.value = values.depth;
        u.uSunY.value = values.sunHeight;
        u.uHaloR.value = 0.3 * Math.min(1, view.aspect * 1.3) * (1 + 0.012 * r * pulse);
        u.uHaloI.value = clamp(values.halo * (0.6 + 0.9 * r * pulse), 0, 1.5);
        u.uDogsI.value = clamp(values.halo * (0.45 + 1.1 * r * pulse), 0, 1.6);
        u.uPillar.value = values.pillar;
        u.uHaze.value = values.haze;
        u.uGlowK.value = 0.8 + 0.7 * r * level + 0.25 * r * pulse;
        u.uCoreR.value = 0.035 * (1 + 0.45 * r * level + 0.2 * r * pulse);
        u.uFlick.value = clamp(highs * 1.6, 0, 1) * r;
      },
    };
  },
});
