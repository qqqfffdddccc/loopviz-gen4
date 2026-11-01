/**
 * Выполняет текст ES-модуля через blob URL. Каждый вызов даёт новый URL, поэтому браузер
 * не берёт старую версию из кэша модулей: так работает и перезагрузка мода после правки.
 */
export async function importModuleSource(source: string): Promise<unknown> {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try {
    return await import(/* @vite-ignore */ url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
