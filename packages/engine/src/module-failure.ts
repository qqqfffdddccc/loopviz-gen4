export type FailureStage = "init" | "prepare" | "resize" | "render";

export interface ModuleFailure {
  moduleId: string;
  moduleName: string;
  stage: FailureStage;
  message: string;
}

/** Политика обработки падений модулей: общий изменяемый объект compositor, который читают все его слоты. */
export interface FailurePolicy {
  /** Экспорт выключает заглушки: упавший модуль обрывает рендер, чтобы в ролик не попал пустой слот. */
  failFast: boolean;
  onFailure: ((failure: ModuleFailure) => void) | null;
}

export class ModuleCrashError extends Error {
  constructor(readonly failure: ModuleFailure) {
    super(`Модуль «${failure.moduleName}» (${failure.moduleId}) упал на этапе ${failure.stage}: ${failure.message}`);
    this.name = "ModuleCrashError";
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}
