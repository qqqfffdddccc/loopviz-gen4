// Пример hero-мода на WebGL. Читайте сверху вниз: так устроен любой мод.
//
// Мод это один самодостаточный ES-модуль. Импортировать пакеты нельзя (файл грузится из blob URL),
// всё нужное приходит в аргументе `api`.

/**
 * @typedef {import("../loopviz-mod-api").FrameInput} FrameInput
 * @typedef {{ size: number, softness: number, wobble: number, pulse: number, flash: number }} OrbParams
 */

/** @param {import("../loopviz-mod-api").ModApi} api */
export default function (api) {
  const { THREE, clamp } = api;

  // Фрагментный шейдер. Шум берём из api.glsl.noise (hash12, hash22, gnoise, fbm, rot2).
  // Вершинный шейдер даёт приложение: ctx.helpers.fullscreenVertex (varying vec2 vUv).
  const fragmentShader = /* glsl */ `
    varying vec2 vUv;
    uniform vec3 uInk;
    uniform vec3 uAccent;
    uniform vec3 uGlow;
    uniform float uAspect;
    uniform float uTime;
    uniform float uRadius;
    uniform float uSoft;
    uniform float uWobble;
    uniform float uFlash;
    ${api.glsl.noise}

    void main() {
      // Координаты в высотах зоны: центр в нуле, по y от -0.5 до 0.5. Картинка не зависит от разрешения.
      vec2 p = (vUv - vec2(0.5)) * vec2(uAspect, 1.0);
      float r = length(p);
      float angle = atan(p.y, p.x);

      // Край шара живёт шумом по кругу (cos/sin без шва), время берём только из кадра.
      float wobble = gnoise(vec2(cos(angle), sin(angle)) * 1.4 + vec2(uTime * 0.3, 0.0), 0.0) * 0.07 * uWobble;
      float radius = uRadius * (1.0 + wobble);

      float body = 1.0 - smoothstep(radius - uSoft, radius + uSoft, r);
      float core = exp(-pow(r / (radius * 0.6), 2.0)) * (0.55 + 0.7 * uFlash);
      float halo = exp(-max(r - radius, 0.0) / (uSoft * 2.5)) * 0.22;

      vec3 color = mix(uInk, uAccent, smoothstep(0.0, 0.9, core));
      color = mix(color, uGlow, clamp(uFlash, 0.0, 1.0) * core);

      // Вывод без премультипликации: rgb и альфа покрытия. Compositor положит слот на бумагу сам.
      float alpha = clamp(max(body * (0.5 + 0.5 * core), halo * (1.0 - body)), 0.0, 1.0);
      gl_FragColor = vec4(color, alpha);
    }
  `;

  return api.defineModule(
    {
      // id обязан совпадать с id в manifest.json. В реестре приложения он станет "mod.example-glow-orb".
      id: "example-glow-orb",
      slot: "hero",
      name: "Glow Orb",
      surface: "webgl",
      // По этой схеме инспектор сам рисует контролы, писать UI не нужно.
      params: {
        size: { kind: "slider", label: "РАЗМЕР", min: 0.1, max: 0.45, step: 0.01, default: 0.26 },
        softness: { kind: "slider", label: "МЯГКОСТЬ КРАЯ", min: 0.02, max: 0.3, step: 0.005, default: 0.09 },
        wobble: { kind: "slider", label: "ВОЛНЕНИЕ КРАЯ", min: 0, max: 1, step: 0.01, default: 0.5 },
        pulse: { kind: "slider", label: "ДЫХАНИЕ ОТ ГРОМКОСТИ", min: 0, max: 1, step: 0.01, default: 0.6 },
        flash: { kind: "slider", label: "ВСПЫШКА НА УДАРЕ", min: 0, max: 1, step: 0.01, default: 0.7 },
      },
    },
    // build вызывается на каждый новый экземпляр (превью и экспорт получают свои),
    // поэтому всё состояние держим в замыкании здесь, а не на уровне модуля.
    () => {
      let gl = null;
      let material = null;
      let aspect = 1;

      return {
        init(ctx) {
          if (ctx.surface !== "webgl") throw new Error("нужна webgl-поверхность");
          gl = ctx;
          material = new THREE.ShaderMaterial({
            vertexShader: ctx.helpers.fullscreenVertex,
            fragmentShader,
            blending: THREE.NoBlending,
            depthTest: false,
            depthWrite: false,
            uniforms: {
              uInk: { value: new THREE.Vector3() },
              uAccent: { value: new THREE.Vector3() },
              uGlow: { value: new THREE.Vector3() },
              uAspect: { value: 1 },
              uTime: { value: 0 },
              uRadius: { value: 0.26 },
              uSoft: { value: 0.09 },
              uWobble: { value: 0.5 },
              uFlash: { value: 0 },
            },
          });
        },

        resize(w, h) {
          aspect = w / Math.max(1, h);
        },

        // render должен быть чистой функцией от frame и params: никакого Date.now, Math.random и
        // накопления состояния между кадрами. Тогда превью и экспорт дают одинаковую картинку.
        /**
         * @param {FrameInput} frame
         * @param {OrbParams} params
         */
        render(frame, params) {
          if (!gl || !material) return;
          const u = material.uniforms;
          // Цвета темы приходят в линейном RGB, шейдер их так и ожидает.
          u.uInk.value.set(...frame.theme.ink);
          u.uAccent.value.set(...frame.theme.accent);
          u.uGlow.value.set(...frame.theme.accentGlow);
          u.uAspect.value = aspect;
          u.uTime.value = frame.t;
          u.uRadius.value = params.size * (1 + 0.3 * params.pulse * clamp(frame.audio.rms, 0, 1));
          u.uSoft.value = params.softness;
          u.uWobble.value = params.wobble;
          u.uFlash.value = clamp(params.flash * frame.audio.onset, 0, 1);
          gl.helpers.renderFullscreenPass(material);
        },

        // Освободите всё, что создали: материалы, текстуры, геометрию.
        dispose() {
          material?.dispose();
          material = null;
          gl = null;
        },
      };
    },
  );
}
