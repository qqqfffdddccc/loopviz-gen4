import { useState } from "react";
import {
  defaultOutputName,
  exportFrameCount,
  exportSize,
  totalDuration,
  type ExportCodec,
  type ExportFps,
  type ExportResolution,
} from "@loopviz/engine";
import { isBusy, useExportStore } from "../export/export-store";
import { formatDuration, progressLines } from "../export/format";
import { defaultExportDir, errorMessage, isTauri, pickOutputPath, revealInFinder } from "../export/ipc";
import { cancelExport, runExport } from "../export/run-export";
import { useSourceStore } from "../state/source-store";
import { Checkbox } from "../ui/Checkbox";
import { Section } from "../ui/Section";
import { TextField } from "../ui/TextField";

const RESOLUTIONS: { id: ExportResolution; label: string }[] = [
  { id: "1080p", label: "1080×1920" },
  { id: "4k", label: "2160×3840" },
];
const FPS_OPTIONS: ExportFps[] = [30, 60];
const CODECS: { id: ExportCodec; label: string }[] = [
  { id: "h264", label: "H.264" },
  { id: "hevc", label: "HEVC" },
];

function OptionRow<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="export-options" aria-disabled={disabled}>
      {options.map((option) => (
        <Checkbox key={option.id} checked={option.id === value} label={option.label} onChange={() => !disabled && onChange(option.id)} />
      ))}
    </div>
  );
}

function Summary() {
  const timeline = useSourceStore((s) => s.timeline);
  const fps = useExportStore((s) => s.fps);
  const resolution = useExportStore((s) => s.resolution);
  const total = totalDuration(timeline);
  const { width, height } = exportSize(resolution);
  return (
    <p className="muted">
      ИТОГО {formatDuration(total)} ({total.toFixed(2)} С) · {exportFrameCount(total, fps)} КАДРОВ · {width}×{height}
    </p>
  );
}

function ProgressBlock() {
  const phase = useExportStore((s) => s.phase);
  const progress = useExportStore((s) => s.progress);
  const result = useExportStore((s) => s.result);
  const error = useExportStore((s) => s.error);
  const [revealError, setRevealError] = useState<string | null>(null);

  const reveal = async (path: string): Promise<void> => {
    try {
      await revealInFinder(path);
      setRevealError(null);
    } catch (e) {
      setRevealError(errorMessage(e));
    }
  };

  if (phase === "preparing") return <p className="status">ПОДГОТОВКА: ЗВУК, МОДУЛИ, FFMPEG...</p>;
  if (phase === "finishing") return <p className="status">ЗАВЕРШЕНИЕ: ФИНАЛИЗАЦИЯ MP4...</p>;
  if (phase === "running" && progress) return <p className="status">{progressLines(progress).join("\n")}</p>;
  if (phase === "cancelled") return <p className="status">ОТМЕНЕНО</p>;
  if (phase === "error") return <p className="notice">{error}</p>;
  if (phase === "done" && result) {
    return (
      <div className="source-block">
        <p className="status">
          ГОТОВО за {formatDuration(result.seconds)} · {result.encoder}
        </p>
        <p className="muted">{result.path}</p>
        <button
          type="button"
          className="file-button"
          onClick={() => void reveal(result.path)}
        >
          [→] ПОКАЗАТЬ В FINDER
        </button>
        {revealError ? <p className="notice">{revealError}</p> : null}
      </div>
    );
  }
  return null;
}

async function startExport(): Promise<void> {
  const { resolution, fps, codec, fileName, fail } = useExportStore.getState();
  const audioName = useSourceStore.getState().audio?.name ?? "loopviz";
  const name = (fileName.trim() || defaultOutputName(audioName, resolution, fps)).replace(/(\.mp4)?$/i, ".mp4");
  let outputPath: string | null;
  try {
    outputPath = await pickOutputPath(`${await defaultExportDir()}/${name}`);
  } catch (error) {
    fail(errorMessage(error));
    return;
  }
  if (!outputPath) return;
  await runExport({ resolution, fps, codec, outputPath }).catch(() => undefined);
}

export function ExportSection() {
  const resolution = useExportStore((s) => s.resolution);
  const fps = useExportStore((s) => s.fps);
  const codec = useExportStore((s) => s.codec);
  const fileName = useExportStore((s) => s.fileName);
  const phase = useExportStore((s) => s.phase);
  const setResolution = useExportStore((s) => s.setResolution);
  const setFps = useExportStore((s) => s.setFps);
  const setCodec = useExportStore((s) => s.setCodec);
  const setFileName = useExportStore((s) => s.setFileName);
  const audioName = useSourceStore((s) => s.audio?.name ?? null);
  const desktop = isTauri();
  const busy = isBusy(phase);
  const canStart = desktop && !busy && audioName !== null;

  return (
    <Section title="ЭКСПОРТ" defaultOpen={false}>
      {desktop ? null : <p className="muted">Экспорт работает только в десктопном приложении LoopViz (Tauri).</p>}
      <OptionRow options={RESOLUTIONS} value={resolution} onChange={setResolution} disabled={busy} />
      <OptionRow options={FPS_OPTIONS.map((id) => ({ id, label: `${id} FPS` }))} value={fps} onChange={setFps} disabled={busy} />
      <OptionRow options={CODECS} value={codec} onChange={setCodec} disabled={busy} />
      <TextField
        label="ФАЙЛ"
        value={fileName || defaultOutputName(audioName ?? "loopviz", resolution, fps)}
        onChange={setFileName}
      />
      <Summary />
      {desktop && audioName === null ? <p className="muted">Для экспорта нужно аудио.</p> : null}
      <button
        type="button"
        className="file-button"
        disabled={!canStart}
        onClick={() => void startExport()}
      >
        [→] ЭКСПОРТ
      </button>
      {busy ? (
        <button type="button" className="file-button" onClick={cancelExport}>
          [×] ОТМЕНА
        </button>
      ) : null}
      <ProgressBlock />
    </Section>
  );
}
