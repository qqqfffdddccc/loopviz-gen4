export type ParamValue = number | string | boolean;
export type ParamValues = Record<string, ParamValue>;

export interface SliderParam {
  kind: "slider";
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface ColorParam {
  kind: "color";
  label: string;
  default: string;
}

export interface SelectParam {
  kind: "select";
  label: string;
  options: readonly string[];
  default: string;
}

export interface ToggleParam {
  kind: "toggle";
  label: string;
  default: boolean;
}

export interface FontParam {
  kind: "font";
  label: string;
  default: string;
}

export interface TextParam {
  kind: "text";
  label: string;
  default: string;
}

/** Значение: data URL изображения или пустая строка. Инспектор даёт выбрать файл. */
export interface ImageParam {
  kind: "image";
  label: string;
  default: string;
}

export type ParamDescriptor = SliderParam | ColorParam | SelectParam | ToggleParam | FontParam | TextParam | ImageParam;

type DescriptorFor<V extends ParamValue> = V extends number
  ? SliderParam
  : V extends boolean
    ? ToggleParam
    : ColorParam | SelectParam | FontParam | TextParam | ImageParam;

export type ParamSchema<P extends ParamValues> = { [K in keyof P]: DescriptorFor<P[K]> };

export function defaultParams<P extends ParamValues>(schema: ParamSchema<P>): P {
  const result: ParamValues = {};
  for (const [key, descriptor] of Object.entries<ParamDescriptor>(schema)) {
    result[key] = descriptor.default;
  }
  return result as P;
}
