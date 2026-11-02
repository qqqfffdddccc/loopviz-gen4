export const BEATS_PER_BAR = 4;
/** Раскладка плиток меняется каждые N долей, смещения отдельных плиток каждую долю. */
export const LAYOUT_BEATS = 2;
/** Доля доли, за которую плитка доезжает до нового смещения. */
export const JUMP_FRACTION = 0.16;

export interface CollageBeat {
  /** Номер раскладки плиток внутри петли: seed для шейдера. */
  layout: number;
  /** Индекс доли внутри петли, с которой плитки съезжают. */
  from: number;
  /** Индекс текущей доли внутри петли, к которой они приезжают. */
  to: number;
  /** 0..1: прогресс прыжка от `from` к `to`, easeOutCubic. */
  ease: number;
  /** 1 в момент удара и затухает к концу доли. */
  pulse: number;
  /** 1 на первой доле такта, меньше на остальных. */
  strength: number;
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

export function loopBeatCount(loopBars: number): number {
  return Math.max(1, Math.round(loopBars)) * BEATS_PER_BAR;
}

/**
 * Расписание перестановок плиток как чистая функция долей. Индексы свёрнуты по длине петли,
 * поэтому кадр на стыке петли совпадает с кадром на её начале: сетка тактов замкнута.
 */
export function collageBeat(beat: number, loopBars: number): CollageBeat {
  const loopBeats = loopBeatCount(loopBars);
  const whole = Math.floor(beat);
  const frac = beat - whole;
  const to = wrap(whole, loopBeats);
  const from = wrap(whole - 1, loopBeats);
  const t = Math.min(1, Math.max(0, frac / JUMP_FRACTION));
  return {
    layout: Math.floor(to / LAYOUT_BEATS),
    from,
    to,
    ease: 1 - (1 - t) ** 3,
    pulse: Math.exp(-frac * 5),
    strength: to % BEATS_PER_BAR === 0 ? 1 : 0.65,
  };
}

/** Число уровней деления раскладки по ползунку плотности 0..1: от крупных плит до мелкой мозаики. */
export function tileLevels(density: number): number {
  const d = Math.min(1, Math.max(0, density));
  return 2 + Math.round(d * 4);
}
