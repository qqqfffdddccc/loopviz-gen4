import { Vector4 } from "three";
import { clamp, type ParamSchema } from "@loopviz/mod-api";
import { defineHero, loopPhase } from "./define-hero";
import { MAX_PETALS, beatPulse, petalSeeds, petalState, type PetalSeed } from "./petal-motion";

export type PetalsParams = {
  count: number;
  size: number;
  dof: number;
  focus: number;
  drift: number;
  accentShare: number;
  beatGlow: number;
  loopBars: number;
};

const FRAGMENT = /* glsl */ `
#define PETALS ${MAX_PETALS}
// x, y, радиус, размытие (в высотах зоны)
uniform vec4 uA[PETALS];
// поворот, сжатие по ширине, жар акцента 0..1, непрозрачность
uniform vec4 uB[PETALS];

void main() {
  vec2 p = heroCoord();
  vec3 acc = vec3(0.0);
  float transmit = 1.0;

  // Лепестки приходят от ближних к дальним: накапливаем спереди назад.
  for (int i = 0; i < PETALS; i++) {
    vec4 a = uA[i];
    vec4 b = uB[i];
    if (b.w <= 0.0) continue;

    vec2 d = p - a.xy;
    float reach = a.z * 1.7 + a.w * 2.6;
    if (dot(d, d) > reach * reach) continue;

    d = rot2(d, -b.x);
    float along = clamp(d.x / (2.0 * a.z) + 0.5, 0.0, 1.0);
    d.y /= b.y * mix(1.15, 0.55, along);
    d.x *= d.x > 0.0 ? 1.0 : 1.3;
    float sdf = (length(d) - a.z) * mix(b.y, 1.0, 0.45);

    float cover = 1.0 - smoothstep(-a.w, a.w, sdf);
    // Расфокус размазывает форму: пик светлеет, пока площадь растёт.
    cover *= (a.z * a.z) / (a.z * a.z + 0.35 * a.w * a.w);
    float shade = 0.62 + 0.38 * (1.0 - along);
    float opacity = clamp(cover * b.w * shade, 0.0, 1.0);

    vec3 hotColor = mix(uAccent, uGlow, smoothstep(0.7, 1.0, b.z) * 0.55);
    vec3 c = mix(uInk, hotColor, smoothstep(0.05, 0.45, b.z));
    acc += transmit * opacity * c;
    transmit *= 1.0 - opacity;
  }

  float alpha = 1.0 - transmit;
  vec3 col = acc / max(alpha, 1e-4);
  gl_FragColor = vec4(col, alpha);
}
`;

const params: ParamSchema<PetalsParams> = {
  count: { kind: "slider", label: "КОЛИЧЕСТВО", min: 6, max: MAX_PETALS, step: 1, default: 30 },
  size: { kind: "slider", label: "РАЗМЕР", min: 0.4, max: 2.2, step: 0.05, default: 1.15 },
  dof: { kind: "slider", label: "ГЛУБИНА РЕЗКОСТИ", min: 0, max: 1, step: 0.01, default: 0.65 },
  focus: { kind: "slider", label: "ПЛОСКОСТЬ ФОКУСА", min: 0, max: 1, step: 0.01, default: 0.55 },
  drift: { kind: "slider", label: "ДРЕЙФ", min: 0, max: 1, step: 0.01, default: 0.6 },
  accentShare: { kind: "slider", label: "ДОЛЯ АКЦЕНТНЫХ", min: 0, max: 0.5, step: 0.01, default: 0.14 },
  beatGlow: { kind: "slider", label: "СВЕЧЕНИЕ НА БИТЕ", min: 0, max: 1, step: 0.01, default: 0.8 },
  loopBars: { kind: "slider", label: "ПЕТЛЯ ДВИЖЕНИЯ, ТАКТОВ", min: 1, max: 8, step: 1, default: 4 },
};

export const heroPetals = defineHero({
  meta: { id: "builtin.hero.petals", name: "Petal Drift", params },
  fragment: FRAGMENT,
  setup() {
    let seeds: PetalSeed[] = [];
    let seedCount = -1;
    const uniforms = {
      uA: { value: Array.from({ length: MAX_PETALS }, () => new Vector4()) },
      uB: { value: Array.from({ length: MAX_PETALS }, () => new Vector4()) },
    };
    return {
      uniforms,
      update: (frame, values, view) => {
        const count = Math.round(clamp(values.count, 1, MAX_PETALS));
        if (count !== seedCount) {
          seedCount = count;
          seeds = petalSeeds(count);
        }
        const phase = loopPhase(frame.bar, values.loopBars);
        const hit = clamp(frame.audio.onset, 0, 1);
        const options = { aspect: view.aspect, drift: values.drift, size: values.size, dof: values.dof, focus: values.focus };

        for (let i = 0; i < MAX_PETALS; i++) {
          const a = uniforms.uA.value[i];
          const b = uniforms.uB.value[i];
          const seed = seeds[i];
          if (!a || !b) continue;
          if (!seed) {
            b.set(0, 1, 0, 0);
            continue;
          }
          const state = petalState(seed, phase, options);
          const accented = seed.accentRoll < values.accentShare;
          const pulse = Math.max(beatPulse(frame.beat, seed.index), hit * 0.7);
          const hot = accented ? clamp(0.62 + values.beatGlow * 0.5 * pulse, 0, 1) : 0;
          const radius = accented ? state.radius * 1.15 : state.radius;
          const blur = accented ? state.blur * 0.7 : state.blur;
          const opacity = accented ? Math.min(1, state.opacity * 1.7 + 0.1 * pulse) : state.opacity;
          a.set(state.x, state.y, radius, blur);
          b.set(state.rotation, state.squash, hot, opacity);
        }
      },
    };
  },
});
