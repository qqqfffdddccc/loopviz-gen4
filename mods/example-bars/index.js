// Пример wave-мода на canvas2d: скруглённые столбики по frame.audio.bands (8 полос, значения 0..1).
// Модуль без состояния: каждый кадр рисуется только из frame и params.

/**
 * @typedef {import("../loopviz-mod-api").FrameInput} FrameInput
 * @typedef {{ fill: number, height: number, round: number, mirror: boolean, accent: boolean }} BarsParams
 */

/** @param {import("../loopviz-mod-api").ModApi} api */
export default function (api) {
  const { clamp, linearToCss } = api;

  // Скруглённый прямоугольник одним путём. Радиус не больше половины меньшей стороны.
  function roundedBar(ctx, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return api.defineModule(
    {
      id: "example-bars",
      slot: "wave",
      name: "Rounded Bars",
      surface: "canvas2d",
      params: {
        fill: { kind: "slider", label: "ШИРИНА СТОЛБИКА", min: 0.3, max: 0.95, step: 0.01, default: 0.62 },
        height: { kind: "slider", label: "ВЫСОТА", min: 0.2, max: 1, step: 0.01, default: 0.8 },
        round: { kind: "slider", label: "СКРУГЛЕНИЕ", min: 0, max: 1, step: 0.01, default: 1 },
        mirror: { kind: "toggle", label: "ЗЕРКАЛО", default: true },
        accent: { kind: "toggle", label: "АКЦЕНТНЫЙ ЦВЕТ", default: true },
      },
    },
    () => {
      let c2d = null;

      return {
        init(ctx) {
          if (ctx.surface !== "canvas2d") throw new Error("нужна canvas2d-поверхность");
          c2d = ctx;
        },

        // Размер холста задаёт приложение, ctx.canvas.width/height уже обновлены.
        resize() {},

        /**
         * @param {FrameInput} frame
         * @param {BarsParams} params
         */
        render(frame, params) {
          if (!c2d) return;
          const { ctx, canvas } = c2d;
          const w = canvas.width;
          const h = canvas.height;
          const bands = frame.audio.bands;
          const count = bands.length;

          // Единица масштаба: размеры не зависят от того, превью это или 4K-экспорт.
          const unit = frame.size.h / 1920;
          const margin = 32 * unit;
          const slot = (w - margin * 2) / count;
          const barWidth = slot * params.fill;
          const maxHeight = (params.mirror ? h / 2 : h) - 12 * unit;
          const baseline = params.mirror ? h / 2 : h - 6 * unit;
          const minHeight = Math.min(barWidth, 6 * unit);
          const color = params.accent ? frame.theme.accent : frame.theme.ink;

          for (let i = 0; i < count; i++) {
            // Показатель меньше 1 приподнимает тихие полосы, чтобы столбики не пропадали.
            const level = clamp(bands[i], 0, 1) ** 0.7;
            const barHeight = Math.max(minHeight, level * maxHeight * params.height);
            const x = margin + i * slot + (slot - barWidth) / 2;
            const radius = (barWidth / 2) * params.round;
            ctx.fillStyle = linearToCss(color, 0.35 + 0.6 * level);
            if (params.mirror) {
              roundedBar(ctx, x, baseline - barHeight, barWidth, barHeight * 2, radius);
            } else {
              roundedBar(ctx, x, baseline - barHeight, barWidth, barHeight, radius);
            }
            ctx.fill();
          }
        },

        dispose() {
          c2d = null;
        },
      };
    },
  );
}
