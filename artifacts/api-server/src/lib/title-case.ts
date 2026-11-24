/**
 * Listing titles read best with every word capitalized ("Bandier Green Leggings").
 * Used on every title the app fills in: photo reading, platform copy, title assist
 * and listing generation. Titles the seller types are left alone.
 *
 * - Every word gets a capital first letter; the rest of a lowercase word stays as is
 *   ("levi's" -> "Levi's", "high-waisted" -> "High-Waisted").
 * - A word that already has a capital after its first letter keeps its casing
 *   (brands and codes such as "J.Crew", "NWT", "iPhone").
 * - Words with digits keep their casing ("501", "32x30"), except a trailing size
 *   letter on a short code ("3t" -> "3T").
 * - Size and condition shorthand goes upper case: XS, S, M, L, XL, XXL, NWT, EUC...
 */
const UPPER_WORDS = new Set([
  "xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "2xl", "3xl", "4xl", "os",
  "nwt", "nwot", "nwob", "euc", "vgc", "guc", "y2k", "usa", "uk", "eu", "us", "ny", "nyc", "la", "diy", "ysl", "dkny", "bcbg",
]);

function capitalizePart(part: string): string {
  if (!part) return part;
  const lower = part.toLowerCase();
  if (UPPER_WORDS.has(lower)) return part.toUpperCase();
  if (/\d/.test(part)) return /^\d{1,2}[a-z]$/i.test(part) ? part.toUpperCase() : part;
  // Keep deliberate casing such as "J.Crew", "iPhone", "NWT".
  if (/[A-Z]/.test(part.slice(1))) return part;
  const first = part.search(/[a-z]/i);
  if (first < 0) return part;
  return part.slice(0, first) + part.charAt(first).toUpperCase() + part.slice(first + 1);
}

export function titleCase(title: string): string {
  return title
    .split(/(\s+)/)
    .map((word) => (/^\s+$/.test(word) ? word : word.split(/([-/])/).map((part) => (part === "-" || part === "/" ? part : capitalizePart(part))).join("")))
    .join("");
}
