import { useEffect, useRef } from "react";
import { clampFragment, mapVideoTimeToSourceTime, snapFragment, type Fragment } from "@loopviz/engine";
import { getAnalysis } from "../runtime/source-data";
import { transport } from "../runtime/transport";
import { drawWaveform, timeAtPixel } from "../runtime/waveform-view";
import { sourceExtent, useSourceStore } from "../state/source-store";

const DRAG_THRESHOLD_PX = 3;

interface DragState {
  startX: number;
  moved: boolean;
}

/** Холст рисуется собственным rAF-циклом по данным вне React. Выделение живёт в ref и попадает в стор по отпусканию. */
export function WaveformCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<Fragment | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frameId = 0;
    const size = { width: 1, height: 1, dpr: 1 };

    const fit = (): void => {
      size.dpr = window.devicePixelRatio;
      size.width = canvas.clientWidth;
      size.height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(size.width * size.dpr));
      canvas.height = Math.max(1, Math.round(size.height * size.dpr));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    const tick = (): void => {
      const state = useSourceStore.getState();
      drawWaveform(ctx, {
        ...size,
        extent: sourceExtent(state),
        peaks: getAnalysis()?.peaks ?? null,
        timeline: state.timeline,
        draft: draftRef.current,
        playheadSec: mapVideoTimeToSourceTime(state.timeline, transport.getTime()),
      });
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  const draftFrom = (clientX: number, drag: DragState): Fragment | null => {
    const canvas = canvasRef.current;
    const state = useSourceStore.getState();
    const extent = sourceExtent(state);
    if (!canvas || extent === null) return null;
    const rect = canvas.getBoundingClientRect();
    const a = timeAtPixel(drag.startX - rect.left, rect.width, extent);
    const b = timeAtPixel(clientX - rect.left, rect.width, extent);
    const raw = { startSec: Math.min(a, b), endSec: Math.max(a, b) };
    return state.timeline.snapToBars ? snapFragment(state.timeline, raw, extent) : clampFragment(raw, extent);
  };

  return (
    <canvas
      ref={canvasRef}
      className="waveform"
      aria-label="Waveform: выделите фрагмент мышью"
      onPointerDown={(event) => {
        if (sourceExtent(useSourceStore.getState()) === null) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { startX: event.clientX, moved: false };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        if (!drag.moved && Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        draftRef.current = draftFrom(event.clientX, drag);
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        dragRef.current = null;
        if (drag?.moved) {
          const fragment = draftFrom(event.clientX, drag);
          if (fragment) useSourceStore.getState().setFragment(fragment);
        }
        draftRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
        draftRef.current = null;
      }}
    />
  );
}
