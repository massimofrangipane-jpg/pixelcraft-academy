const SIZE = 224;

export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function rasterizeSquare(source, sw, sh, size = SIZE) {
  const out = makeCanvas(size, size);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#f3ede0";
  ctx.fillRect(0, 0, size, size);
  if (!sw || !sh) return out;
  const side = Math.min(sw, sh);
  const sx = (sw - side) / 2;
  const sy = (sh - side) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  return out;
}

/* Ritaglia l'area scelta dal bambino e la riporta a 224x224.
   E' il gesto che insegna che l'inquadratura fa parte del dato. */
export function cropToSquare(source, x, y, w, h, size = 224) {
  const out = makeCanvas(size, size);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  const side = Math.max(w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const sx = Math.max(0, Math.min(source.width - side, cx - side / 2));
  const sy = Math.max(0, Math.min(source.height - side, cy - side / 2));
  ctx.drawImage(source, sx, sy, Math.min(side, source.width), Math.min(side, source.height), 0, 0, size, size);
  return out;
}

export function toJpeg(canvas, quality = 0.82) {
  return canvas.toDataURL("image/jpeg", quality);
}

/* Le miniature si vedono a ~40 px: salvarle a 224 px riempiva localStorage
   dieci volte piu' del necessario. */
export function toThumb(canvas, size = 88, quality = 0.7) {
  const out = makeCanvas(size, size);
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, size, size);
  return out.toDataURL("image/jpeg", quality);
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

export async function fileToSquare(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return rasterizeSquare(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function videoToSquare(video) {
  return rasterizeSquare(video, video.videoWidth, video.videoHeight);
}

export function canvasToSquare(canvas) {
  return rasterizeSquare(canvas, canvas.width, canvas.height);
}
