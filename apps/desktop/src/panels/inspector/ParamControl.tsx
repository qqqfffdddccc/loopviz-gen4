import { BUNDLED_FONTS, assertNever, type ParamDescriptor, type ParamValue, type SlotKind } from "@loopviz/mod-api";
import { useAppStore } from "../../state/store";
import { Checkbox } from "../../ui/Checkbox";
import { ColorField } from "../../ui/ColorField";
import { decimalsOf } from "../../ui/format";
import { ImageField } from "../../ui/ImageField";
import { SelectField } from "../../ui/SelectField";
import { Slider } from "../../ui/Slider";
import { TextField } from "../../ui/TextField";

interface ParamControlProps {
  slot: SlotKind;
  moduleId: string;
  name: string;
  descriptor: ParamDescriptor;
}

function asNumber(value: ParamValue | undefined, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function asString(value: ParamValue | undefined, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: ParamValue | undefined, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Каждый контрол подписан на своё значение, поэтому ввод в один параметр не перерисовывает остальные. */
export function ParamControl({ slot, moduleId, name, descriptor }: ParamControlProps) {
  const value = useAppStore((s) => s.moduleParams[slot][moduleId]?.[name]);
  const setParam = useAppStore((s) => s.setParam);
  const set = (next: ParamValue): void => setParam(slot, name, next);

  switch (descriptor.kind) {
    case "slider":
      return (
        <Slider
          label={descriptor.label}
          value={asNumber(value, descriptor.default)}
          min={descriptor.min}
          max={descriptor.max}
          step={descriptor.step}
          format={(v) => v.toFixed(decimalsOf(descriptor.step))}
          onChange={set}
        />
      );
    case "color":
      return <ColorField label={descriptor.label} value={asString(value, descriptor.default)} onChange={set} />;
    case "select":
      return <SelectField label={descriptor.label} value={asString(value, descriptor.default)} options={descriptor.options} onChange={set} />;
    case "toggle":
      return <Checkbox checked={asBoolean(value, descriptor.default)} label={descriptor.label} onChange={set} />;
    case "font":
      return <SelectField label={descriptor.label} value={asString(value, descriptor.default)} options={BUNDLED_FONTS} onChange={set} />;
    case "text":
      return <TextField label={descriptor.label} value={asString(value, descriptor.default)} onChange={set} />;
    case "image":
      return <ImageField label={descriptor.label} value={asString(value, descriptor.default)} onChange={set} />;
    default:
      return assertNever(descriptor);
  }
}
