import { useRef, type PointerEvent, type RefObject } from "react";
import {
  clampFragment,
  dragFragmentEdge,
  hitTestFragment,
  moveFragment,
  snapFragment,
  videoTimeForSource,
  type Fragment,
  type FragmentHit,
} from "@loopviz/engine";
import { transport } from "../runtime/transport";
import { timeAtPixel } from "../runtime/waveform-view";
import { sourceExtent, useSourceStore } from "../state/source-store";

const DRAG_THRESHOLD_PX = 3;
const EDGE_HIT_PX = 6;

type DragMode = "start" | "end" | "move" | "create";

interface DragState {
  mode: DragMode;
  startX: number;
  startSec: number;
  base: Fragment;
  moved: boolean;
}

const CURSORS: Record<FragmentHit, string> = {
  start: "ew-resize",
  end: "ew-resize",
  inside: "grab",
  outside: "crosshair",
};

function modeFor(hit: FragmentHit): DragMode {
  switch (hit) {
    case "start":
    case "end":
      return hit;
    case "inside":
      return "move";
    case "outside":
      return "create";
    default: {
      const never: never = hit;
      return never;
    }
  }
}

export interface WaveformPointer {
  /** Выделение в процессе перетаскивания: холст читает его в своём цикле, React его не видит. */
  draftRef: RefObject<Fragment | null>;
  handlers: {
    onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void;
    onPointerCancel: () => void;
  };
}

/**
 * Мышь на waveform: край тянет границу, середина двигает фрагмент, пустое место создаёт новый,
 * клик без движения перематывает плейхед. В стор фрагмент попадает один раз, при отпускании.
 */
export function useWaveformPointer(canvasRef: RefObject<HTMLCanvasElement | null>): WaveformPointer {
  const draftRef = useRef<Fragment | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const secAt = (clientX: number): { sec: number; width: number } | null => {
    const canvas = canvasRef.current;
    const extent = sourceExtent(useSourceStore.getState());
    if (!canvas || extent === null) return null;
    const box = canvas.getBoundingClientRect();
    return { sec: timeAtPixel(clientX - box.left, box.width, extent), width: box.width };
  };

  const draftFor = (drag: DragState, sec: number): Fragment | null => {
    const state = useSourceStore.getState();
    const extent = sourceExtent(state);
    if (extent === null) return null;
    const { timeline } = state;
    switch (drag.mode) {
      case "start":
      case "end":
        return dragFragmentEdge(timeline, drag.base, drag.mode, sec, extent);
      case "move":
        return moveFragment(timeline, drag.base, sec - drag.startSec, extent);
      case "create": {
        const raw = { startSec: Math.min(drag.startSec, sec), endSec: Math.max(drag.startSec, sec) };
        return timeline.snapToBars ? snapFragment(timeline, raw, extent) : clampFragment(raw, extent);
      }
      default: {
        const never: never = drag.mode;
        return never;
      }
    }
  };

  const hitAt = (clientX: number): FragmentHit => {
    const at = secAt(clientX);
    const state = useSourceStore.getState();
    const extent = sourceExtent(state);
    if (!at || extent === null) return "outside";
    return hitTestFragment(state.timeline.fragment, at.sec, extent, at.width, EDGE_HIT_PX);
  };

  const finish = (event: PointerEvent<HTMLCanvasElement> | null): void => {
    const drag = dragRef.current;
    dragRef.current = null;
    const draft = draftRef.current;
    draftRef.current = null;
    if (!drag || !event) return;
    if (draft && drag.moved) {
      useSourceStore.getState().setFragment(draft);
      return;
    }
    const at = secAt(event.clientX);
    const t = at ? videoTimeForSource(useSourceStore.getState().timeline.fragment, at.sec) : null;
    if (t !== null) transport.seek(t);
  };

  return {
    draftRef,
    handlers: {
      onPointerDown: (event) => {
        const at = secAt(event.clientX);
        if (!at) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const base = useSourceStore.getState().timeline.fragment;
        dragRef.current = { mode: modeFor(hitAt(event.clientX)), startX: event.clientX, startSec: at.sec, base, moved: false };
      },
      onPointerMove: (event) => {
        const drag = dragRef.current;
        if (!drag) {
          event.currentTarget.style.cursor = CURSORS[hitAt(event.clientX)];
          return;
        }
        if (!drag.moved && Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        const at = secAt(event.clientX);
        if (at) draftRef.current = draftFor(drag, at.sec);
      },
      onPointerUp: (event) => finish(event),
      onPointerCancel: () => finish(null),
    },
  };
}
