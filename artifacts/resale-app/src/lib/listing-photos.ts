/**
 * Photo sizing for storage and for the marketplaces.
 *
 * Photos are saved inside the item record, and Vercel rejects any request over
 * 4.5 MB, so a single full-size phone photo used to make the save fail. Uploads
 * are re-encoded as JPEG on the way in, and the background remover produces the
 * square 1280 x 1280 image both Poshmark and Depop display (both crop to 1:1).
 */

/** Square listing photo size used by Poshmark and Depop. */
export const LISTING_PHOTO_EDGE = 1280;
/** Share of the square the item may fill, leaving even breathing room around it. */
const ITEM_FILL = 0.84;
/** Keep a save comfortably under Vercel's 4.5 MB request limit. */
export const SAVE_BUDGET_BYTES = 4_000_000;

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read the photo'));
    image.src = source;
  });
}

async function withObjectUrl<T>(blob: Blob, use: (url: string) => Promise<T>): Promise<T> {
  const url = URL.createObjectURL(blob);
  try { return await use(url); } finally { URL.revokeObjectURL(url); }
}

function canvasContext(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the photo');
  return { canvas, context };
}

/** Re-encodes a photo as JPEG no larger than maxEdge on its longest side. */
export async function shrinkPhoto(source: Blob | string, maxEdge = 1200, quality = 0.8): Promise<string> {
  const draw = async (url: string) => {
    const image = await loadImage(url);
    const longest = Math.max(image.naturalWidth, image.naturalHeight) || 1;
    const scale = Math.min(1, maxEdge / longest);
    const { canvas, context } = canvasContext(Math.max(1, Math.round(image.naturalWidth * scale)), Math.max(1, Math.round(image.naturalHeight * scale)));
    context.fillStyle = '#ffffff'; // JPEG has no transparency
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  };
  return typeof source === 'string' ? draw(source) : withObjectUrl(source, draw);
}

/** Bounding box of the visible (non-transparent) pixels of a cut-out. */
function visibleBounds(image: HTMLImageElement) {
  // Scan a small copy: exact pixels don't matter for framing, and full-size scans are slow.
  const probe = Math.min(1, 400 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * probe));
  const height = Math.max(1, Math.round(image.naturalHeight * probe));
  const { context } = canvasContext(width, height);
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 24) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < left || bottom < top) return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const pad = 1 / probe; // one probe pixel of slack on each side
  const x = Math.max(0, left / probe - pad);
  const y = Math.max(0, top / probe - pad);
  return {
    x, y,
    width: Math.min(image.naturalWidth - x, (right - left + 1) / probe + pad * 2),
    height: Math.min(image.naturalHeight - y, (bottom - top + 1) / probe + pad * 2),
  };
}

/**
 * Places a background-removed item, centered with even padding, on a square
 * 1280 x 1280 white or textured-slate backdrop, ready for Poshmark and Depop.
 */
export async function squareListingPhoto(foreground: Blob, style: 'white' | 'textured_slate', quality = 0.8): Promise<string> {
  return withObjectUrl(foreground, async (url) => {
    const item = await loadImage(url);
    const edge = LISTING_PHOTO_EDGE;
    const { canvas, context } = canvasContext(edge, edge);

    if (style === 'white') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, edge, edge);
    } else {
      const texture = await loadImage('/textured-slate-flatlay.png');
      // Cover the square, cropping the texture's longer side evenly.
      const scale = Math.max(edge / texture.naturalWidth, edge / texture.naturalHeight);
      const width = texture.naturalWidth * scale;
      const height = texture.naturalHeight * scale;
      context.drawImage(texture, (edge - width) / 2, (edge - height) / 2, width, height);
    }

    const bounds = visibleBounds(item);
    const scale = Math.min((edge * ITEM_FILL) / bounds.width, (edge * ITEM_FILL) / bounds.height);
    const width = bounds.width * scale;
    const height = bounds.height * scale;
    // Soft contact shadow so white items stay visible on the white backdrop.
    context.shadowColor = 'rgba(30, 24, 20, 0.28)';
    context.shadowBlur = Math.round(edge * 0.014);
    context.shadowOffsetY = Math.round(edge * 0.006);
    context.drawImage(item, bounds.x, bounds.y, bounds.width, bounds.height, (edge - width) / 2, (edge - height) / 2, width, height);
    context.shadowColor = 'transparent';
    return canvas.toDataURL('image/jpeg', quality);
  });
}

/** Size of a JSON request body in bytes. */
export function bodyBytes(body: unknown): number {
  return new Blob([JSON.stringify(body)]).size;
}
