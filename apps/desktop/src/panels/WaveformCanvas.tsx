import { useEffect, useRef } from "react";
import { mapVideoTimeToSourceTime } from "@loopviz/engine";
import { getAnalysis } from "../runtime/source-data";
import { accentHexFor } from "../runtime/theme-css";
import { transport } from "../runtime/transport";
import { drawWaveform } from "../runtime/waveform-view";
import { sourceExtent, useSourceStore } from "../state/source-store";
import { useAppStore } from "../state/store";
import { useWaveformPointer } from "./useWaveformPointer";

/** Холст рисуется собственным rAF-циклом по данным вне React. Выделение живёт в ref и попадает в стор по отпусканию. */
export function WaveformCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { draftRef, handlers } = useWaveformPointer(canvasRef);

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
        accent: accentHexFor(useAppStore.getState().theme),
      });
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [draftRef]);

  return <canvas ref={canvasRef} className="waveform" aria-label="Waveform: выделите фрагмент мышью" {...handlers} />;
}
