import {
  PARAM_KINDS,
  assertNever,
  type ModManifest,
  type ParamDescriptor,
} from "@loopviz/mod-api";

const MAX_PARAMS = 32;
const PARAM_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SURFACES: readonly unknown[] = ["webgl", "canvas2d"];
const INSTANCE_METHODS = ["init", "resize", "render", "dispose"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isParamKind(value: unknown): value is ParamDescriptor["kind"] {
  return PARAM_KINDS.some((kind) => kind === value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function checkDescriptor(key: string, descriptor: ParamDescriptor): string[] {
  const at = `params.${key}`;
  const errors: string[] = [];
  switch (descriptor.kind) {
    case "slider": {
      const { min, max, step, default: value } = descriptor;
      if (![min, max, step, value].every(isFiniteNumber)) return [`${at}: min, max, step и default слайдера должны быть числами`];
      if (min >= max) errors.push(`${at}: min должен быть меньше max`);
      if (step <= 0) errors.push(`${at}: step должен быть больше нуля`);
      if (value < min || value > max) errors.push(`${at}: default вне диапазона min..max`);
      return errors;
    }
    case "color":
      return typeof descriptor.default === "string" && HEX_COLOR.test(descriptor.default)
        ? []
        : [`${at}: default цвета должен быть вида #rrggbb`];
    case "select": {
      const { options, default: value } = descriptor;
      if (!Array.isArray(options) || options.length === 0 || !options.every((o) => typeof o === "string")) {
        return [`${at}: options должен быть непустым массивом строк`];
      }
      return options.includes(value) ? [] : [`${at}: default не входит в options`];
    }
    case "toggle":
      return typeof descriptor.default === "boolean" ? [] : [`${at}: default переключателя должен быть boolean`];
    case "font":
    case "text":
    case "image":
      return typeof descriptor.default === "string" ? [] : [`${at}: default должен быть строкой`];
    default:
      return assertNever(descriptor);
  }
}

/** Проверяет форму схемы параметров, чтобы инспектор и defaultParams не упали на мусоре из мода. */
export function validateParamSchema(schema: unknown): string[] {
  if (!isRecord(schema)) return ["params должен быть объектом"];
  const keys = Object.keys(schema);
  if (keys.length > MAX_PARAMS) return [`params: не больше ${MAX_PARAMS} параметров`];
  const errors: string[] = [];
  for (const key of keys) {
    const descriptor = schema[key];
    if (!PARAM_KEY.test(key)) {
      errors.push(`params.${key}: имя параметра должно быть латинским идентификатором`);
    } else if (!isRecord(descriptor) || !isParamKind(descriptor["kind"])) {
      errors.push(`params.${key}: неизвестный kind, допустимы ${PARAM_KINDS.join(", ")}`);
    } else if (typeof descriptor["label"] !== "string" || descriptor["label"].trim() === "") {
      errors.push(`params.${key}: label должен быть непустой строкой`);
    } else {
      errors.push(...checkDescriptor(key, descriptor as unknown as ParamDescriptor));
    }
  }
  return errors;
}

/** Проверяет определение, которое вернул default-экспорт мода. Пустой список значит «годится». */
export function validateDefinition(value: unknown, manifest: ModManifest): string[] {
  if (!isRecord(value)) return ["default-функция должна вернуть результат api.defineModule(...)"];
  const errors: string[] = [];
  if (value["id"] !== manifest.id) {
    errors.push(`id модуля «${String(value["id"])}» не совпадает с id в манифесте «${manifest.id}»`);
  }
  if (value["slot"] !== manifest.slot) {
    errors.push(`slot модуля «${String(value["slot"])}» не совпадает со slot в манифесте «${manifest.slot}»`);
  }
  if (typeof value["name"] !== "string" || value["name"].trim() === "") errors.push("name модуля должен быть непустой строкой");
  if (!SURFACES.includes(value["surface"])) errors.push("surface должен быть «webgl» или «canvas2d»");
  if (typeof value["create"] !== "function") errors.push("в определении нет create(): используйте api.defineModule");
  errors.push(...validateParamSchema(value["params"]));
  return errors;
}

/** Экземпляр проверяется при каждом create: ошибка превращается в заглушку слота, а не в падение. */
export function validateInstance(value: unknown): string[] {
  if (!isRecord(value)) return ["build() должен вернуть объект с init, resize, render и dispose"];
  return INSTANCE_METHODS.filter((method) => typeof value[method] !== "function").map(
    (method) => `в результате build() нет метода ${method}()`,
  );
}
