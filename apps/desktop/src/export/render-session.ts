import {
  CompositorFrameRenderer,
  Compositor,
  buildFrameInput,
  buildTheme,
  createMidiQuery,
  type ExportSize,
  type FrameContext,
  type FrameRenderer,
} from "@loopviz/engine";
import { MIDI_LOOKAHEAD_SEC, MIDI_LOOKBEHIND_SEC } from "../runtime/frame-source";
import { registry } from "../runtime/registry";
import { getAnalysis } from "../runtime/source-data";
import { ALL_SLOTS } from "../state/slots";
import { useSourceStore } from "../state/source-store";
import { activeParams, useAppStore } from "../state/store";
import { previewGate } from "./preview-gate";

const HOST_CANVAS_HEIGHT = 480;

export interface RenderSession {
  renderer: FrameRenderer;
  dispose(): void;
}

/**
 * Собственный compositor и собственные экземпляры модулей: превью их не трогает.
 * Состояние UI копируется один раз при создании, поэтому правки во время экспорта на ролик не влияют.
 */
export async function createRenderSession(size: ExportSize): Promise<RenderSession> {
  const app = useAppStore.getState();
  const { timeline, midi, midiOffsetMs } = useSourceStore.getState();

  const canvas = document.createElement("canvas");
  const compositor = new Compositor(canvas);
  try {
    const hostWidth = Math.max(1, Math.round((HOST_CANVAS_HEIGHT * size.width) / size.height));
    compositor.setSize(hostWidth, HOST_CANVAS_HEIGHT);
    compositor.setLayout(app.layout);
    compositor.setFeather(app.feather);
    compositor.setPostSettings(app.post);
    // Отступ в превью задан в CSS-пикселях его высоты; в выходном кадре он сохраняет ту же долю высоты.
    const gapShare = app.gap / Math.max(1, previewGate.cssHeight);
    compositor.setGap(gapShare * HOST_CANVAS_HEIGHT);

    await Promise.all(
      ALL_SLOTS.map(async (slot) => {
        const id = app.moduleIds[slot];
        await compositor.setModule(slot, id ? (registry.get(id) ?? null) : null);
        compositor.setParams(slot, activeParams(app, slot));
      }),
    );
    await compositor.prepare();

    const context: FrameContext = {
      analysis: getAnalysis(),
      midi: midi ? createMidiQuery(midi, midiOffsetMs / 1000) : null,
      timeline,
      theme: buildTheme(app.theme, app.post.grain),
      size: { w: size.width, h: size.height, dpr: 1 },
      lookbehindSec: MIDI_LOOKBEHIND_SEC,
      lookaheadSec: MIDI_LOOKAHEAD_SEC,
    };
    const renderer = new CompositorFrameRenderer(compositor, size, (t, frameSize) =>
      buildFrameInput(t, { ...context, size: frameSize }),
    );
    return { renderer, dispose: () => compositor.dispose() };
  } catch (error) {
    compositor.dispose();
    throw error;
  }
}
