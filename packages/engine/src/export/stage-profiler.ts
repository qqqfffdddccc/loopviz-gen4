export interface StageTotal {
  stage: string;
  ms: number;
}

/**
 * Накопитель времени по стадиям кадра. `lap(stage)` относит время с прошлой отметки к стадии,
 * поэтому не нужны замыкания и аллокации. Выключенный профайлер тратит на вызов одну проверку.
 * Время считается по CPU: стадия, после которой JS ждёт GPU (чтение пикселей), забирает и работу GPU.
 */
export class StageProfiler {
  private readonly totals = new Map<string, number>();
  private last = 0;
  frames = 0;

  constructor(
    readonly enabled = false,
    private readonly now: () => number = () => performance.now(),
  ) {}

  start(): void {
    if (this.enabled) this.last = this.now();
  }

  lap(stage: string): void {
    if (!this.enabled) return;
    const t = this.now();
    this.add(stage, t - this.last);
    this.last = t;
  }

  add(stage: string, ms: number): void {
    if (this.enabled) this.totals.set(stage, (this.totals.get(stage) ?? 0) + ms);
  }

  summary(): StageTotal[] {
    return [...this.totals.entries()].map(([stage, ms]) => ({ stage, ms }));
  }

  /** Строки для лога автотеста: суммарные секунды и среднее на кадр по каждой стадии. */
  report(): string[] {
    const frames = Math.max(1, this.frames);
    const sum = this.summary();
    const total = sum.reduce((acc, item) => acc + item.ms, 0);
    return sum.map(({ stage, ms }) => {
      const share = total > 0 ? (100 * ms) / total : 0;
      return `${stage.padEnd(14)} ${(ms / 1000).toFixed(2).padStart(7)} с  ${(ms / frames).toFixed(2).padStart(7)} мс/кадр  ${share.toFixed(0).padStart(3)}%`;
    });
  }
}

export const NO_PROFILER = new StageProfiler(false);
