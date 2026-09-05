export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// crop: { xPct, yPct, wPct, hPct } all 0..1, relative to the source image
export async function cropImage(dataUrl, crop) {
  const img = await loadImage(dataUrl);
  const sx = crop.xPct * img.width;
  const sy = crop.yPct * img.height;
  const sw = crop.wPct * img.width;
  const sh = crop.hPct * img.height;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
