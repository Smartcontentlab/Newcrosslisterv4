/**
 * Shrinks item photos so the Chrome extension can carry them to a marketplace form.
 *
 * chrome.storage.session holds about 10 MB, and one item can hold eight 12 MB
 * originals, so photos are re-encoded as JPEG and the set is trimmed to a budget
 * before it leaves the app.
 */

const MAX_PHOTOS = 8;
const PASSES: Array<{ maxEdge: number; quality: number }> = [
  { maxEdge: 1600, quality: 0.82 },
  { maxEdge: 1280, quality: 0.72 },
  { maxEdge: 1024, quality: 0.62 },
];
const TOTAL_BUDGET_BYTES = 6_000_000;

export type PreparedPhotos = { photos: string[]; skipped: number };

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read a listing photo'));
    image.src = source;
  });
}

async function reencode(source: string, maxEdge: number, quality: number): Promise<string> {
  const image = await loadImage(source);
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight) || 1;
  const scale = Math.min(1, maxEdge / longestEdge);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the photos');
  // Cutouts can carry transparency, and JPEG has none: fill white first.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Rough decoded size of a data URL, which is what the extension's quota counts. */
function byteLength(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.ceil((base64.length * 3) / 4);
}

/**
 * Returns JPEG data URLs under the storage budget, plus how many photos were
 * dropped so the caller can say so instead of silently losing them.
 */
export async function preparePhotosForHandoff(sources: string[]): Promise<PreparedPhotos> {
  const usable = sources.filter((source) => typeof source === 'string' && source.startsWith('data:image/'));
  const considered = usable.slice(0, MAX_PHOTOS);
  let skipped = usable.length - considered.length;
  if (!considered.length) return { photos: [], skipped };

  let encoded: string[] = [];
  for (const pass of PASSES) {
    encoded = await Promise.all(considered.map((source) => reencode(source, pass.maxEdge, pass.quality)));
    if (encoded.reduce((total, photo) => total + byteLength(photo), 0) <= TOTAL_BUDGET_BYTES) break;
  }

  // Still over budget at the smallest pass: keep the earliest photos that fit.
  let running = 0;
  const kept: string[] = [];
  for (const photo of encoded) {
    const size = byteLength(photo);
    if (running + size > TOTAL_BUDGET_BYTES) { skipped += 1; continue; }
    running += size;
    kept.push(photo);
  }
  return { photos: kept, skipped };
}
