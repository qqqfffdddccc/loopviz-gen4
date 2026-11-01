import { useRef, useState, type PointerEvent, type RefObject } from "react";
import { dropIndex, type ReorderDrag } from "./reorder";

export interface ReorderHandleProps {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
}

export interface Reorder {
  containerRef: RefObject<HTMLDivElement | null>;
  drag: ReorderDrag | null;
  handleProps: (index: number) => ReorderHandleProps;
}

/** Перестановка строк указателем. Строки контейнера помечаются `data-reorder-row` и идут сверху вниз. */
export function useReorder(onMove: (from: number, to: number) => void): Reorder {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<ReorderDrag | null>(null);
  const [drag, setDrag] = useState<ReorderDrag | null>(null);

  const update = (next: ReorderDrag | null): void => {
    dragRef.current = next;
    setDrag((prev) => (prev?.from === next?.from && prev?.to === next?.to ? prev : next));
  };

  const targetAt = (from: number, clientY: number): number => {
    const rows = containerRef.current?.querySelectorAll<HTMLElement>(":scope > [data-reorder-row]") ?? [];
    const centers = Array.from(rows, (row) => {
      const box = row.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    return dropIndex(centers, from, clientY);
  };

  const handleProps = (index: number): ReorderHandleProps => ({
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      update({ from: index, to: index });
    },
    onPointerMove: (event) => {
      const current = dragRef.current;
      if (current) update({ from: current.from, to: targetAt(current.from, event.clientY) });
    },
    onPointerUp: (event) => {
      const current = dragRef.current;
      if (!current) return;
      const to = targetAt(current.from, event.clientY);
      update(null);
      if (to !== current.from) onMove(current.from, to);
    },
    onPointerCancel: () => update(null),
  });

  return { containerRef, drag, handleProps };
}
