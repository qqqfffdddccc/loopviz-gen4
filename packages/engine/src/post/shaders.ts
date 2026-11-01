/** Ключ свечения: насыщенные яркие цвета. Бумага (низкая насыщенность) и чернила (малая яркость) дают 0. */
const GLOW_KEY = /* glsl */ `
float glowKey(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float sat = (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-4);
  return smoothstep(0.22, 0.6, sat) * smoothstep(0.18, 0.5, mx);
}
`;

/**
 * Маска свечения лежит в одном канале R (полу-float). Вход префильтра: слот, нарисованный на чёрном
 * с opacity = glow слота, то есть rgb = цвет * покрытие * glow, a = покрытие * glow.
 */
export const DOWNSAMPLE_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
${GLOW_KEY}
float fetch(vec2 uv) {
  vec4 s = texture2D(tSrc, uv);
#ifdef PREFILTER
  if (s.a < 1e-4) return 0.0;
  return s.a * glowKey(s.rgb / s.a);
#else
  return s.r;
#endif
}

void main() {
  vec2 t = uTexel;
  // 13 выборок Jimenez (CoD: Advanced Warfare): стабильный даунсэмпл без мерцания.
  float a = fetch(vUv + t * vec2(-2.0, 2.0));
  float b = fetch(vUv + t * vec2(0.0, 2.0));
  float c = fetch(vUv + t * vec2(2.0, 2.0));
  float d = fetch(vUv + t * vec2(-2.0, 0.0));
  float e = fetch(vUv);
  float f = fetch(vUv + t * vec2(2.0, 0.0));
  float g = fetch(vUv + t * vec2(-2.0, -2.0));
  float h = fetch(vUv + t * vec2(0.0, -2.0));
  float i = fetch(vUv + t * vec2(2.0, -2.0));
  float j = fetch(vUv + t * vec2(-1.0, 1.0));
  float k = fetch(vUv + t * vec2(1.0, 1.0));
  float l = fetch(vUv + t * vec2(-1.0, -1.0));
  float m = fetch(vUv + t * vec2(1.0, -1.0));
  float v = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(v, 0.0, 0.0, 1.0);
}
`;

export const UPSAMPLE_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tLow;
uniform sampler2D tHigh;
uniform vec2 uTexel;
uniform float uWeight;
uniform float uLowWeight;

void main() {
  vec2 t = uTexel;
  // Тент 3x3 по меньшему уровню, затем добавляем текущий уровень с его весом.
  float s = texture2D(tLow, vUv + t * vec2(-1.0, 1.0)).r
    + 2.0 * texture2D(tLow, vUv + t * vec2(0.0, 1.0)).r
    + texture2D(tLow, vUv + t * vec2(1.0, 1.0)).r
    + 2.0 * texture2D(tLow, vUv + t * vec2(-1.0, 0.0)).r
    + 4.0 * texture2D(tLow, vUv).r
    + 2.0 * texture2D(tLow, vUv + t * vec2(1.0, 0.0)).r
    + texture2D(tLow, vUv + t * vec2(-1.0, -1.0)).r
    + 2.0 * texture2D(tLow, vUv + t * vec2(0.0, -1.0)).r
    + texture2D(tLow, vUv + t * vec2(1.0, -1.0)).r;
  gl_FragColor = vec4(s / 16.0 * uLowWeight + texture2D(tHigh, vUv).r * uWeight, 0.0, 0.0, 1.0);
}
`;

/** Порядок: bloom, тонирование, виньетка, зерно, кодирование в sRGB. */
export const FINAL_FRAGMENT = /* glsl */ `
varying vec2 vUv;
${GLOW_KEY}
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec3 uGlowColor;
uniform vec3 uInk;
uniform float uBloom;
uniform float uVignette;
uniform float uGrain;
uniform float uGrainCell;
uniform float uSeed;

vec3 encodeSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

float rnd(uvec2 p, uint seed) {
  return float(pcg(p.x + pcg(p.y + pcg(seed)))) / 4294967295.0;
}

// Треугольное распределение из двух равномерных величин.
float tri(uvec2 p, uint seed) {
  return rnd(p, seed) + rnd(p, seed ^ 0x68E31DA4u) - 1.0;
}

// Крупные ячейки интерполируются smoothstep-ом между углами: зерно мягкое, без квадратов.
float grainNoise(vec2 fragCoord, float cellSize, uint seed) {
  if (cellSize <= 1.0) return tri(uvec2(fragCoord), seed);
  vec2 p = fragCoord / cellSize;
  uvec2 i = uvec2(floor(p));
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = tri(i, seed);
  float b = tri(i + uvec2(1u, 0u), seed);
  float c = tri(i + uvec2(0u, 1u), seed);
  float d = tri(i + uvec2(1u, 1u), seed);
  // Билинейная смесь теряет около трети разброса, компенсируем.
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y) * 1.5;
}

void main() {
  vec3 c = texture2D(tScene, vUv).rgb;

  // Ореол смешивается с бумагой через mix, а не складывается, поэтому светлый фон не выгорает.
  // Сам яркий источник ореолом почти не осветляется: акцент в ядре остаётся насыщенным.
  float halo = (1.0 - exp(-texture2D(tBloom, vUv).r * uBloom)) * (1.0 - 0.85 * glowKey(c));
  c = mix(c, uGlowColor, halo);

  // Тени подтягиваются к цвету чернил: чистого чёрного на бумаге не бывает.
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, max(c, uInk), (1.0 - smoothstep(0.0, 0.2, luma)) * 0.7);

  // Эллиптический радиус: 0 в центре, 1 в углу. Зависит только от UV, поэтому масштаб кадра не влияет.
  float r = length((vUv - 0.5) * 2.0) * 0.7071;
  c *= 1.0 - uVignette * 0.2 * smoothstep(0.45, 1.0, r);

  vec3 s = encodeSrgb(c);

  // Seed задан номером кадра, а не Math.random.
  float n = grainNoise(floor(gl_FragCoord.xy), uGrainCell, uint(uSeed));
  // На светлой бумаге зерно в светах читается сильнее всего, поэтому там оно слабее.
  float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
  float tone = mix(1.0, 0.55, smoothstep(0.6, 1.0, lum));
  // Плюс 1/255 дизеринга убирает бэндинг мягких градиентов даже при нулевом зерне.
  s += n * (uGrain * tone + 1.0 / 255.0);

  gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
}
`;
