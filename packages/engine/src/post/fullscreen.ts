import { Mesh, OrthographicCamera, PlaneGeometry, Scene, type ShaderMaterial, type WebGLRenderTarget, type WebGLRenderer } from "three";

export const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Рисует ShaderMaterial на весь target или на экран, если target равен null. */
export class FullscreenRenderer {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad = new Mesh(new PlaneGeometry(2, 2));

  constructor(private readonly renderer: WebGLRenderer) {
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  render(material: ShaderMaterial, target: WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.quad.geometry.dispose();
  }
}
