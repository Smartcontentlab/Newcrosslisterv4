/** Pure helpers for the Offers & Sales inbox: tie what the extension read to the seller's items. */

/** The marketplace's own id for a listing, from its link: Poshmark ".../listing/Name-<id>", Depop ".../products/<slug>/". */
export function listingKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const posh = /\/listing\/[^/?#]*-([0-9a-f]{16,})/i.exec(url);
  if (posh) return posh[1].toLowerCase();
  const depop = /\/products\/([^/?#]+)/i.exec(url);
  if (depop) return depop[1].toLowerCase();
  return null;
}

const words = (text: string) => new Set(text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1));
/** Share of the shorter title's words found in the other title (0..1). */
export function titleMatch(a: string, b: string): number {
  const wa = words(a); const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  const [small, big] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  let hit = 0; for (const w of small) if (big.has(w)) hit += 1;
  return hit / small.size;
}

/** Rough marketplace fees on a sale, for the order's profit (same rules as the app's take-home maths). */
export function estimateFees(marketplace: string, amount: number): number {
  if (marketplace === "poshmark") return Math.round((amount < 15 ? 2.95 : amount * 0.2) * 100) / 100;
  if (marketplace === "depop") return Math.round((amount * 0.033 + 0.45) * 100) / 100;
  return Math.round(amount * 0.1 * 100) / 100;
}
