/**
 * Общие куски шейдеров для небесных hero-модулей. Подключаются после HERO_PRELUDE.
 * Небо строится от акцента темы, поэтому меняется вместе со слайдерами L/C/H.
 * Края зоны растворяются в бумаге за счёт feather в compositor, поэтому модуль рисует непрозрачное небо.
 */
export const SKY_GLSL = /* glsl */ `
// depth 0: бледное, почти белое небо; depth 1: глубокое дневное.
vec3 skyZenith(float depth) {
  vec3 pale = mix(vec3(0.96), uAccent, 0.5);
  vec3 deep = mix(pow(uAccent, vec3(2.4)), uAccent * uAccent, 0.25);
  float d = clamp(depth, 0.0, 1.0);
  return mix(pale, deep, d * (0.45 + 0.55 * d));
}

vec3 skyHorizon(float depth) {
  float d = clamp(depth, 0.0, 1.0);
  return mix(vec3(0.985), mix(vec3(1.0), uAccent, 0.55), 0.25 + 0.75 * d);
}

// y в координатах heroCoord (-0.5 внизу, 0.5 вверху).
vec3 skyGradient(float y, float depth) {
  float k = smoothstep(-0.6, 0.6, y);
  return mix(skyHorizon(depth), skyZenith(depth), k * k * (3.0 - 2.0 * k));
}

// Тень облака: серо-голубая, заметно темнее бледного неба, чтобы белые облака читались на любой глубине.
vec3 skyCloudShade(float depth) {
  vec3 grey = vec3(0.58, 0.65, 0.76);
  return mix(grey, uAccent * 0.62, 0.3) * (1.0 - 0.18 * clamp(depth, 0.0, 1.0));
}

// Освещённая часть облака: почти белая с каплей цвета свечения темы.
vec3 skyCloudLit() {
  return mix(vec3(1.0), uGlow, 0.08);
}
`;
