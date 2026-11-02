import { Vector4 } from "three";
import { clamp, type FrameInput, type ParamSchema } from "@loopviz/mod-api";
import { defineHero, floatUniform, loopPhase } from "../define-hero";
import { estimateDuration, extractOnsets, type Onset } from "../ring-schedule";
import { SKY_GLSL } from "./glsl";
import {
  BOX_LIFE_SEC,
  MAX_BOXES,
  MAX_LINKS,
  MAX_NODES,
  baselineBirths,
  beatBirths,
  linkBoxes,
  nodeBrightness,
  nodeSeeds,
  nodeState,
  onsetBirths,
  placeBoxes,
  type BoxBirth,
  type NodeSeed,
  type NodeState,
} from "./nodes-motion";

export type NodesParams = {
  depth: number;
  count: number;
  boxes: number;
  fog: number;
  reaction: number;
  loopBars: number;
};

const BEATS_PER_BAR = 4;
const LINK_MAX_DIST = 0.34;
const BASELINE_SHARE = 0.4;

const FRAGMENT = /* glsl */ `
${SKY_GLSL}
#define NODES ${MAX_NODES}
#define BOXES ${MAX_BOXES}
#define LINKS ${MAX_LINKS}
// x, y, радиус, яркость (в высотах зоны)
uniform vec4 uNode[NODES];
// x, y, полуширина, полувысота
uniform vec4 uBoxA[BOXES];
// прозрачность, вспышка, метки координат
uniform vec4 uBoxB[BOXES];
// начало и конец связи
uniform vec4 uLinkA[LINKS];
uniform float uLinkAlpha[LINKS];
uniform float uDepth;
uniform float uFog;
uniform float uTheta;
uniform float uBreath;
uniform float uHigh;
uniform float uHit;
// Пиксель в высотах зоны и половина толщины линии.
uniform float uPx;
uniform float uHw;

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}

// Покрытие линии: резкий край шириной в один пиксель, не уже uHw.
float coverage(float d) {
  return clamp((uHw - d) / uPx + 0.5, 0.0, 1.0);
}

// Один слой пылинок: по одной на ячейку, дрейф по кругу замыкается с петлёй.
float dustLayer(vec2 p, float scale, float seed, float radius) {
  vec2 g = p * scale + vec2(cos(uTheta), sin(uTheta)) * 0.35;
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 h = hash22(cell + seed);
  float present = step(0.58, hash12(cell + seed + 7.3));
  float d = length(f - (h - 0.5) * 0.6) / scale;
  float r = max(radius, uPx * 0.9);
  float twinkle = 0.5 + 0.5 * sin(2.0 * uTheta + h.x * TAU);
  float lift = 1.0 + uHigh * 2.2 * h.y;
  return present * exp(-(d * d) / (r * r)) * (0.35 + 0.65 * twinkle) * lift;
}

void main() {
  vec2 p = heroCoord();
  vec2 loop = vec2(cos(uTheta), sin(uTheta));

  vec3 sky = skyGradient(p.y, uDepth);
  vec2 u = vec2(p.x * 1.1, p.y * 1.5) * 1.5 + loop * 0.45;
  float f = fbm(u, 0.0, 4);
  float mist = smoothstep(-0.18, 0.5, f);
  float low = smoothstep(0.15, -0.55, p.y);
  vec3 haze = mix(skyHorizon(uDepth), vec3(1.0), 0.55);
  sky = mix(sky, haze, uFog * (0.5 * mist + 0.35 * low));
  sky *= 1.0 - uFog * 0.05 * (1.0 - mist);
  sky = mix(sky, vec3(1.0), uBreath * 0.035);

  float luma = dot(sky, vec3(0.299, 0.587, 0.114));
  // 1 на бледном небе (линии темнее), 0 на глубоком (линии белые).
  float k = smoothstep(0.35, 0.65, luma);
  vec3 lightGlow = mix(uGlow, vec3(1.0), 0.35);
  vec3 deepGlow = mix(uAccent * uAccent, uGlow, 0.35);
  vec3 haloCol = mix(lightGlow, deepGlow, k);
  vec3 lineCol = mix(vec3(1.0), mix(uAccent * uAccent, uInk, 0.12) * 0.8, k);

  float core = 0.0;
  float halo = 0.0;
  for (int i = 0; i < NODES; i++) {
    vec4 n = uNode[i];
    if (n.w <= 0.0) continue;
    vec2 d = p - n.xy;
    float d2 = dot(d, d);
    float r = max(n.z, uPx);
    float reach = r * 9.0;
    if (d2 > reach * reach) continue;
    core += n.w * exp(-d2 / (r * r * 0.9));
    halo += n.w * 0.5 * exp(-d2 / (r * r * 14.0));
  }

  float dust = dustLayer(p, 15.0, 0.0, 0.0016) + dustLayer(p, 26.0, 11.0, 0.001);

  float boxCov = 0.0;
  float fill = 0.0;
  for (int i = 0; i < BOXES; i++) {
    vec4 a = uBoxA[i];
    vec4 b = uBoxB[i];
    if (b.x <= 0.0) continue;
    vec2 d = p - a.xy;
    vec2 q = abs(d) - a.zw;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    if (sd > 0.04) continue;
    float line = coverage(abs(sd));
    if (b.z > 0.5) {
      vec2 tl = a.xy + vec2(-a.z, a.w);
      vec2 br = a.xy + vec2(a.z, -a.w);
      float tick = min(
        min(segDist(p, tl, tl + vec2(-0.018, 0.0)), segDist(p, tl, tl + vec2(0.0, 0.018))),
        min(segDist(p, br, br + vec2(0.0, -0.018)), segDist(p, br, br + vec2(0.018, 0.0))));
      line = max(line, coverage(tick));
    }
    boxCov = max(boxCov, line * b.x * (1.0 + 0.5 * b.y));
    fill = max(fill, step(sd, 0.0) * b.y * b.x * 0.16);
  }

  float linkCov = 0.0;
  for (int i = 0; i < LINKS; i++) {
    float alpha = uLinkAlpha[i];
    if (alpha <= 0.0) continue;
    vec4 l = uLinkA[i];
    vec2 lo = min(l.xy, l.zw) - 0.01;
    vec2 hi = max(l.xy, l.zw) + 0.01;
    if (any(lessThan(p, lo)) || any(greaterThan(p, hi))) continue;
    linkCov = max(linkCov, coverage(segDist(p, l.xy, l.zw)) * alpha);
  }

  vec3 col = sky;
  col = mix(col, haloCol, clamp(halo, 0.0, 1.0) * 0.55);
  col += lightGlow * clamp(halo, 0.0, 1.0) * 0.22 * (1.0 - k);
  col = mix(col, haloCol, clamp(fill, 0.0, 1.0));
  col = mix(col, mix(vec3(1.0), lightGlow, 0.3), clamp(dust, 0.0, 1.0) * 0.85);
  col = mix(col, vec3(1.0), clamp(core, 0.0, 1.0));

  float lineCov = max(boxCov, linkCov * 0.8);
  float lineAlpha = mix(0.8, 0.6, k) + uHit * 0.2;
  col = mix(col, lineCol, clamp(lineCov * lineAlpha, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
`;

