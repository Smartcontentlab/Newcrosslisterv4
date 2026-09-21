/**
 * "Whole item" background removal for product photos.
 *
 * Why this exists: the general-purpose cutout model looks for the most eye-catching object. A white or grey
 * T-shirt lying on a light bed, or any garment whose fabric is close to the background colour, comes back as
 * just the printed graphic; the plain fabric is treated as background. That is a limit of the model, and a
 * bigger model does not change it (checked with the small, medium and full ISNet sizes).
 *
 * The fix: use the model's answer as a hint, then grow it out to the real edge of the item with GrabCut
 * (colour-based segmentation from OpenCV). If the model already got the whole item, its result is used untouched.
 *
 * Both heavy libraries are loaded on demand, so nothing here costs anything until someone taps a cutout button.
 */

type Cv = any; // opencv.js ships loose typings; the calls used below are documented in the OpenCV JS tutorials.

const WORK_SIZE = 480; // GrabCut runs on a reduced copy; the result is scaled back up.
const MAX_OUTPUT_SIDE = 2400; // marketplaces do not need more, and phones run out of memory on huge canvases.
const BORDER = 0.03; // outer strip that is assumed to be background unless the model found the item there.

let cvPromise: Promise<Cv> | null = null;

async function loadOpenCv(): Promise<Cv> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const mod: any = await import('@techstark/opencv-js');
      let cv: any = mod.default ?? mod;
      if (typeof cv === 'function') cv = cv();
      if (cv && typeof cv.then === 'function' && !cv.Mat) {
        cv = await new Promise((resolve) => cv.then((ready: any) => resolve(ready)));
      } else if (!cv.Mat) {
        await new Promise<void>((resolve) => { cv.onRuntimeInitialized = () => resolve(); });
      }
      return cv;
    })().catch((error) => { cvPromise = null; throw error; });
  }
  return cvPromise;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read the photo')); };
    image.src = url;
  });
}

function drawScaled(image: CanvasImageSource, width: number, height: number, targetWidth: number, targetHeight: number) {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is unavailable');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height, 0, 0, targetWidth, targetHeight);
  return { canvas, context };
}

const toBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the processed image'))), 'image/png'));

export type CutoutResult = { blob: Blob; grown: boolean };

/**
 * Returns the photo with everything except the item made transparent.
 * `grown` is true when the model only found part of the item and it had to be extended.
 */
