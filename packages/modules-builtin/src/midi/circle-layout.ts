import type { NoteEvent } from "@loopviz/mod-api";
import { noteHeat } from "./note-math";

export const PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export type CircleOrder = "ХРОМАТИКА" | "КВИНТЫ";
export const CIRCLE_ORDERS: readonly CircleOrder[] = ["КВИНТЫ", "ХРОМАТИКА"];

export function pitchClassOf(pitch: number): number {
  return ((Math.round(pitch) % 12) + 12) % 12;
}

/** Позиция класса высоты на круге: по квинтам до идёт через соль, ре, ля и так далее. */
export function circleSlot(pitchClass: number, order: CircleOrder): number {
  return order === "КВИНТЫ" ? (pitchClass * 7) % 12 : pitchClass;
}

/** Угол в радианах, ноль наверху, по часовой стрелке в координатах холста (y вниз). */
export function circleAngle(pitchClass: number, order: CircleOrder): number {
  return -Math.PI / 2 + (circleSlot(pitchClass, order) * Math.PI * 2) / 12;
}

export function circlePoint(
  center: readonly [number, number],
  radius: number,
  pitchClass: number,
  order: CircleOrder,
): [number, number] {
  const angle = circleAngle(pitchClass, order);
  return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
}

export interface CircleVoice {
  pitchClass: number;
  pitch: number;
  velocity: number;
  heat: number;
}

/** Один голос на класс высоты: берётся самая горячая нота. Остывшие ноты отбрасываются. */
export function collectVoices(window: readonly NoteEvent[], t: number, tail: number, minHeat = 0.02): CircleVoice[] {
  const byClass = new Map<number, CircleVoice>();
  for (const note of window) {
    const heat = noteHeat(note, t, tail);
    if (heat < minHeat) continue;
    const pitchClass = pitchClassOf(note.pitch);
    const known = byClass.get(pitchClass);
    if (!known || heat > known.heat) {
      byClass.set(pitchClass, { pitchClass, pitch: note.pitch, velocity: note.velocity, heat });
    }
  }
  return [...byClass.values()];
}

/** Голоса по порядку обхода круга: так ломаная аккорда не пересекает сама себя. */
export function sortAroundCircle(voices: readonly CircleVoice[], order: CircleOrder): CircleVoice[] {
  return [...voices].sort((a, b) => circleSlot(a.pitchClass, order) - circleSlot(b.pitchClass, order));
}
