/**
 * Общий пролог hero-шейдеров: цвета темы, градиентный шум с периодом по y и fbm не больше пяти октав.
 * Координаты модулей считаются в высотах зоны (p.y от -0.5 до 0.5), поэтому картинка не зависит от разрешения.
 */
export const HERO_PRELUDE = /* glsl */ `
varying vec2 vUv;
uniform vec3 uInk;
uniform vec3 uAccent;
uniform vec3 uGlow;
uniform vec3 uBg;
uniform float uAspect;

#define TAU 6.28318530718
#define MAX_OCTAVES 5

vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

// Градиентный шум в диапазоне примерно -1..1. perY > 0 замыкает решётку по y: поле повторяется при сдвиге на perY ячеек.
float gnoise(vec2 p, float perY) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float y0 = i.y;
  float y1 = i.y + 1.0;
  if (perY > 0.0) {
    y0 = mod(y0, perY);
    y1 = mod(y1, perY);
  }
  vec2 g00 = hash22(vec2(i.x, y0)) * 2.0 - 1.0;
  vec2 g10 = hash22(vec2(i.x + 1.0, y0)) * 2.0 - 1.0;
  vec2 g01 = hash22(vec2(i.x, y1)) * 2.0 - 1.0;
  vec2 g11 = hash22(vec2(i.x + 1.0, y1)) * 2.0 - 1.0;
  float n00 = dot(g00, f);
  float n10 = dot(g10, f - vec2(1.0, 0.0));
  float n01 = dot(g01, f - vec2(0.0, 1.0));
  float n11 = dot(g11, f - vec2(1.0, 1.0));
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y) * 1.6;
}

// fbm с целым числом октав (<= MAX_OCTAVES). Сдвиги между октавами целые по y, поэтому период по y сохраняется.
float fbm(vec2 p, float perY, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < MAX_OCTAVES; i++) {
    if (i >= octaves) break;
    sum += amp * gnoise(p, perY);
    norm += amp;
    p = p * 2.0 + vec2(31.7, 11.0);
    perY *= 2.0;
    amp *= 0.5;
  }
  return sum / norm;
}

vec2 rot2(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Координаты текущего пикселя в высотах зоны: центр в нуле, y вверх.
vec2 heroCoord() {
  return (vUv - vec2(0.5)) * vec2(uAspect, 1.0);
}
`;
