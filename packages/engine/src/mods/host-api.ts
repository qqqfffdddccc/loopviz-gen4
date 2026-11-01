import * as THREE from "three";
import {
  API_VERSION,
  BUNDLED_FONTS,
  NOISE_GLSL,
  clamp,
  defineModule,
  lerp,
  linearToCss,
  linearToSrgb,
  smoothstep,
  srgbToLinear,
  type ModApi,
} from "@loopviz/mod-api";
import { FULLSCREEN_VERTEX } from "../post/fullscreen";

/** Объект `api`, который получает default-функция мода. */
export function createModApi(): ModApi {
  return Object.freeze({
    API_VERSION,
    defineModule,
    THREE,
    clamp,
    lerp,
    smoothstep,
    srgbToLinear,
    linearToSrgb,
    linearToCss,
    glsl: Object.freeze({ noise: NOISE_GLSL, fullscreenVertex: FULLSCREEN_VERTEX }),
    fonts: BUNDLED_FONTS,
  });
}
