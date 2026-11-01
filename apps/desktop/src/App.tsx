import { useCallback } from "react";
import { LeftPanel } from "./panels/LeftPanel";
import { Preview } from "./panels/Preview";
import { RightPanel } from "./panels/RightPanel";
import { TransportBar } from "./panels/TransportBar";
import { importFiles } from "./runtime/importers";
import { useFileDrop } from "./ui/useFileDrop";

export function App() {
  const onFiles = useCallback((files: File[]) => void importFiles(files), []);
  const dragging = useFileDrop(onFiles);
  return (
    <div className="app">
      <LeftPanel />
      <Preview />
      <RightPanel />
      <TransportBar />
      {dragging ? <div className="drop-overlay">ОТПУСТИТЕ ФАЙЛ: WAV MP3 FLAC AIFF MID</div> : null}
    </div>
  );
}
