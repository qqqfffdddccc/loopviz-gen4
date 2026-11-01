/**
 * Отдаёт управление циклу событий через MessageChannel. В отличие от setTimeout и requestAnimationFrame
 * его не душат в фоновом окне и не растягивают до 4 мс, а WebGL обновляет статус fence между задачами.
 */
export class Yielder {
  private readonly channel = new MessageChannel();
  private readonly waiting: (() => void)[] = [];

  constructor() {
    this.channel.port1.onmessage = () => {
      this.waiting.shift()?.();
    };
  }

  turn(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
      this.channel.port2.postMessage(null);
    });
  }

  close(): void {
    this.channel.port1.close();
    this.channel.port2.close();
  }
}
