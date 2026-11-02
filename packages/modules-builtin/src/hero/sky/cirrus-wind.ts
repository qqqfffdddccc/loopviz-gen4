import { extractOnsets } from "../ring-schedule";

/**
 * Дрейф перистых облаков как чистая функция времени исходника. Огибающая громкости и порывы по онсетам
 * один раз интегрируются по сетке пиков файла, затем кадр берёт значение интерполяцией: порядок вызовов не важен.
 */
export interface WindTrack {
  perSec: number;
  /** Интеграл нормированной огибающей громкости, в «секундах ветра». */
  env: Float32Array;
  /** Интеграл затухающих порывов после онсетов. */
  gust: Float32Array;
}

const SMOOTH_SEC = 0.5;
const ENV_CEIL = 3;
const GUST_DECAY_SEC = 0.7;
const GUST_GAIN = 4;
const GUST_SENSITIVITY = 0.5;
const MIN_POINTS = 8;

export function buildWindTrack(peaks: Float32Array, durationSec: number): WindTrack | null {
  const count = Math.floor(peaks.length / 2);
  if (count < MIN_POINTS || !(durationSec > 0)) return null;
  const perSec = count / durationSec;
  const dt = 1 / perSec;

  const raw = new Float32Array(count);
  const prefix = new Float64Array(count + 1);
  for (let i = 0; i < count; i++) {
    raw[i] = Math.max(Math.abs(peaks[2 * i] ?? 0), Math.abs(peaks[2 * i + 1] ?? 0));
    prefix[i + 1] = (prefix[i] ?? 0) + (raw[i] ?? 0);
  }

  const half = Math.max(1, Math.round((SMOOTH_SEC * perSec) / 2));
  const smooth = new Float32Array(count);
  let total = 0;
  for (let i = 0; i < count; i++) {
    const from = Math.max(0, i - half);
    const to = Math.min(count, i + half + 1);
    smooth[i] = ((prefix[to] ?? 0) - (prefix[from] ?? 0)) / (to - from);
    total += smooth[i] ?? 0;
  }
  const mean = total / count;

  const env = new Float32Array(count);
  let acc = 0;
  for (let i = 0; i < count; i++) {
    const level = mean > 1e-4 ? Math.min(ENV_CEIL, (smooth[i] ?? 0) / mean) : 1;
    env[i] = acc;
    acc += level * dt;
  }

  const impulses = new Float32Array(count);
  for (const onset of extractOnsets(peaks, durationSec, GUST_SENSITIVITY)) {
    const index = Math.min(count - 1, Math.max(0, Math.round(onset.time * perSec)));
    impulses[index] = (impulses[index] ?? 0) + onset.strength;
  }
  const decay = Math.exp(-dt / GUST_DECAY_SEC);
  const gust = new Float32Array(count);
  let speed = 0;
  acc = 0;
  for (let i = 0; i < count; i++) {
    speed = speed * decay + (impulses[i] ?? 0);
    gust[i] = acc;
    acc += speed * GUST_GAIN * dt;
  }

  return { perSec, env, gust };
}

function sample(curve: Float32Array, perSec: number, t: number, tailRate: number): number {
  const last = curve.length - 1;
  const x = t * perSec;
  if (x >= last) return (curve[last] ?? 0) + (t - last / perSec) * tailRate;
  const i = Math.floor(x);
  const a = curve[i] ?? 0;
  const b = curve[i + 1] ?? a;
  return a + (b - a) * (x - i);
}

/**
 * Смещение поля в секундах ветра. reaction 0 даёт ровный дрейф t, 1 полностью следует громкости.
 * Скорость остаётся неотрицательной при reaction в 0..1, поэтому облака не откатываются назад.
 */
export function windDrift(track: WindTrack | null, sourceT: number, reaction: number, gustAmount: number): number {
  const t = Math.max(0, sourceT);
  if (!track) return t;
  const k = Math.min(1, Math.max(0, reaction));
  const env = sample(track.env, track.perSec, t, 1);
  const gust = sample(track.gust, track.perSec, t, 0);
  return t + k * (env - t) + Math.max(0, gustAmount) * gust;
}
