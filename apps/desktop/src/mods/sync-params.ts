import type { ParamDescriptor, ParamSchema, ParamValue, ParamValues } from "@loopviz/mod-api";

function acceptable(value: ParamValue | undefined, descriptor: ParamDescriptor): value is ParamValue {
  if (value === undefined || typeof value !== typeof descriptor.default) return false;
  return descriptor.kind !== "select" || (typeof value === "string" && descriptor.options.includes(value));
}

/**
 * Приводит сохранённые значения к схеме мода после (пере)загрузки: недостающие параметры
 * получают default, лишние и значения другого типа отбрасываются, числа зажимаются в диапазон.
 * Возвращает тот же объект, если менять нечего.
 */
export function reconcileParams(schema: ParamSchema<ParamValues>, current: ParamValues | undefined): ParamValues {
  const next: ParamValues = {};
  for (const [key, descriptor] of Object.entries(schema)) {
    const value = current?.[key];
    if (!acceptable(value, descriptor)) {
      next[key] = descriptor.default;
    } else if (descriptor.kind === "slider" && typeof value === "number") {
      next[key] = Math.min(descriptor.max, Math.max(descriptor.min, value));
    } else {
      next[key] = value;
    }
  }
  if (current) {
    const keys = Object.keys(next);
    if (keys.length === Object.keys(current).length && keys.every((key) => current[key] === next[key])) return current;
  }
  return next;
}
