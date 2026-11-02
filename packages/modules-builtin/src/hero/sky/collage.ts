import { clamp, type ParamSchema } from "@loopviz/mod-api";
import { defineHero, floatUniform, loopPhase } from "../define-hero";
import { collageBeat, tileLevels } from "./collage-schedule";
import { SKY_GLSL } from "./glsl";

export type CollageParams = {
  depth: number;
  density: number;
  shuffle: number;
  reaction: number;
  speed: number;
  loopBars: number;
};

const MAX_LEVELS = 6;

const FRAGMENT = /* glsl */ `
${SKY_GLSL}
uniform float uTheta;
uniform float uLayout;
uniform float uFrom;
uniform float uTo;
uniform float uEase;
uniform float uPulse;
uniform float uStrength;
uniform float uDepth;
uniform float uShuffle;
uniform float uReact;
uniform float uDrift;
uniform float uBreath;
uniform float uHigh;
uniform float uOnset;
uniform float uHpx;
uniform int uLevels;

// Раскладка плиток: рекурсивное деление зоны на прямоугольники. Результат зависит только от seed и точки.
void findTile(vec2 p, float seed, out vec2 lo, out vec2 hi, out float id) {
  lo = vec2(-0.5 * uAspect, -0.5);
  hi = -lo;
  id = seed * 13.0 + 1.0;
  for (int i = 0; i < ${MAX_LEVELS}; i++) {
    if (i >= uLevels) break;
    vec2 size = hi - lo;
    float k = float(i);
    vec3 h = vec3(hash12(vec2(id, k + 0.5)), hash12(vec2(id, k + 7.5)), hash12(vec2(id, k + 19.5)));
    if (i >= 2 && h.x < 0.2) break;
    bool vertical = h.y < size.x / (size.x + size.y);
    float t = 0.5 + (h.z - 0.5) * 0.86;
    float side;
    if (vertical) {
      float cut = lo.x + size.x * t;
      side = step(cut, p.x);
      if (side > 0.5) lo.x = cut; else hi.x = cut;
    } else {
      float cut = lo.y + size.y * t;
      side = step(cut, p.y);
      if (side > 0.5) lo.y = cut; else hi.y = cut;
    }
    id = hash12(vec2(id * 1.3 + side * 5.0, k + 3.0)) * 97.0 + 1.0;
  }
}

// Смещение плитки на конкретной доле: двигается лишь часть плиток, доля растёт с uShuffle.
vec2 beatOffset(float id, float beatIdx) {
  float isActive = step(hash12(vec2(id * 1.7 + 0.3, beatIdx * 3.1 + 5.0)), uShuffle * 0.55);
  vec2 d = hash22(vec2(id * 0.9 + 2.0, beatIdx * 1.7 + 9.0)) - 0.5;
  return d * vec2(0.62, 0.3) * isActive * uStrength;
}

vec3 skyAt(vec2 q, vec2 drift, float detail) {
  vec3 base = skyGradient(q.y * 0.9, uDepth);

  vec2 u = vec2(q.x * 1.5, q.y * 2.7) + drift + vec2(7.3, 2.1);
  float n = fbm(u, 0.0, 5);
  float bias = -q.y * 0.55 + 0.04;
  float thick = n * detail + bias;
  float cover = smoothstep(-0.06, 0.24, thick);
  float core = smoothstep(0.1, 0.75, thick);

  float n2 = fbm(u + vec2(-0.09, 0.11), 0.0, 4);
  float side = clamp(0.55 + (n - n2) * 2.6, 0.0, 1.0);
  vec3 lit = skyCloudLit();
  vec3 shade = skyCloudShade(uDepth);
  float body = (0.3 + 0.7 * core) * (0.55 + 0.45 * smoothstep(0.3, -0.5, q.y));
  vec3 cloud = mix(shade, lit, mix(1.0, side, body));

  vec2 sunP = vec2(0.06 * uAspect, 0.1);
  float sd = length(q - sunP);
  float sun = exp(-sd * sd * 70.0) + 0.3 * exp(-sd * 4.5);
  float rays = exp(-abs(q.y - sunP.y) * 22.0) * 0.25 * exp(-abs(q.x - sunP.x) * 1.5);

  vec3 col = mix(base, cloud, cover);
  col = mix(col, lit, clamp((sun + rays) * (0.55 + 0.45 * uBreath * 4.0), 0.0, 1.0));
  return col;
}

void main() {
  vec2 p = heroCoord();
  vec2 lo;
  vec2 hi;
  float id;
  findTile(p, uLayout, lo, hi, id);
  vec2 c = 0.5 * (lo + hi);

  float moved = step(hash12(vec2(id, 12.0)), uShuffle * 0.6);
  float rescaled = step(hash12(vec2(id, 23.0)), 0.3 + 0.4 * uShuffle) * moved;
  float soft = step(hash12(vec2(id, 24.0)), 0.16 + 0.1 * uShuffle);
  vec2 stat = (hash22(vec2(id, 21.0)) - 0.5) * vec2(0.55, 0.28) * moved;
  float zoom = mix(1.0, exp((hash12(vec2(id, 22.0)) - 0.5) * 1.1), rescaled);
  zoom *= mix(1.0, 0.14, soft);

  vec2 jump = mix(beatOffset(id, uFrom), beatOffset(id, uTo), uEase) * uReact;
  float kicked = step(hash12(vec2(id, 31.0)), 0.35);
  float nudge = uOnset * uReact * 0.07 * (hash12(vec2(id, 32.0)) * 2.0 - 1.0) * kicked;

  vec2 q = c + (p - c) * zoom + stat + jump + vec2(nudge, 0.0);

  float own = step(hash12(vec2(id, 41.0)), 0.4);
  float phi = TAU * hash12(vec2(id, 42.0)) * own;
  float ang = uTheta + phi;
  vec2 drift = uDrift * vec2(cos(ang), sin(ang));

  vec3 col = skyAt(q, drift, mix(1.0, 0.55, soft));

  float tone = (hash12(vec2(id, 51.0)) - 0.5) * 0.1 * (0.4 + uShuffle);
  float flash = uPulse * uReact * step(hash12(vec2(id, 52.0)), 0.3) * 0.12;
  float flick = sin(uTheta * (2.0 + floor(hash12(vec2(id, 53.0)) * 3.0)) + hash12(vec2(id, 54.0)) * TAU);
  col += tone + flash + uHigh * 0.045 * flick;

  vec2 sparkP = p * vec2(70.0, 140.0) + vec2(cos(uTheta), sin(uTheta)) * 2.0;
  col += uHigh * 0.07 * smoothstep(0.35, 0.9, gnoise(sparkP, 0.0)) * (1.0 - soft);

  vec2 outerLo = vec2(-0.5 * uAspect, -0.5);
  vec2 outerHi = -outerLo;
  float dEdge = min(
    min(lo.x > outerLo.x + 1e-4 ? p.x - lo.x : 1.0, hi.x < outerHi.x - 1e-4 ? hi.x - p.x : 1.0),
    min(lo.y > outerLo.y + 1e-4 ? p.y - lo.y : 1.0, hi.y < outerHi.y - 1e-4 ? hi.y - p.y : 1.0));
  float px = 1.0 / max(uHpx, 1.0);
  float frameLine = (1.0 - smoothstep(1.0 * px, 2.4 * px, dEdge)) * step(hash12(vec2(id, 61.0)), 0.5);
  col = mix(col, vec3(1.0), frameLine * 0.5);

  col += (vec3(1.0) - col) * uBreath * 0.5;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const params: ParamSchema<CollageParams> = {
  depth: { kind: "slider", label: "ГЛУБИНА НЕБА", min: 0, max: 1, step: 0.01, default: 0.5 },
  density: { kind: "slider", label: "ПЛОТНОСТЬ ПЛИТОК", min: 0, max: 1, step: 0.01, default: 0.5 },
  shuffle: { kind: "slider", label: "СДВИГ ПЛИТОК", min: 0, max: 1, step: 0.01, default: 0.5 },
  reaction: { kind: "slider", label: "РЕАКЦИЯ НА ЗВУК", min: 0, max: 1, step: 0.01, default: 0.6 },
  speed: { kind: "slider", label: "СКОРОСТЬ ОБЛАКОВ", min: 0, max: 1, step: 0.01, default: 0.35 },
  loopBars: { kind: "slider", label: "ПЕТЛЯ ДВИЖЕНИЯ, ТАКТОВ", min: 1, max: 8, step: 1, default: 4 },
};

export const heroSkyCollage = defineHero({
  meta: { id: "builtin.hero.sky-collage", name: "SKY COLLAGE", params },
  fragment: FRAGMENT,
  setup() {
    const uniforms = {
      uTheta: floatUniform(),
      uLayout: floatUniform(),
      uFrom: floatUniform(),
      uTo: floatUniform(),
      uEase: floatUniform(1),
      uPulse: floatUniform(),
      uStrength: floatUniform(1),
      uDepth: floatUniform(0.35),
      uShuffle: floatUniform(),
      uReact: floatUniform(),
      uDrift: floatUniform(),
      uBreath: floatUniform(),
      uHigh: floatUniform(),
      uOnset: floatUniform(),
      uHpx: floatUniform(1000),
      uLevels: { value: 4 },
    };
    return {
      uniforms,
      update: (frame, values, view) => {
        const u = uniforms;
        const { bands, rms, onset } = frame.audio;
        const highs = clamp(((bands[4] ?? 0) + (bands[5] ?? 0) + (bands[6] ?? 0)) / 3, 0, 1);
        const step = collageBeat(frame.beat, values.loopBars);

        u.uTheta.value = loopPhase(frame.bar, values.loopBars) * Math.PI * 2;
        u.uLayout.value = step.layout;
        u.uFrom.value = step.from;
        u.uTo.value = step.to;
        u.uEase.value = step.ease;
        u.uPulse.value = step.pulse;
        u.uStrength.value = step.strength;
        u.uDepth.value = values.depth;
        u.uShuffle.value = values.shuffle;
        u.uReact.value = values.reaction;
        u.uDrift.value = 0.1 + 0.7 * values.speed;
        u.uBreath.value = clamp(rms, 0, 1) * 0.14 * values.reaction;
        u.uHigh.value = highs * values.reaction;
        u.uOnset.value = clamp(onset, 0, 1);
        u.uHpx.value = view.h;
        u.uLevels.value = tileLevels(values.density);
      },
    };
  },
});
