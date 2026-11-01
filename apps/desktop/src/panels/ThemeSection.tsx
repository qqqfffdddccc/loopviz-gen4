import { useId, useMemo } from "react";
import { buildTheme, hexToOklch, linearToHex, matchPreset, oklchToHex, THEME_PRESETS } from "@loopviz/engine";
import { useAppStore } from "../state/store";
import { Checkbox } from "../ui/Checkbox";
import { Section } from "../ui/Section";
import { Slider } from "../ui/Slider";

const HUE_STEPS = 12;
const HUE_TRACK = `linear-gradient(to right, ${Array.from(
  { length: HUE_STEPS + 1 },
  (_, i) => `oklch(0.75 0.13 ${(i * 360) / HUE_STEPS})`,
).join(", ")})`;

const SWATCH_LABELS = ["ФОН", "ЧЕРНИЛА", "АКЦЕНТ", "ОРЕОЛ"] as const;

function Swatches() {
  const settings = useAppStore((s) => s.theme);
  const colors = useMemo(() => {
    const theme = buildTheme(settings);
    return [theme.bg, theme.ink, theme.accent, theme.accentGlow].map(linearToHex);
  }, [settings]);
  return (
    <ul className="swatches" aria-label="Палитра">
      {colors.map((hex, i) => (
        <li key={SWATCH_LABELS[i]} className="swatch" title={`${SWATCH_LABELS[i]} ${hex}`}>
          <span className="swatch-chip" style={{ background: hex }} />
          <span className="swatch-label">{SWATCH_LABELS[i]}</span>
        </li>
      ))}
    </ul>
  );
}

function HexPicker() {
  const id = useId();
  const accent = useAppStore((s) => s.theme.accent);
  const setAccent = useAppStore((s) => s.setAccent);
  const hex = oklchToHex(accent);
  return (
    <div className="field color-field">
      <label htmlFor={id}>ПИПЕТКА</label>
      <output htmlFor={id}>{hex.toUpperCase()}</output>
      <input
        id={id}
        type="color"
        value={hex}
        onChange={(event) => {
          const next = hexToOklch(event.target.value);
          if (next) setAccent(next);
        }}
      />
    </div>
  );
}

export function ThemeSection() {
  const theme = useAppStore((s) => s.theme);
  const setThemePreset = useAppStore((s) => s.setThemePreset);
  const setAccent = useAppStore((s) => s.setAccent);
  const setPaperTint = useAppStore((s) => s.setPaperTint);
  const setThemeGlow = useAppStore((s) => s.setThemeGlow);
  const activeId = matchPreset(theme)?.id ?? null;
  return (
    <Section title="ЦВЕТ">
      <div className="preset-list">
        {THEME_PRESETS.map((preset) => (
          <Checkbox key={preset.id} checked={preset.id === activeId} label={preset.name} onChange={() => setThemePreset(preset.id)} />
        ))}
      </div>
      <Slider label="L" value={theme.accent.l} min={0.3} max={0.95} step={0.005} onChange={(l) => setAccent({ l })} />
      <Slider label="C" value={theme.accent.c} min={0} max={0.3} step={0.002} onChange={(c) => setAccent({ c })} />
      <Slider label="H" value={theme.accent.h} min={0} max={360} step={1} format={(h) => `${Math.round(h)}°`} track={HUE_TRACK} onChange={(h) => setAccent({ h })} />
      <HexPicker />
      <Slider label="БУМАГА" value={theme.paperTint} min={0} max={1} step={0.01} onChange={setPaperTint} />
      <Slider label="СВЕЧЕНИЕ" value={theme.glow} min={0} max={1} step={0.01} onChange={setThemeGlow} />
      <Swatches />
    </Section>
  );
}
