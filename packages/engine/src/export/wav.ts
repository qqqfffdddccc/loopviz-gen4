export type WavFormat = "pcm16" | "float32";

const HEADER_BYTES = 44;
const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/** Интерлив каналов в WAV. Каналы одной длины, для pcm16 значения прижимаются к [-1, 1]. */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number, format: WavFormat = "pcm16"): Uint8Array {
  const channelCount = channels.length;
  const frames = channels[0]?.length ?? 0;
  const bytesPerSample = format === "pcm16" ? 2 : 4;
  const dataBytes = frames * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format === "pcm16" ? FORMAT_PCM : FORMAT_FLOAT, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = HEADER_BYTES;
  for (let frame = 0; frame < frames; frame++) {
    for (const channel of channels) {
      const sample = channel[frame] ?? 0;
      if (format === "pcm16") {
        const clamped = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff), true);
      } else {
        view.setFloat32(offset, sample, true);
      }
      offset += bytesPerSample;
    }
  }
  return new Uint8Array(buffer);
}
