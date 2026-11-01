import { fragmentBars, fragmentLength, secondsPerBar } from "@loopviz/engine";
import { transport } from "../runtime/transport";
import { useSourceStore } from "../state/source-store";
import { Checkbox } from "../ui/Checkbox";
import { DurationControls } from "./DurationControls";
import { WaveformCanvas } from "./WaveformCanvas";

function TransportButtons() {
  const playing = useSourceStore((s) => s.playing);
  return (
    <div className="transport-buttons">
      <button type="button" onClick={() => (playing ? transport.pause() : void transport.play())}>
        {playing ? "[❚❚] ПАУЗА" : "[▶] ПУСК"}
      </button>
      <button type="button" onClick={() => transport.stop()}>
        [■] СТОП
      </button>
    </div>
  );
}

function FragmentInfo() {
  const timeline = useSourceStore((s) => s.timeline);
  const { startSec, endSec } = timeline.fragment;
  const bar = secondsPerBar(timeline);
  return (
    <p className="fragment-info">
      <span>НАЧАЛО {startSec.toFixed(2)} С (ТАКТ {(startSec / bar + 1).toFixed(2)})</span>
      <span>КОНЕЦ {endSec.toFixed(2)} С (ТАКТ {(endSec / bar + 1).toFixed(2)})</span>
      <span>
        ДЛИНА {fragmentBars(timeline).toFixed(2)} ТАКТА · {fragmentLength(timeline).toFixed(2)} С
      </span>
    </p>
  );
}

export function TransportBar() {
  const snap = useSourceStore((s) => s.timeline.snapToBars);
  const setSnap = useSourceStore((s) => s.setSnap);
  return (
    <footer className="transport" aria-label="Транспорт">
      <div className="transport-row">
        <TransportButtons />
        <Checkbox checked={snap} label="ПРИЛИПАНИЕ К ТАКТАМ" onChange={setSnap} />
        <DurationControls />
      </div>
      <WaveformCanvas />
      <FragmentInfo />
    </footer>
  );
}
