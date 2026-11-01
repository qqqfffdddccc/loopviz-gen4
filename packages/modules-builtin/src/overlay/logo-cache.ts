interface LogoEntry {
  src: string;
  bitmap: ImageBitmap | null;
  loading: Promise<void> | null;
}

let entry: LogoEntry | null = null;

async function decode(src: string): Promise<ImageBitmap> {
  const response = await fetch(src);
  return createImageBitmap(await response.blob());
}

/** Один логотип на процесс: новый src вытесняет старый. Превью и экспорт делят растр. */
export function loadLogo(src: string): Promise<void> {
  if (!src) return Promise.resolve();
  if (entry?.src === src) return entry.loading ?? Promise.resolve();
  entry?.bitmap?.close();
  const next: LogoEntry = { src, bitmap: null, loading: null };
  next.loading = decode(src)
    .then((bitmap) => {
      if (entry === next) next.bitmap = bitmap;
      else bitmap.close();
    })
    .catch(() => undefined)
    .finally(() => {
      next.loading = null;
    });
  entry = next;
  return next.loading;
}

/** Растр, если он уже готов. Иначе запускает загрузку и отдаёт null. */
export function getLogo(src: string): ImageBitmap | null {
  if (!src) return null;
  if (entry?.src !== src) void loadLogo(src);
  return entry?.src === src ? entry.bitmap : null;
}