const params: ParamSchema<NodesParams> = {
  depth: { kind: "slider", label: "ГЛУБИНА НЕБА", min: 0, max: 1, step: 0.01, default: 0.5 },
  count: { kind: "slider", label: "ЧИСЛО УЗЛОВ", min: 10, max: MAX_NODES, step: 1, default: 34 },
  boxes: { kind: "slider", label: "РАМКИ И СВЯЗИ", min: 0, max: MAX_BOXES, step: 1, default: 10 },
  fog: { kind: "slider", label: "ПЛОТНОСТЬ ДЫМКИ", min: 0, max: 1, step: 0.01, default: 0.5 },
  reaction: { kind: "slider", label: "РЕАКЦИЯ НА МУЗЫКУ", min: 0, max: 1, step: 0.01, default: 0.7 },
  loopBars: { kind: "slider", label: "ПЕТЛЯ ДВИЖЕНИЯ, ТАКТОВ", min: 1, max: 8, step: 1, default: 4 },
};

interface OnsetCache {
  peaks: Float32Array | null;
  duration: number;
  sensitivity: number;
  onsets: Onset[];
}

/**
 * Рождения рамок как чистая функция кадра. Онсеты берутся из пиков файла (как у колец) и кэшируются по данным;
 * без пиков рамки рождаются на долях такта.
 */
function scheduleBirths(frame: FrameInput, sensitivity: number, max: number, cache: OnsetCache): BoxBirth[] {
  if (max <= 0) return [];
  const sourceT = (frame.beat * 60) / Math.max(1, frame.bpm);
  const duration = estimateDuration(sourceT, frame.wave.progress);
  if (duration !== null) {
    const { peaks } = frame.wave;
    if (cache.peaks !== peaks || cache.duration !== duration || cache.sensitivity !== sensitivity) {
      cache.peaks = peaks;
      cache.duration = duration;
      cache.sensitivity = sensitivity;
      cache.onsets = extractOnsets(peaks, duration, sensitivity);
    }
    if (cache.onsets.length > 0) {
      const start = sourceT - frame.loopT;
      const { fragment } = frame.wave;
      const length = (fragment.end - fragment.start) * duration;
      const span = length > 0 ? { start, end: start + length } : null;
      return onsetBirths(cache.onsets, sourceT, BOX_LIFE_SEC, span, max);
    }
  }
  return beatBirths(frame.beat, frame.bpm, BOX_LIFE_SEC, BEATS_PER_BAR, max);
}