export async function cutOutWholeItem(source: Blob): Promise<CutoutResult> {
  const { removeBackground } = await import('@imgly/background-removal');
  const modelBlob = await removeBackground(source, { device: 'cpu', model: 'isnet_quint8', output: { format: 'image/png' } });

  const original = await loadImage(source);
  const modelImage = await loadImage(modelBlob);
  const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(original.naturalWidth, original.naturalHeight));
  const outW = Math.max(1, Math.round(original.naturalWidth * scale));
  const outH = Math.max(1, Math.round(original.naturalHeight * scale));

  // Full-size pieces: the untouched photo and the model's transparency.
  const full = drawScaled(original, original.naturalWidth, original.naturalHeight, outW, outH);
  const photo = full.context.getImageData(0, 0, outW, outH);
  const modelFull = drawScaled(modelImage, modelImage.naturalWidth, modelImage.naturalHeight, outW, outH);
  const modelPixels = modelFull.context.getImageData(0, 0, outW, outH).data;

  const finish = async (alpha: (index: number) => number, grown: boolean): Promise<CutoutResult> => {
    for (let i = 0; i < outW * outH; i++) photo.data[i * 4 + 3] = alpha(i);
    full.context.putImageData(photo, 0, 0);
    return { blob: await toBlob(full.canvas), grown };
  };

  // Small copies for the colour segmentation.
  const work = WORK_SIZE / Math.max(outW, outH);
  const w = Math.max(8, Math.round(outW * work));
  const h = Math.max(8, Math.round(outH * work));
  const smallPhoto = drawScaled(full.canvas, outW, outH, w, h).context.getImageData(0, 0, w, h);
  const smallModel = drawScaled(modelFull.canvas, outW, outH, w, h).context.getImageData(0, 0, w, h);

  const modelSolid = new Uint8Array(w * h); // model is confident about these pixels
  const modelAny = new Uint8Array(w * h);
  let solidCount = 0;
  for (let i = 0; i < w * h; i++) {
    const a = smallModel.data[i * 4 + 3];
    if (a > 128) { modelSolid[i] = 1; solidCount++; }
    if (a > 40) modelAny[i] = 1;
  }
  const minArea = w * h * 0.002;
  if (solidCount < minArea) {
    // The model found nothing usable; do not guess.
    return finish((i) => modelPixels[i * 4 + 3], false);
  }

  const cv = await loadOpenCv();
  const rgb = new cv.Mat();
  const rgba = cv.matFromImageData(smallPhoto);
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);

  const mask = new cv.Mat(h, w, cv.CV_8UC1, new cv.Scalar(cv.GC_PR_FGD));
  const border = Math.max(2, Math.round(BORDER * Math.max(w, h)));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const onBorder = x < border || y < border || x >= w - border || y >= h - border;
      if (onBorder && !modelAny[i]) mask.data[i] = cv.GC_BGD;
    }
  }
  // Sure foreground: the model's confident pixels, pulled in a little so its fuzzy rim does not lock in background.
  const solid = cv.matFromArray(h, w, cv.CV_8UC1, Array.from(modelSolid));
  const eroded = new cv.Mat();
  cv.erode(solid, eroded, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
  const seed = cv.countNonZero(eroded) > minArea * 0.25 ? eroded : solid;
  for (let i = 0; i < w * h; i++) if (seed.data[i]) mask.data[i] = cv.GC_FGD;

  const bgModel = new cv.Mat();
  const fgModel = new cv.Mat();
  try {
    cv.grabCut(rgb, mask, new cv.Rect(0, 0, w, h), bgModel, fgModel, 5, cv.GC_INIT_WITH_MASK);
  } catch (error) {
    [rgb, rgba, mask, solid, eroded, bgModel, fgModel].forEach((mat) => mat.delete());
    return finish((i) => modelPixels[i * 4 + 3], false);
  }

  // Foreground = sure + probable foreground, tidied: drop specks, fill small holes.
  const grab = new cv.Mat(h, w, cv.CV_8UC1);
  for (let i = 0; i < w * h; i++) grab.data[i] = mask.data[i] === cv.GC_FGD || mask.data[i] === cv.GC_PR_FGD ? 255 : 0;
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
  cv.morphologyEx(grab, grab, cv.MORPH_OPEN, kernel);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(grab, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
  const tidy = cv.Mat.zeros(h, w, cv.CV_8UC1);
  let largest = 0;
  for (let c = 0; c < contours.size(); c++) largest = Math.max(largest, cv.contourArea(contours.get(c)));
  for (let c = 0; c < contours.size(); c++) {
    const parent = hierarchy.intPtr(0, c)[3];
    const area = cv.contourArea(contours.get(c));
    if (parent < 0 && area >= largest * 0.03) {
      const single = new cv.MatVector();
      single.push_back(contours.get(c));
      cv.drawContours(tidy, single, 0, new cv.Scalar(255), cv.FILLED);
      single.delete();
    }
  }
  // Big holes (a real gap between arms, a hanger loop) stay open; small ones are filled by the loop above.
  for (let c = 0; c < contours.size(); c++) {
    const parent = hierarchy.intPtr(0, c)[3];
    if (parent >= 0) {
      const area = cv.contourArea(contours.get(c));
      if (area > w * h * 0.03) {
        const single = new cv.MatVector();
        single.push_back(contours.get(c));
        cv.drawContours(tidy, single, 0, new cv.Scalar(0), cv.FILLED);
        single.delete();
      }
    }
  }

  let tidyCount = 0;
  let modelInside = 0; // summed model opacity inside the colour mask: 1 per fully kept pixel
  for (let i = 0; i < w * h; i++) {
    if (tidy.data[i]) { tidyCount++; modelInside += smallModel.data[i * 4 + 3] / 255; }
  }
  const tidyShare = tidyCount / (w * h);
  const modelCoverage = tidyCount ? modelInside / tidyCount : 1;

  // Soft, upscaled version of the colour-based mask for the final edge.
  const blurred = new cv.Mat();
  cv.GaussianBlur(tidy, blurred, new cv.Size(5, 5), 0);
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskContext = maskCanvas.getContext('2d')!;
  const maskImage = maskContext.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = blurred.data[i];
    maskImage.data[i * 4] = maskImage.data[i * 4 + 1] = maskImage.data[i * 4 + 2] = v;
    maskImage.data[i * 4 + 3] = 255;
  }
  maskContext.putImageData(maskImage, 0, 0);
  const up = drawScaled(maskCanvas, w, h, outW, outH).context.getImageData(0, 0, outW, outH).data;

  [rgb, rgba, mask, solid, eroded, bgModel, fgModel, grab, kernel, hierarchy, tidy, blurred].forEach((mat) => mat.delete());
  contours.delete();

  // The model already had (nearly) the whole item, or the colour step ran away and swallowed the frame: keep the model's result.
  if (modelCoverage >= 0.9 || tidyShare > 0.94 || tidyShare < 0.002) {
    return finish((i) => modelPixels[i * 4 + 3], false);
  }
  // Otherwise: solid where the colour step says "item", keeping the model's finer edge where it had one.
  return finish((i) => {
    const soft = Math.max(0, Math.min(255, (up[i * 4] - 128) * 3 + 128));
    return Math.max(modelPixels[i * 4 + 3], soft);
  }, true);
}
