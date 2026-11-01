import {
  CanvasTexture,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderTarget,
  type ShaderMaterial,
  type Texture,
  type WebGLRenderer,
} from "three";
import {
  assertNever,
  commonHelpers,
  type Canvas2DModuleContext,
  type ModuleContext,
  type SurfaceKind,
  type WebGLModuleContext,
} from "@loopviz/mod-api";
import { FULLSCREEN_VERTEX } from "./post/fullscreen";

export interface Surface {
  readonly context: ModuleContext;
  readonly texture: Texture;
  resize(w: number, h: number): void;
  /** Готовит поверхность к рисованию модуля. */
  begin(): void;
  /** Вызывается после render модуля. */
  end(): void;
  dispose(): void;
}

class WebGLSurface implements Surface {
  readonly context: WebGLModuleContext;
  private readonly target = new WebGLRenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad = new Mesh(new PlaneGeometry(2, 2));

  constructor(private readonly renderer: WebGLRenderer) {
    this.scene.add(this.quad);
    this.context = {
      surface: "webgl",
      renderer,
      target: this.target,
      helpers: {
        ...commonHelpers,
        fullscreenVertex: FULLSCREEN_VERTEX,
        renderFullscreenPass: (material: ShaderMaterial) => {
          this.quad.material = material;
          renderer.render(this.scene, this.camera);
        },
      },
    };
  }

  get texture(): Texture {
    return this.target.texture;
  }

  resize(w: number, h: number): void {
    this.target.setSize(w, h);
  }

  begin(): void {
    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
  }

  end(): void {
    this.renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.target.dispose();
    this.quad.geometry.dispose();
  }
}

class Canvas2DSurface implements Surface {
  readonly context: Canvas2DModuleContext;
  texture: CanvasTexture<OffscreenCanvas>;
  private readonly canvas = new OffscreenCanvas(1, 1);

  constructor() {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D context is unavailable on OffscreenCanvas");
    this.context = { surface: "canvas2d", canvas: this.canvas, ctx, helpers: commonHelpers };
    this.texture = this.createTexture();
  }

  private createTexture(): CanvasTexture<OffscreenCanvas> {
    const texture = new CanvasTexture(this.canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }

  resize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
    this.texture.dispose();
    this.texture = this.createTexture();
  }

  begin(): void {
    const { ctx, canvas } = this.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
  }

  end(): void {
    this.context.ctx.restore();
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

export function createSurface(kind: SurfaceKind, renderer: WebGLRenderer): Surface {
  switch (kind) {
    case "webgl":
      return new WebGLSurface(renderer);
    case "canvas2d":
      return new Canvas2DSurface();
    default:
      return assertNever(kind);
  }
}
