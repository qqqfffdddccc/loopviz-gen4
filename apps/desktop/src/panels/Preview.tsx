import { useEffect, useRef } from "react";
import { startPreview } from "../runtime/preview";
import { Splitters } from "./Splitters";

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preview = startPreview(canvas);
    const fit = (): void => {
      const dpr = window.devicePixelRatio;
      preview.setSize(canvas.clientWidth * dpr, canvas.clientHeight * dpr, dpr);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      preview.stop();
    };
  }, []);

  return (
    <main className="stage">
      <div className="preview-frame">
        <canvas ref={canvasRef} className="preview" aria-label="Превью 9:16" />
        <Splitters />
      </div>
    </main>
  );
}
