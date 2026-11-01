import { useExportStore } from "../export/export-store";
import { useAppStore } from "../state/store";
import { useSourceStore } from "../state/source-store";
import { useProjectStore } from "./project-store";

export type Slices = readonly unknown[];

/**
 * Куски состояния, которые попадают в файл проекта. Сравниваются по ссылкам, поэтому прогресс анализа,
 * play/pause и выбранный слот проект грязным не делают.
 */
export function captureSlices(): Slices {
  const app = useAppStore.getState();
  const source = useSourceStore.getState();
  const exporter = useExportStore.getState();
  const project = useProjectStore.getState();
  return [
    app.layout,
    app.basePreset,
    app.gap,
    app.feather,
    app.moduleIds,
    app.moduleParams,
    app.theme,
    app.post,
    source.audio,
    source.midi,
    source.midiOffsetMs,
    source.timeline,
    exporter.resolution,
    exporter.fps,
    exporter.codec,
    exporter.fileName,
    project.name,
    project.media,
  ];
}

export function sameSlices(a: Slices, b: Slices): boolean {
  return a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
}

let baseline: Slices = [];
let suspended = 0;
const listeners = new Set<() => void>();

function check(): void {
  if (suspended > 0) return;
  const current = captureSlices();
  if (sameSlices(current, baseline)) return;
  baseline = current;
  if (!useProjectStore.getState().dirty) useProjectStore.getState().patch({ dirty: true });
  for (const listener of listeners) listener();
}

/** Подписка на изменения сохраняемых данных. Возвращает отписку. */
export function startProjectWatch(onChange: () => void): () => void {
  baseline = captureSlices();
  listeners.add(onChange);
  const unsubscribe = [useAppStore, useSourceStore, useExportStore, useProjectStore].map((store) => store.subscribe(check));
  return () => {
    listeners.delete(onChange);
    for (const stop of unsubscribe) stop();
  };
}

/** Изменения внутри fn (открытие, сброс) не делают проект грязным: после них базой становится итоговое состояние. */
export async function untracked<T>(fn: () => Promise<T>): Promise<T> {
  suspended += 1;
  try {
    return await fn();
  } finally {
    suspended -= 1;
    baseline = captureSlices();
  }
}
