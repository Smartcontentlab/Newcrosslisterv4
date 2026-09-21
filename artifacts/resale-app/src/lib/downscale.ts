/**
 * Shrinks a photo for the AI reader: longest side 512 px, JPEG, small enough to send inline.
 * The hosted vision models reject large inline images, and 512 px is plenty to read a garment, a logo or a tag.
 * The original photo is never changed.
 */
export const MAX_VISION_CHARS = 150_000; // the server accepts up to 170,000

export async function photoForVision(source: string, side = 512): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Could not read one of the photos'));
    element.src = source;
  });
  const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  // JPEG has no transparency, so processed cut-outs get a white background.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.72, 0.6, 0.48, 0.36]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_VISION_CHARS) return dataUrl;
  }
  if (side > 256) return photoForVision(source, Math.round(side * 0.7));
  throw new Error('A photo is too detailed to send. Try a smaller one.');
}
