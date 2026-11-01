import { clamp, type FrameInput, type ParamSchema } from "@loopviz/mod-api";
import { defineHero, floatUniform, loopPhase } from "./define-hero";
import {
  activeRings,
  beatRings,
  estimateDuration,
  extractOnsets,
  type Onset,
  type RingBirth,
} from "./ring-schedule";

export type RingsParams = {
  source: string;
  life: number;
  radius: number;
  thickness: number;
  softening: number;
  distort: number;
  core: number;
  sensitivity: number;
};

export const RING_SOURCE_ONSETS = "Онсеты";
export const RING_SOURCE_BEATS = "Доли такта";

const MAX_RINGS = 8;
const BEATS_PER_BAR = 4;

const FRAGMENT = /* glsl */ `
#define RINGS ${MAX_RINGS}
uniform float uRingAge[RINGS];
uniform float uRingStr[RINGS];
uniform float uLife;
uniform float uMaxR;
uniform float uThick;
uniform float uSoften;
uniform float uDistort;
uniform float uCoreI;
uniform float uCoreR;
uniform float uTheta;

void main() {
  vec2 p = heroCoord();
  float r = length(p);
  vec2 dir = p / max(r, 1e-4);
  vec2 loop = vec2(cos(uTheta), sin(uTheta));

  float ink = 0.0;
  float hot = 0.0;
  for (int i = 0; i < RINGS; i++) {
    float str = uRingStr[i];
    float a = uRingAge[i] / uLife;
    if (str <= 0.0 || a < 0.0 || a >= 1.0) continue;

    float ease = 1.0 - pow(1.0 - a, 2.2);
    float wobble = gnoise(dir * 1.5 + vec2(float(i) * 7.13, a * 0.9) + loop * 0.2, 0.0);
    float radius = mix(0.035, uMaxR, ease) * (1.0 + uDistort * 0.09 * wobble * (0.25 + a));
    float width = uThick * (1.0 + uSoften * 5.0 * a);
    float d = (r - radius) / width;
    float profile = exp(-d * d);
    float birth = smoothstep(0.0, 0.025, a);
    float energy = str * pow(1.0 - a, 1.5) * birth * inversesqrt(1.0 + uSoften * 5.0 * a);

    ink = 1.0 - (1.0 - ink) * (1.0 - clamp(profile * energy * 0.85, 0.0, 1.0));
    float fresh = 1.0 - smoothstep(0.0, 0.4, a);
    hot = max(hot, profile * energy * fresh * 1.05);
  }

  float core = exp(-(r * r) / (uCoreR * uCoreR)) * uCoreI;
  float pip = 1.0 - smoothstep(0.004, 0.011, r);
  ink = max(ink, pip * 0.8);

  float accent = clamp(max(hot, core), 0.0, 1.4);
  vec3 col = mix(uInk, uAccent, smoothstep(0.08, 0.95, accent));
  col = mix(col, uGlow, smoothstep(0.85, 1.4, accent) * 0.7);
  float alpha = max(ink, smoothstep(0.02, 0.55, accent));
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

const params: ParamSchema<RingsParams> = {
  source: { kind: "select", label: "РОЖДЕНИЕ КОЛЕЦ", options: [RING_SOURCE_ONSETS, RING_SOURCE_BEATS], default: RING_SOURCE_ONSETS },
  life: { kind: "slider", label: "ЖИЗНЬ КОЛЬЦА, С", min: 0.8, max: 5, step: 0.1, default: 2.6 },
  radius: { kind: "slider", label: "РАДИУС", min: 0.2, max: 1, step: 0.01, default: 0.55 },
  thickness: { kind: "slider", label: "ТОЛЩИНА", min: 0.004, max: 0.05, step: 0.001, default: 0.014 },
  softening: { kind: "slider", label: "РАЗМЫТИЕ С ВОЗРАСТОМ", min: 0, max: 1, step: 0.01, default: 0.55 },
  distort: { kind: "slider", label: "ИСКАЖЕНИЕ", min: 0, max: 1, step: 0.01, default: 0.5 },
  core: { kind: "slider", label: "ЯРКОСТЬ ЯДРА", min: 0, max: 1, step: 0.01, default: 0.8 },
  sensitivity: { kind: "slider", label: "ЧУВСТВИТЕЛЬНОСТЬ К УДАРАМ", min: 0, max: 1, step: 0.01, default: 0.5 },
};

interface OnsetCache {
  peaks: Float32Array | null;
  duration: number;
  sensitivity: number;
  onsets: Onset[];
}

/**
 * Рождения колец как чистая функция кадра. Онсеты считаются из пиков всего файла (frame.wave.peaks) и кэшируются
 * по массиву, длительности и чувствительности: кэш лишь запоминает результат функции от данных, состояния между кадрами нет.
 * Длительность файла берётся из frame.wave.progress = sourceT / duration.
 */
function scheduleRings(frame: FrameInput, values: RingsParams, cache: OnsetCache): RingBirth[] {
  const sourceT = (frame.beat * 60) / Math.max(1, frame.bpm);
  if (values.source === RING_SOURCE_ONSETS) {
    const duration = estimateDuration(sourceT, frame.wave.progress);
    if (duration !== null) {
      const { peaks } = frame.wave;
      if (cache.peaks !== peaks || cache.duration !== duration || cache.sensitivity !== values.sensitivity) {
        cache.peaks = peaks;
        cache.duration = duration;
        cache.sensitivity = values.sensitivity;
        cache.onsets = extractOnsets(peaks, duration, values.sensitivity);
      }
      if (cache.onsets.length > 0) {
        const start = sourceT - frame.loopT;
        const { fragment } = frame.wave;
        const length = (fragment.end - fragment.start) * duration;
        const span = length > 0 ? { start, end: start + length } : null;
        return activeRings(cache.onsets, sourceT, values.life, span, MAX_RINGS);
      }
    }
  }
  return beatRings(frame.beat, frame.bpm, values.life, BEATS_PER_BAR, MAX_RINGS);
}

export const heroRings = defineHero({
  meta: { id: "builtin.hero.rings", name: "Halo Rings", params },
  fragment: FRAGMENT,
  setup() {
    const cache: OnsetCache = { peaks: null, duration: 0, sensitivity: -1, onsets: [] };
    const uniforms = {
      uRingAge: { value: new Float32Array(MAX_RINGS) },
      uRingStr: { value: new Float32Array(MAX_RINGS) },
      uLife: floatUniform(2.6),
      uMaxR: floatUniform(0.55),
      uThick: floatUniform(0.014),
      uSoften: floatUniform(),
      uDistort: floatUniform(),
      uCoreI: floatUniform(),
      uCoreR: floatUniform(0.05),
      uTheta: floatUniform(),
    };
    return {
      uniforms,
      update: (frame, values) => {
        const u = uniforms;
        const rings = scheduleRings(frame, values, cache);
        u.uRingAge.value.fill(0);
        u.uRingStr.value.fill(0);
        rings.forEach((ring, i) => {
          u.uRingAge.value[i] = ring.age;
          u.uRingStr.value[i] = ring.strength;
        });

        const newest = rings[0];
        const flash = newest ? newest.strength * Math.exp(-newest.age * 6) : 0;
        const hit = clamp(Math.max(flash, frame.audio.onset * 0.8), 0, 1);

        u.uLife.value = values.life;
        u.uMaxR.value = values.radius;
        u.uThick.value = values.thickness;
        u.uSoften.value = values.softening;
        u.uDistort.value = values.distort;
        u.uCoreI.value = values.core * (0.45 + 0.75 * hit);
        u.uCoreR.value = 0.035 + 0.05 * hit;
        u.uTheta.value = loopPhase(frame.bar, 4) * Math.PI * 2;
      },
    };
  },
});