export const heroSkyNodes = defineHero({
  meta: { id: "builtin.hero.sky-nodes", name: "TRACKING NODES", params },
  fragment: FRAGMENT,
  setup() {
    let seeds: NodeSeed[] = [];
    let seedCount = -1;
    const cache: OnsetCache = { peaks: null, duration: 0, sensitivity: -1, onsets: [] };
    const uniforms = {
      uNode: { value: Array.from({ length: MAX_NODES }, () => new Vector4()) },
      uBoxA: { value: Array.from({ length: MAX_BOXES }, () => new Vector4()) },
      uBoxB: { value: Array.from({ length: MAX_BOXES }, () => new Vector4()) },
      uLinkA: { value: Array.from({ length: MAX_LINKS }, () => new Vector4()) },
      uLinkAlpha: { value: new Float32Array(MAX_LINKS) },
      uDepth: floatUniform(0.35),
      uFog: floatUniform(0.5),
      uTheta: floatUniform(),
      uBreath: floatUniform(),
      uHigh: floatUniform(),
      uHit: floatUniform(),
      uPx: floatUniform(0.001),
      uHw: floatUniform(0.0006),
    };
    return {
      uniforms,
      update: (frame, values, view) => {
        const u = uniforms;
        const count = Math.round(clamp(values.count, 1, MAX_NODES));
        if (count !== seedCount) {
          seedCount = count;
          seeds = nodeSeeds(count);
        }
        const reaction = clamp(values.reaction, 0, 1);
        const phase = loopPhase(frame.bar, values.loopBars);
        const { rms, bands, spectrum, onset } = frame.audio;
        const highs = clamp(((bands[4] ?? 0) + (bands[5] ?? 0) + (bands[6] ?? 0)) / 3, 0, 1);

        const states: NodeState[] = seeds.map((seed) => nodeState(seed, phase, { aspect: view.aspect, drift: 0.8 }));
        for (let i = 0; i < MAX_NODES; i++) {
          const target = u.uNode.value[i];
          const seed = seeds[i];
          const state = states[i];
          if (!target) continue;
          if (!seed || !state) target.set(0, 0, 1, 0);
          else target.set(state.x, state.y, state.radius, nodeBrightness(seed, phase, rms, spectrum, reaction));
        }

        const total = Math.round(clamp(values.boxes, 0, MAX_BOXES));
        const baseline = Math.round(total * BASELINE_SHARE);
        const births = [
          ...scheduleBirths(frame, 0.35 + 0.5 * reaction, total - baseline, cache),
          ...baselineBirths(frame.beat, frame.bpm, baseline),
        ];
        const boxes = placeBoxes(births, seeds, states, total);
        const links = linkBoxes(boxes, LINK_MAX_DIST, MAX_LINKS);

        for (let i = 0; i < MAX_BOXES; i++) {
          const a = u.uBoxA.value[i];
          const b = u.uBoxB.value[i];
          const box = boxes[i];
          if (!a || !b) continue;
          if (!box) b.set(0, 0, 0, 0);
          else {
            a.set(box.x, box.y, box.halfW, box.halfH);
            b.set(box.alpha, box.flash * reaction, box.ticks, 0);
          }
        }
        for (let i = 0; i < MAX_LINKS; i++) {
          const a = u.uLinkA.value[i];
          const link = links[i];
          if (!a) continue;
          if (!link) u.uLinkAlpha.value[i] = 0;
          else {
            a.set(link.ax, link.ay, link.bx, link.by);
            u.uLinkAlpha.value[i] = link.alpha;
          }
        }

        const px = 1 / Math.max(1, view.h);
        u.uDepth.value = values.depth;
        u.uFog.value = values.fog;
        u.uTheta.value = phase * Math.PI * 2;
        u.uBreath.value = reaction * clamp(rms, 0, 1);
        u.uHigh.value = reaction * highs;
        u.uHit.value = reaction * clamp(onset, 0, 1);
        u.uPx.value = px;
        u.uHw.value = Math.max(0.0006, 0.5 * px);
      },
    };
  },
});
