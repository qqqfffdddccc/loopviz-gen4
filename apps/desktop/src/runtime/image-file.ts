const MAX_SIDE = 512;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось прочитать изображение"));
    image.src = url;
  });
}

/** Уменьшает картинку до MAX_SIDE и отдаёт PNG data URL: SVG при этом растеризуется, стор остаётся лёгким. */
export async function readImageAsDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const natural = Math.max(image.naturalWidth, image.naturalHeight, 1);
    const scale = Math.min(1, MAX_SIDE / natural);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D-контекст недоступен");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
