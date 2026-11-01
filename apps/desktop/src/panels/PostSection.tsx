import { useAppStore, type GlobalPostKey } from "../state/store";
import { Section } from "../ui/Section";
import { Slider } from "../ui/Slider";

const CONTROLS: readonly { key: GlobalPostKey; label: string }[] = [
  { key: "grain", label: "ЗЕРНО" },
  { key: "vignette", label: "ВИНЬЕТКА" },
  { key: "bloomStrength", label: "СВЕЧЕНИЕ" },
  { key: "bloomRadius", label: "РАДИУС" },
];

function PostSlider({ control }: { control: (typeof CONTROLS)[number] }) {
  const value = useAppStore((s) => s.post[control.key]);
  const setPost = useAppStore((s) => s.setPost);
  return <Slider label={control.label} value={value} min={0} max={1} step={0.01} onChange={(next) => setPost(control.key, next)} />;
}

export function PostSection() {
  return (
    <Section title="ПОСТ" defaultOpen={false}>
      {CONTROLS.map((control) => (
        <PostSlider key={control.key} control={control} />
      ))}
    </Section>
  );
}
