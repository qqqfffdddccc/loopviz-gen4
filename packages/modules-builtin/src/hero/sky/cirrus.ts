import { Vector2 } from "three";
import { clamp, type ParamSchema } from "@loopviz/mod-api";
import { defineHero, floatUniform } from "../define-hero";
import { estimateDuration } from "../ring-schedule";
import { buildWindTrack, windDrift, type WindTrack } from "./cirrus-wind";
import { SKY_GLSL } from "./glsl";

export type CirrusParams = {
  depth: number;
  cover: number;
  angle: number;
  speed: number;
  reaction: number;
  fibres: number;
};

const GUST_AMOUNT = 1;
const BASE_SPEED = 0.012;
const SPEED_RANGE = 0.1;

const FRAGMENT = /* glsl */ `
${SKY_GLSL}
uniform float uDepth;
uniform float uCover;
uniform vec2 uWind;
uniform float uDrift;
uniform float uWarp;
uniform float uFibre;
uniform float uHigh;
uniform float uLift;

void main() {
  vec2 p = heroCoord();
  vec2 n = vec2(-uWind.y, uWind.x);
  // x вдоль ветра, y поперёк: поля вытянуты вдоль x, поэтому получаются длинные пряди.
  float x = dot(p, uWind) - uDrift;
  float y = dot(p, n);

  float big = fbm(vec2(x * 1.1 + 3.0, y * 1.6), 0.0, 3);
  float mid = fbm(vec2(x * 2.1 + 7.1, y * 3.2 + 1.7), 0.0, 2);
  float bend = uWarp * (0.24 * big + 0.07 * mid);
  // Сдвиг вдоль ветра растёт с высотой над осью: пряди разлетаются веером и загибаются хвостами.
  float comb = x + uWarp * 0.22 * mid + 0.35 * bend * y * 6.0;
  float yw = y + bend;

  float body = fbm(vec2(comb * 1.4, yw * 7.0), 0.0, 4);
  float bank = 0.38 * smoothstep(0.15, -0.55, p.y);
  float thr = 0.42 - 0.95 * uCover;
  float dens = smoothstep(thr, thr + 0.6, body + bank);

  float fib = fbm(vec2(comb * 1.8 - uDrift * 0.35, yw * 38.0 + big * 3.0), 0.0, 3);
  float strand = smoothstep(-0.55, 0.5, fib * (1.0 + 0.9 * uHigh));
  float alpha = dens * mix(1.0, strand * 1.3, uFibre);
  alpha = clamp(alpha, 0.0, 1.0);

  vec3 sky = skyGradient(p.y, uDepth) + vec3(0.03 * uLift);

  vec3 shade = mix(uAccent, vec3(1.0), 0.78);
  float lit = clamp(0.25 + 0.55 * strand + 0.35 * (1.0 - dens) + 0.4 * uLift, 0.0, 1.0);
  vec3 cloud = mix(shade * 0.9, vec3(1.0), lit);
  cloud += uGlow * 0.06 * uLift;

  vec3 col = mix(sky, cloud, alpha);
  gl_FragColor = vec4(col, 1.0);
}
`;

const params: ParamSchema<CirrusParams> = {
  depth: { kind: "slider", label: "ГЛУБИНА НЕБА", min: 0, max: 1, step: 0.01, default: 0.35 },
  cover: { kind: "slider", label: "ОБЛАЧНОСТЬ", min: 0, max: 1, step: 0.01, default: 0.5 },
  angle: { kind: "slider", label: "НАПРАВЛЕНИЕ ВЕТРА, °", min: -180, max: 180, step: 1, default: 12 },
  speed: { kind: "slider", label: "СКОРОСТЬ ВЕТРА", min: 0, max: 1, step: 0.01, default: 0.4 },
  reaction: { kind: "slider", label: "РЕАКЦИЯ НА ЗВУК", min: 0, max: 1, step: 0.01, default: 0.6 },
  fibres: { kind: "slider", label: "ВОЛОКНА", min: 0, max: 1, step: 0.01, default: 0.6 },
};

interface WindCache {
  peaks: Float32Array | null;
  duration: number;
  track: WindTrack | null;
}

function mean(values: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i <= to; i++) sum += values[i] ?? 0;
  return sum / (to - from + 1);
}

export const heroCirrus = defineHero({
  meta: { id: "builtin.hero.sky-cirrus", name: "CIRRUS", params },
  fragment: FRAGMENT,
  setup() {
    const cache: WindCache = { peaks: null, duration: 0, track: null };
    const uniforms = {
      uDepth: floatUniform(0.35),
      uCover: floatUniform(0.5),
      uWind: { value: new Vector2(1, 0) },
      uDrift: floatUniform(),
      uWarp: floatUniform(1),
      uFibre: floatUniform(0.6),
      uHigh: floatUniform(),
      uLift: floatUniform(),
    };
    return {
      uniforms,
      update: (frame, values) => {
        const u = uniforms;
        const sourceT = (frame.beat * 60) / Math.max(1, frame.bpm);
        const duration = estimateDuration(sourceT, frame.wave.progress);
        if (duration !== null) {
          const { peaks } = frame.wave;
          if (cache.peaks !== peaks || cache.duration !== duration) {
            cache.peaks = peaks;
            cache.duration = duration;
            cache.track = buildWindTrack(peaks, duration);
          }
        }

        const { bands, rms } = frame.audio;
        const lows = clamp(mean(bands, 0, 1), 0, 1);
        const highs = clamp(mean(bands, 5, 7), 0, 1);
        const speed = BASE_SPEED + SPEED_RANGE * values.speed;
        const drift = windDrift(cache.track, sourceT, values.reaction, GUST_AMOUNT * values.reaction);
        const angle = (values.angle * Math.PI) / 180;

        u.uDepth.value = values.depth;
        u.uCover.value = values.cover;
        u.uWind.value.set(Math.cos(angle), Math.sin(angle));
        u.uDrift.value = drift * speed;
        u.uWarp.value = 0.65 + values.reaction * 1.1 * lows;
        u.uFibre.value = values.fibres;
        u.uHigh.value = values.reaction * highs;
        u.uLift.value = values.reaction * clamp(rms, 0, 1);
      },
    };
  },
});
