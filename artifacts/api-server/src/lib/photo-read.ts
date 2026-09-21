import { extractJsonObject, nimChat } from "./nim";

/**
 * "Read my photos": a vision model looks at the seller's product photos and proposes listing facts.
 * The seller reviews and applies them; nothing is saved automatically.
 *
 * Each photo is read in its own request and the answers are merged. That keeps it working with vision models that only
 * accept one image per request, and lets a close-up of the tag supply the brand or size the cover photo cannot show.
 */

export const PHOTO_CATEGORIES = ["Clothing", "Sneakers", "Electronics", "Accessories", "Home & Garden", "Collectibles", "Books", "Games", "Toys", "Sports", "Beauty", "Other"];

export type PhotoFacts = {
  title: string; brand: string; model: string; category: string; subcategory: string; department: string;
  color: string; secondaryColor: string; material: string; pattern: string; style: string; size: string;
  flaws: string[]; unsure: string[];
};

/** NVIDIA's hosted vision endpoints reject large inline images; the app downsizes photos to fit under this. */
export const MAX_INLINE_IMAGE_CHARS = 170_000;
export const MAX_PHOTOS_READ = 3;
export const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const STRING_FIELDS = ["title", "brand", "model", "category", "subcategory", "department", "color", "secondaryColor", "material", "pattern", "style", "size"] as const;

const SYSTEM = [
  "You look at product photos for a reseller and extract listing facts. Reply with ONE JSON object and nothing else:",
  `{"title": string, "brand": string, "model": string, "category": string, "subcategory": string, "department": string, "color": string, "secondaryColor": string, "material": string, "pattern": string, "style": string, "size": string, "flaws": string[], "unsure": string[]}`,
  "RULES: describe only what is visible. brand, model, size and material only if a label, tag, logo or stitching is legible; otherwise use an empty string and add that field name to unsure. Never guess measurements. Never claim authenticity.",
  `category must be exactly one of: ${PHOTO_CATEGORIES.join(", ")}. department is Women, Men, Kids or Unisex when clear, else empty. subcategory is a short type such as Jackets, Hoodies, Dresses, Sneakers.`,
  "title: brand (only if known) + item type + key attributes such as color, style or material, at most 80 characters, no hype words, no emoji.",
  "color is the main color name. style is 2 to 4 plain words about the look (for example: oversized, cropped, vintage wash).",
  "flaws: only defects you can actually see (stain, hole, pilling, scuff, fading, missing button). If you cannot tell, leave the array empty and add \"flaws\" to unsure.",
].join("\n");

const empty = (): PhotoFacts => ({ title: "", brand: "", model: "", category: "", subcategory: "", department: "", color: "", secondaryColor: "", material: "", pattern: "", style: "", size: "", flaws: [], unsure: [] });

const text = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 200) : "");
const list = (value: unknown) => (Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, 8) : []);

export function normalizePhotoFacts(raw: Record<string, unknown>): PhotoFacts {
  const facts = empty();
  for (const key of STRING_FIELDS) facts[key] = text(raw[key]);
  facts.title = facts.title.slice(0, 80);
  const match = PHOTO_CATEGORIES.find((category) => category.toLowerCase() === facts.category.toLowerCase());
  facts.category = match ?? "";
  facts.flaws = list(raw.flaws);
  facts.unsure = list(raw.unsure);
  return facts;
}

/** First non-empty value wins, in photo order. Flaws and unsure notes are combined. */
export function mergePhotoFacts(all: PhotoFacts[]): PhotoFacts {
  const merged = empty();
  for (const facts of all) {
    for (const key of STRING_FIELDS) if (!merged[key] && facts[key]) merged[key] = facts[key];
    merged.flaws.push(...facts.flaws);
  }
  merged.flaws = [...new Set(merged.flaws.map((flaw) => flaw.toLowerCase()))].slice(0, 8);
  // A field is only "unsure" when no photo could fill it.
  const unsure = new Set(all.flatMap((facts) => facts.unsure));
  merged.unsure = [...unsure].filter((field) => !(STRING_FIELDS as readonly string[]).includes(field) || !merged[field as (typeof STRING_FIELDS)[number]]);
  return merged;
}

async function readOne(dataUrl: string, hints: string): Promise<{ facts: PhotoFacts; model: string }> {
  const result = await nimChat({
    kind: "vision",
    maxTokens: 700,
    temperature: 0.1,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: [{ type: "text", text: `Extract the listing facts from this photo.${hints ? ` The seller already entered: ${hints}. Do not contradict them.` : ""} Reply with the JSON only.` }, { type: "image_url", image_url: { url: dataUrl } }] },
    ],
  });
  const parsed = extractJsonObject(result.text);
  if (!parsed) throw new Error(`${result.model} did not return readable facts`);
  return { facts: normalizePhotoFacts(parsed), model: result.model };
}

export async function readPhotos(photos: string[], hints: Record<string, string | undefined> = {}): Promise<{ facts: PhotoFacts; model: string; photosRead: number }> {
  const hintText = Object.entries(hints).filter(([, value]) => value && value.trim()).map(([key, value]) => `${key}: ${value!.trim()}`).join("; ");
  const settled = await Promise.allSettled(photos.slice(0, MAX_PHOTOS_READ).map((photo) => readOne(photo, hintText)));
  const good = settled.filter((entry): entry is PromiseFulfilledResult<{ facts: PhotoFacts; model: string }> => entry.status === "fulfilled").map((entry) => entry.value);
  if (good.length === 0) {
    const failure = settled.find((entry): entry is PromiseRejectedResult => entry.status === "rejected");
    throw failure?.reason instanceof Error ? failure.reason : new Error("The AI could not read the photos.");
  }
  return { facts: mergePhotoFacts(good.map((entry) => entry.facts)), model: good[0].model, photosRead: good.length };
}
