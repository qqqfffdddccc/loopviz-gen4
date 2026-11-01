import {
  Color,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from "three";
import type { FrameInput, ModuleDefinition, ParamValues, SlotKind } from "@loopviz/mod-api";
import { DEFAULT_LAYOUT, computeSlotRects, type Layout, type Rect } from "./layout";
import { SlotBinding } from "./slot-binding";

const SLOT_DRAW_ORDER: readonly SlotKind[] = ["hero", "midi", "wave", "overlay"];

interface Quad {
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
}

export class Compositor {
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 1, 0, -1, 1);
  private readonly quads = new Map<SlotKind, Quad>();
  private readonly bindings = new Map<SlotKind, SlotBinding>();
  private readonly bgColor = new Color();
  private layout: Layout = DEFAULT_LAYOUT;
  private gap = 0;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = true;
    SLOT_DRAW_ORDER.forEach((slot, index) => this.quads.set(slot, this.createQuad(index)));
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.right = this.width;
    this.camera.top = this.height;
    this.camera.updateProjectionMatrix();
  }

  setLayout(layout: Layout): void {
    this.layout = layout;
  }

  setGap(gap: number): void {
    this.gap = Math.max(0, gap);
  }

  setParams(slot: SlotKind, params: ParamValues): void {
    const binding = this.bindings.get(slot);
    if (binding) binding.params = params;
  }

  /** Создаёт собственный экземпляр модуля для слота. Пока init не завершён, слот не рисуется. */
  async setModule(slot: SlotKind, definition: ModuleDefinition<ParamValues> | null): Promise<void> {
    if (definition && definition.slot !== slot) {
      throw new Error(`Module ${definition.id} belongs to slot ${definition.slot}, not ${slot}`);
    }
    this.bindings.get(slot)?.dispose();
    this.bindings.delete(slot);
    if (!definition) return;

    const binding = new SlotBinding(definition, this.renderer);
    this.bindings.set(slot, binding);
    try {
      await binding.init();
    } catch (error) {
      if (this.bindings.get(slot) === binding) this.bindings.delete(slot);
      binding.dispose();
      throw error;
    }
  }

  /** Результат зависит только от frameInput и текущего состояния compositor, не от часов. */
  renderFrame(frame: FrameInput): void {
    const rects = this.slotRects();
    this.bgColor.setRGB(...frame.theme.bg);

    for (const slot of SLOT_DRAW_ORDER) {
      const quad = this.quads.get(slot);
      const binding = this.bindings.get(slot);
      const rect = rects.get(slot);
      if (!quad) continue;
      if (!binding?.ready || !rect || rect.w < 1 || rect.h < 1) {
        quad.mesh.visible = false;
        continue;
      }
      binding.resize(rect.w, rect.h);
      binding.render(frame);
      this.placeQuad(quad, rect, binding);
    }

    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(this.bgColor, 1);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const binding of this.bindings.values()) binding.dispose();
    this.bindings.clear();
    for (const { mesh } of this.quads.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.renderer.dispose();
  }

  private slotRects(): Map<SlotKind, Rect> {
    const rects = new Map<SlotKind, Rect>();
    for (const rect of computeSlotRects(this.layout, this.width, this.height, this.gap)) {
      rects.set(rect.slot, rect);
    }
    rects.set("overlay", { x: 0, y: 0, w: this.width, h: this.height });
    return rects;
  }

  private createQuad(renderOrder: number): Quad {
    const material = new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const mesh = new Mesh(new PlaneGeometry(1, 1), material);
    mesh.renderOrder = renderOrder;
    mesh.visible = false;
    this.scene.add(mesh);
    return { mesh };
  }

  private placeQuad({ mesh }: Quad, rect: Rect, binding: SlotBinding): void {
    const texture = binding.surface.texture;
    if (mesh.material.map !== texture) {
      mesh.material.map = texture;
      mesh.material.needsUpdate = true;
    }
    mesh.scale.set(rect.w, rect.h, 1);
    mesh.position.set(rect.x + rect.w / 2, this.height - (rect.y + rect.h / 2), 0);
    mesh.visible = true;
  }
}
