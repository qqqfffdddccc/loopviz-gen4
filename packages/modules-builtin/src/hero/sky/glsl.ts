/**
 * Общие куски шейдеров для небесных hero-модулей. Подключаются после HERO_PRELUDE.
 * Небо строится от акцента темы, поэтому меняется вместе со слайдерами L/C/H.
 * Края зоны растворяются в бумаге за счёт feather в compositor, поэтому модуль рисует непрозрачное небо.
 */
export const SKY_GLSL = /* glsl */ `
// depth 0: бледное, почти белое небо; depth 1: глубокое дневное.
vec3 skyZenith(float depth) {
  vec3 pale = mix(uBg, uAccent, 0.35);
  vec3 deep = mix(uAccent, uAccent * uAccent, 0.55);
  return mix(pale, deep, clamp(depth, 0.0, 1.0));
}

vec3 skyHorizon(float depth) {
  vec3 pale = mix(uBg, vec3(1.0), 0.4);
  vec3 deep = mix(uBg, uAccent, 0.45);
  return mix(pale, deep, clamp(depth, 0.0, 1.0) * 0.6);
}

// y в координатах heroCoord (-0.5 внизу, 0.5 вверху).
vec3 skyGradient(float y, float depth) {
  float k = smoothstep(-0.55, 0.55, y);
  return mix(skyHorizon(depth), skyZenith(depth), k * k * (3.0 - 2.0 * k));
}
`;
