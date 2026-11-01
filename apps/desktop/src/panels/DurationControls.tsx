import { totalDuration } from "@loopviz/engine";
import { useSourceStore } from "../state/source-store";
import { Checkbox } from "../ui/Checkbox";
import { NumberField } from "../ui/NumberField";

export function DurationControls() {
  const timeline = useSourceStore((s) => s.timeline);
  const setDuration = useSourceStore((s) => s.setDuration);
  const { duration } = timeline;
  const repeats = duration.mode === "repeats" ? duration.repeats : 1;
  const seconds = duration.mode === "seconds" ? duration.seconds : totalDuration(timeline);

  return (
    <div className="duration">
      <span className="bar-title">ДЛИТЕЛЬНОСТЬ</span>
      <Checkbox
        checked={duration.mode === "repeats"}
        label="ПОВТОРЫ"
        onChange={() => setDuration({ mode: "repeats", repeats })}
      />
      <NumberField
        label="N"
        value={repeats}
        min={1}
        max={999}
        onCommit={(value) => setDuration({ mode: "repeats", repeats: Math.round(value) })}
      />
      <Checkbox
        checked={duration.mode === "seconds"}
        label="СЕКУНДЫ"
        onChange={() => setDuration({ mode: "seconds", seconds: Number(seconds.toFixed(2)) })}
      />
      <NumberField
        label="С"
        value={Number(seconds.toFixed(2))}
        min={0.1}
        max={3600}
        step={0.1}
        onCommit={(value) => setDuration({ mode: "seconds", seconds: value })}
      />
      <span className="total">ИТОГО {totalDuration(timeline).toFixed(2)} С</span>
    </div>
  );
}
