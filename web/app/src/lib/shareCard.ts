import markSvg from '@/assets/logo-mark.svg?raw';
import { sizedArtwork } from './artwork';

/**
 * Story-sized share images (1080 × 1920): a song, or a listening summary, on
 * Etify's purple, with the mark. Drawn on a canvas; the artwork is fetched
 * with CORS so the canvas can still be exported, and left out if the image
 * host won't allow that.
 */

const W = 1080;
const H = 1920;
const FONT = '"DM Sans", system-ui, sans-serif';
const markPath = new Path2D(/\sd="([^"]+)"/.exec(markSvg)?.[1] ?? '');

async function loadImage(url: string | null): Promise<ImageBitmap | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' });
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
}

function background(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createLinearGradient(0, 0, W * 0.4, H);
  gradient.addColorStop(0, '#b8a2ff');
  gradient.addColorStop(0.55, '#7c5ce0');
  gradient.addColorStop(1, '#1b1036');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.arc(W * 0.9, H * 0.08, 360, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W * 0.05, H * 0.95, 300, 0, Math.PI * 2);
  ctx.fill();
}

function brand(ctx: CanvasRenderingContext2D, caption: string) {
  // The mark at 88px tall, then the name, at the foot of the card.
  const scale = 88 / 484;
  const y = H - 190;
  ctx.save();
  ctx.translate(W / 2 - 200, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fill(markPath);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 76px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Etify', W / 2 - 60, y + 46);
  ctx.textAlign = 'center';
  ctx.font = `500 36px ${FONT}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(caption, W / 2, H - 60);
  ctx.globalAlpha = 1;
}

/** Text cut to fit [maxWidth], with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function roundedImage(ctx: CanvasRenderingContext2D, image: ImageBitmap | null, x: number, y: number, size: number, radius: number) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, radius);
  ctx.fillStyle = '#2a1a5e';
  ctx.fill();
  ctx.restore();
  if (!image) return;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, radius);
  ctx.clip();
  // Cover: the middle square of a wide thumbnail.
  const side = Math.min(image.width, image.height);
  ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, x, y, size, size);
  ctx.restore();
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = W;
  element.height = H;
  return [element, element.getContext('2d')!];
}

const toBlob = (element: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => element.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No image'))), 'image/png'));

export async function songCard({ title, artist, artwork, caption }: { title: string; artist: string; artwork: string | null; caption: string }): Promise<Blob> {
  await document.fonts.ready;
  const [element, ctx] = canvas();
  background(ctx);
  const image = await loadImage(artwork ? sizedArtwork(artwork, 800) : null);
  const size = 820;
  roundedImage(ctx, image, (W - size) / 2, 300, size, 48);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 72px ${FONT}`;
  ctx.fillText(fit(ctx, title, W - 160), W / 2, 1260);
  ctx.font = `500 46px ${FONT}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(fit(ctx, artist, W - 160), W / 2, 1340);
  ctx.globalAlpha = 1;
  brand(ctx, caption);
  return toBlob(element);
}

export async function statsCard({
  heading,
  minutesLabel,
  minutes,
  topTitle,
  top,
  artwork,
  caption,
}: {
  heading: string;
  minutesLabel: string;
  minutes: number;
  topTitle: string;
  top: string[];
  artwork: string | null;
  caption: string;
}): Promise<Blob> {
  await document.fonts.ready;
  const [element, ctx] = canvas();
  background(ctx);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText(fit(ctx, heading, W - 160), W / 2, 220);
  const image = await loadImage(artwork ? sizedArtwork(artwork, 500) : null);
  roundedImage(ctx, image, (W - 480) / 2, 300, 480, 40);
  ctx.font = `800 150px ${FONT}`;
  ctx.fillText(minutes.toLocaleString(), W / 2, 960);
  ctx.font = `500 44px ${FONT}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(minutesLabel, W / 2, 1030);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText(topTitle, 140, 1170);
  ctx.font = `500 44px ${FONT}`;
  top.slice(0, 5).forEach((line, i) => {
    ctx.globalAlpha = 0.95;
    ctx.fillText(fit(ctx, `${i + 1}.  ${line}`, W - 280), 140, 1250 + i * 72);
  });
  ctx.globalAlpha = 1;
  brand(ctx, caption);
  return toBlob(element);
}

/** Shares the image where the browser can (phones, Windows, macOS), else downloads it. */
export async function shareImage(blob: Blob, name: string, text?: string): Promise<void> {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
