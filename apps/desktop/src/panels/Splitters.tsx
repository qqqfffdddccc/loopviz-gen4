import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { computeSlotRects, dragSplitter, freeHeight, splittersOf, type Layout, type Splitter, type ZoneKind } from "@loopviz/engine";
import { useAppStore } from "../state/store";

const KEY_STEP = 0.01;
const HANDLE_HEIGHT = 14;

interface DragState {
  startY: number;
  layout: Layout;
}

interface HandleProps {
  splitter: Splitter;
  freePx: number;
}

function SplitHandle({ splitter, freePx }: HandleProps) {
  const dragRef = useRef<DragState | null>(null);
  const { upper, lower } = splitter;

  const nudge = (zoneUpper: ZoneKind, zoneLower: ZoneKind, delta: number): void => {
    const { layout, setLayout } = useAppStore.getState();
    setLayout(dragSplitter(layout, zoneUpper, zoneLower, delta));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startY: event.clientY, layout: useAppStore.getState().layout };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = (event.clientY - drag.startY) / freePx;
    useAppStore.getState().setLayout(dragSplitter(drag.layout, upper, lower, delta));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "ArrowUp") nudge(upper, lower, -KEY_STEP);
    else if (event.key === "ArrowDown") nudge(upper, lower, KEY_STEP);
    else if (event.key === "Enter") useAppStore.getState().resetSplitter(upper, lower);
    else return;
    event.preventDefault();
  };

  return (
    <div
      className="split-handle"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Граница зон: стрелки двигают, Enter сбрасывает"
      tabIndex={0}
      style={{ top: splitter.y - HANDLE_HEIGHT / 2, height: HANDLE_HEIGHT }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (dragRef.current = null)}
      onPointerCancel={() => (dragRef.current = null)}
      onDoubleClick={() => useAppStore.getState().resetSplitter(upper, lower)}
      onKeyDown={onKeyDown}
    />
  );
}

/** Тонкие разделители поверх превью. Положение считается из тех же прямоугольников, что рисует compositor. */
export function Splitters() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const layout = useAppStore((s) => s.layout);
  const gap = useAppStore((s) => s.gap);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = (): void => setHeight(element.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rects = useMemo(() => computeSlotRects(layout, 1, height, gap), [layout, height, gap]);
  const splitters = splittersOf(rects);
  const freePx = freeHeight(height, gap, rects.length);

  return (
    <div ref={ref} className="splitters">
      {splitters.map((splitter) => (
        <SplitHandle key={`${splitter.upper}-${splitter.lower}`} splitter={splitter} freePx={freePx} />
      ))}
    </div>
  );
}
