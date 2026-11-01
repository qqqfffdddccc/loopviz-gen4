import { MeshBasicMaterial, Vector2 } from "three";

export interface FeatherMaterial {
  material: MeshBasicMaterial;
  /** x: размытие верхнего края, y: нижнего, в долях высоты зоны. */
  feather: Vector2;
}

const FEATHER_FRAGMENT = /* glsl */ `
#include <map_fragment>
{
  float fromBottom = vMapUv.y;
  float fadeTop = uFeather.x > 0.0 ? 1.0 - smoothstep(1.0 - uFeather.x, 1.0, fromBottom) : 1.0;
  float fadeBottom = uFeather.y > 0.0 ? smoothstep(0.0, uFeather.y, fromBottom) : 1.0;
  diffuseColor.a *= fadeTop * fadeBottom;
}
`;

/** Материал слота: обычный MeshBasicMaterial с плавным затуханием альфы у верхнего и нижнего краёв. */
export function createFeatherMaterial(): FeatherMaterial {
  const feather = new Vector2(0, 0);
  const material = new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  material.onBeforeCompile = (shader) => {
    shader.uniforms["uFeather"] = { value: feather };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <map_pars_fragment>", "#include <map_pars_fragment>\nuniform vec2 uFeather;")
      .replace("#include <map_fragment>", FEATHER_FRAGMENT);
  };
  return { material, feather };
}
