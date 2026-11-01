import {
  Color,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import type { FrameInput, ModuleDefinition, ParamValues, SlotKind } from "@loopviz/mod-api";
import { DEFAULT_LAYOUT, computeSlotRects, type Layout, type Rect } from "./layout";
import { PostPipeline } from "./post/pipeline";
import { DEFAULT_POST_SETTINGS, type PostSettings } from "./post/post-settings";
import { SlotBinding } from "./slot-binding";

const SLOT_DRAW_ORDER: readonly SlotKind[] = ["hero", "midi", "wave", "overlay"];

type ScenePass = "color" | "glow";

interface Quad {
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  shown: boolean;
}

export interface OutputSize {
  width: number;
  height: number;
}

export class Compositor {
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 1, 0, -1, 1);
  private readonly quads = new Map<SlotKind, Quad>();
  private readonly bindings = new Map<SlotKind, SlotBinding>();
  private readonly post: PostPipeline;
  private readonly clearColor = new Color();
  private layout: Layout = DEFAULT_LAYOUT;
  private postSettings: PostSettings = DEFAULT_POST_SETTINGS;
  private gap = 0;
  private width = 1;
  private height = 1;
  private workWidth = 0;
  private workHeight = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = true;
    this.post = new PostPipeline(this.renderer);
    SLOT_DRAW_ORDER.forEach((slot, index) => this.quads.set(slot, this.createQuad(index)));
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.renderer.setSize(this.width, this.height, false);
    this.applyWorkingSize(this.width, this.height);
  }

  setLayout(layout: Layout): void {
    this.layout = layout;
  }

  /** Отступ между зонами в пикселях текущего размера canvas. */
  setGap(gap: number): void {
    this.gap = Math.max(0, gap);
  }

  setPostSettings(settings: PostSettings): void {
    this.postSettings = settings;
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

  /** Ждёт ресурсы модулей (шрифты, изображения) с текущими параметрами. Экспорт вызывает перед первым кадром. */
  async prepare(): Promise<void> {
    await Promise.all([...this.bindings.values()].map((binding) => binding.prepare()));
  }

  /** Результат зависит только от frameInput и текущего состояния compositor, не от часов. */
  renderFrame(frame: FrameInput): void {
    this.draw(frame, this.width, this.height, this.gap, null);
  }

  /**
   * Рендерит кадр в заданном размере в offscreen-цель RGBA8 с закодированным sRGB.
   * Кадр на выходе тот же, что в превью: зерно, bloom и виньетка считаются от высоты кадра,
   * а отступ между зонами масштабируется. Цель принадлежит compositor и живёт до следующего вызова
   * с другим размером. Чтение пикселей и экспорт делаются снаружи.
   */
  renderFrameToTarget(frame: FrameInput, { width, height }: OutputSize): WebGLRenderTarget {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const target = this.post.getOutputTarget(w, h);
    const sized: FrameInput = { ...frame, size: { ...frame.size, w, h } };
    this.draw(sized, w, h, (this.gap * h) / this.height, target);
    return target;
  }

  dispose(): void {
    for (const binding of this.bindings.values()) binding.dispose();
    this.bindings.clear();
    for (const { mesh } of this.quads.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.post.dispose();
    this.renderer.dispose();
  }

  private draw(frame: FrameInput, width: number, height: number, gap: number, output: WebGLRenderTarget | null): void {
    this.applyWorkingSize(width, height);
    const rects = this.slotRects(width, height, gap);

    for (const slot of SLOT_DRAW_ORDER) {
      const quad = this.quads.get(slot);
      const binding = this.bindings.get(slot);
      const rect = rects.get(slot);
      if (!quad) continue;
      quad.shown = Boolean(binding?.ready && rect && rect.w >= 1 && rect.h >= 1);
      if (!binding || !rect || !quad.shown) continue;
      binding.resize(rect.w, rect.h);
      binding.render(frame);
      this.placeQuad(quad, rect, binding);
    }

    this.drawScene("color", frame, this.post.sceneTarget);
    this.drawScene("glow", frame, this.post.glowTarget);
    this.post.resolve(frame.theme, this.postSettings, frame.t, output);
  }

  /** Цветовой проход кладёт слоты на бумагу. Проход свечения рисует те же слоты на чёрном с opacity = glow слота. */
  private drawScene(pass: ScenePass, frame: FrameInput, target: WebGLRenderTarget): void {
    for (const [slot, quad] of this.quads) {
      const glow = this.postSettings.slotGlow[slot];
      quad.mesh.material.opacity = pass === "color" ? 1 : glow;
      quad.mesh.visible = quad.shown && (pass === "color" || glow > 0);
    }
    if (pass === "color") {
      this.clearColor.setRGB(...frame.theme.bg);
      this.renderer.setClearColor(this.clearColor, 1);
    } else {
      this.renderer.setClearColor(0x000000, 0);
    }
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  private applyWorkingSize(width: number, height: number): void {
    if (width === this.workWidth && height === this.workHeight) return;
    this.workWidth = width;
    this.workHeight = height;
    this.camera.right = width;
    this.camera.top = height;
    this.camera.updateProjectionMatrix();
    this.post.setSize(width, height);
  }

  private slotRects(width: number, height: number, gap: number): Map<SlotKind, Rect> {
    const rects = new Map<SlotKind, Rect>();
    for (const rect of computeSlotRects(this.layout, width, height, gap)) {
      rects.set(rect.slot, rect);
    }
    rects.set("overlay", { x: 0, y: 0, w: width, h: height });
    return rects;
  }

  private createQuad(renderOrder: number): Quad {
    const material = new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const mesh = new Mesh(new PlaneGeometry(1, 1), material);
    mesh.renderOrder = renderOrder;
    mesh.visible = false;
    this.scene.add(mesh);
    return { mesh, shown: false };
  }

  private placeQuad({ mesh }: Quad, rect: Rect, binding: SlotBinding): void {
    const texture = binding.surface.texture;
    if (mesh.material.map !== texture) {
      mesh.material.map = texture;
      mesh.material.needsUpdate = true;
    }
    mesh.scale.set(rect.w, rect.h, 1);
    mesh.position.set(rect.x + rect.w / 2, this.workHeight - (rect.y + rect.h / 2), 0);
  }
}
