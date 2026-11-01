import type { ShaderMaterial, WebGLRenderTarget, WebGLRenderer } from "three";

export type SurfaceKind = "webgl" | "canvas2d";

export interface CommonHelpers {
  clamp(value: number, min: number, max: number): number;
  lerp(a: number, b: number, k: number): number;
  smoothstep(edge0: number, edge1: number, x: number): number;
}

export interface WebGLHelpers extends CommonHelpers {
  /** Вершинный шейдер для полноэкранного прохода. Отдаёт varying vec2 vUv. */
  fullscreenVertex: string;
  /** Рисует материал на весь render target модуля. */
  renderFullscreenPass(material: ShaderMaterial): void;
}

export interface WebGLModuleContext {
  surface: "webgl";
  renderer: WebGLRenderer;
  target: WebGLRenderTarget;
  helpers: WebGLHelpers;
}

export interface Canvas2DModuleContext {
  surface: "canvas2d";
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  helpers: CommonHelpers;
}

export type ModuleContext = WebGLModuleContext | Canvas2DModuleContext;
