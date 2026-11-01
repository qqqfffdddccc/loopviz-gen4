/** Комплексное БПФ по основанию 2, на месте. Длина обязана быть степенью двойки. */
export class Fft {
  readonly size: number;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;
  private readonly reversed: Uint32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) throw new Error(`FFT size must be a power of two, got ${size}`);
    this.size = size;
    this.cos = new Float32Array(size / 2);
    this.sin = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = -Math.sin((2 * Math.PI * i) / size);
    }
    const bits = Math.log2(size);
    this.reversed = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.reversed[i] = r;
    }
  }

  transform(re: Float32Array, im: Float32Array): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.reversed[i] ?? 0;
      if (j > i) {
        const tr = re[i] ?? 0;
        const ti = im[i] ?? 0;
        re[i] = re[j] ?? 0;
        im[i] = im[j] ?? 0;
        re[j] = tr;
        im[j] = ti;
      }
    }
    for (let half = 1; half < n; half *= 2) {
      const step = n / (half * 2);
      for (let start = 0; start < n; start += half * 2) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step] ?? 0;
          const wi = this.sin[k * step] ?? 0;
          const a = start + k;
          const b = a + half;
          const br = re[b] ?? 0;
          const bi = im[b] ?? 0;
          const xr = br * wr - bi * wi;
          const xi = br * wi + bi * wr;
          re[b] = (re[a] ?? 0) - xr;
          im[b] = (im[a] ?? 0) - xi;
          re[a] = (re[a] ?? 0) + xr;
          im[a] = (im[a] ?? 0) + xi;
        }
      }
    }
  }
}

export function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  return w;
}
