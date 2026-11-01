import { NOISE_GLSL } from "@loopviz/mod-api";

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

${NOISE_GLSL}
// Координаты текущего пикселя в высотах зоны: центр в нуле, y вверх.
vec2 heroCoord() {
  return (vUv - vec2(0.5)) * vec2(uAspect, 1.0);
}
`;
