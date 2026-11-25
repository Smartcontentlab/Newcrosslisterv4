import { extractJsonObject, nimChat } from "./nim";

/**
 * Sorts listing photos by what they show, so the cover is the best full front view
 * (not a tag, label or close-up) and the tag photos can be read for brand and size.
 */

export const PHOTO_VIEWS = ["front", "back", "side", "flat_lay", "worn", "tag", "label", "detail", "flaw", "measurement", "other"] as const;
export type PhotoView = (typeof PHOTO_VIEWS)[number];
export type PhotoRole = { view: PhotoView; wholeItem: boolean; quality: number; cover: number };

const SYSTEM = [
  "You sort a reseller's product photos. Reply with ONE JSON object and nothing else:",
  '{"view": string, "whole_item": boolean, "quality": number}',
  `view is one of: ${PHOTO_VIEWS.join(", ")}. front = the front of the whole item; flat_lay = the whole item laid flat from above; worn = on a person or mannequin;`,
  "tag = a brand, size or care tag; label = a printed waistband or inside label; detail = a close-up of a feature; flaw = a close-up of damage; measurement = a tape measure.",
  "whole_item is true only when the entire item is in the frame.",
  "quality is 0 to 10: how good this photo is as the main listing photo (in focus, well lit, centred, uncluttered).",
].join("\n");

const COVER_BONUS: Partial<Record<PhotoView, number>> = { front: 6, flat_lay: 5, worn: 5, back: 1, side: 1 };
const NOT_A_COVER = new Set<PhotoView>(["tag", "label", "detail", "flaw", "measurement"]);

/** Higher is a better cover. Tags, labels and close-ups never win over a whole-item photo. */
export function coverScore(view: PhotoView, wholeItem: boolean, quality: number): number {
  if (NOT_A_COVER.has(view)) return quality / 10 - 10;
  return (COVER_BONUS[view] ?? 0) + (wholeItem ? 4 : 0) + Math.max(0, Math.min(10, quality)) / 2;
}

export function normalizeRole(raw: Record<string, unknown>): PhotoRole {
  const view = (PHOTO_VIEWS as readonly string[]).includes(String(raw.view)) ? (raw.view as PhotoView) : "other";
  const wholeItem = raw.whole_item === true || raw.whole_item === "true";
  const quality = Number.isFinite(Number(raw.quality)) ? Number(raw.quality) : 5;
  return { view, wholeItem, quality, cover: coverScore(view, wholeItem, quality) };
}

async function classifyOne(dataUrl: string): Promise<PhotoRole> {
  const result = await nimChat({
    kind: "vision", maxTokens: 120, temperature: 0,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: [{ type: "text", text: "Classify this photo. Reply with the JSON only." }, { type: "image_url", image_url: { url: dataUrl } }] },
    ],
  });
  const parsed = extractJsonObject(result.text);
  if (!parsed) throw new Error("unreadable answer");
  return normalizeRole(parsed);
}

/** One role per photo, in order; null where the AI could not answer (that photo keeps its place). */
export async function classifyPhotos(photos: string[]): Promise<Array<PhotoRole | null>> {
  const settled = await Promise.allSettled(photos.map(classifyOne));
  return settled.map((entry) => (entry.status === "fulfilled" ? entry.value : null));
}
