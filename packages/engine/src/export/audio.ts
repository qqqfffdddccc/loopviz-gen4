export const SEAM_CROSSFADE_SEC = 0.005;

export interface ExportAudioSource {
  channels: readonly Float32Array[];
  sampleRate: number;
  startSec: number;
  endSec: number;
  totalSec: number;
  crossfadeSec?: number;
}

export function exportSampleCount(totalSec: number, sampleRate: number): number {
  return Math.max(0, Math.round(totalSec * sampleRate));
}

/**
 * Склеивает фрагмент в дорожку длиной ровно round(totalSec * sampleRate) отсчётов.
 *
 * На стыке копий окно шириной crossfade, поровну по обе стороны от стыка, переводит продолжение
 * конца фрагмента (материал исходника за концом) в начало (материал исходника перед началом)
 * по закону равной мощности. Для этого по обе стороны фрагмента в исходнике должно хватать
 * полуокна. Если не хватает (фрагмент упирается в край файла), звук повторяется как есть:
 * замкнутый луп так и остаётся бесшовным, а выдумывать материал для кроссфейда нечем.
 */
export function buildExportAudio(source: ExportAudioSource): Float32Array[] {
  const { channels, sampleRate, totalSec } = source;
  const total = exportSampleCount(totalSec, sampleRate);
  const available = channels[0]?.length ?? 0;
  const start = Math.min(Math.max(0, Math.round(source.startSec * sampleRate)), available);
  const end = Math.min(Math.max(start, Math.round(source.endSec * sampleRate)), available);
  const length = end - start;

  if (length <= 0) return channels.map(() => new Float32Array(total));

  const half = Math.floor(Math.min(Math.round((source.crossfadeSec ?? SEAM_CROSSFADE_SEC) * sampleRate), length) / 2);
  const crossfades = half > 0 && start - half >= 0 && end + half <= available;
  return channels.map((channel) => loopChannel(channel, { start, length, total, half: crossfades ? half : 0 }));
}

interface LoopLayout {
  start: number;
  length: number;
  total: number;
  half: number;
}

function loopChannel(channel: Float32Array, { start, length, total, half }: LoopLayout): Float32Array {
  const out = new Float32Array(total);
  for (let n = 0; n < total; n++) out[n] = channel[start + (n % length)] ?? 0;
  if (half === 0) return out;

  const width = half * 2;
  for (let seam = length; seam - half < total; seam += length) {
    const from = seam - half;
    for (let n = from; n < Math.min(seam + half, total); n++) {
      const offset = n - seam;
      const tail = channel[start + length + offset] ?? 0;
      const head = channel[start + offset] ?? 0;
      const angle = ((n - from + 0.5) / width) * (Math.PI / 2);
      out[n] = tail * Math.cos(angle) + head * Math.sin(angle);
    }
  }
  return out;
}
