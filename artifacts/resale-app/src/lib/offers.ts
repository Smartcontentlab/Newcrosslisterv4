import { initialShip, takeHome } from './pricing';

export type OfferRow = {
  id: number; itemId: number | null; marketplace: 'poshmark' | 'depop'; kind: 'offer' | 'sale';
  listingUrl: string | null; listingTitle: string | null; amount: number; buyer: string | null; detail: string | null;
  status: 'open' | 'gone' | 'dismissed' | 'recorded' | 'unmatched' | 'history'; orderId: number | null;
  firstSeenAt: string; lastSeenAt: string;
};
export type OfferItem = {
  id: number; title: string; price: number; cost: number; weight: number | null; status: string; floor: number | null;
  listings: { marketplace: string; price: number; url: string | null }[];
};
export type RatedOffer = OfferRow & { net: number; profit: number | null; belowFloor: boolean; stale: boolean; best: boolean };
export type ItemOffers = { item: OfferItem | null; title: string; offers: RatedOffer[]; betterElsewhere: { site: string; extra: number } | null };

/** Offers expire after about a day on both Poshmark and Depop. */
const STALE_MS = 26 * 3600 * 1000;
const label = (site: string) => (site === 'poshmark' ? 'Poshmark' : site === 'depop' ? 'Depop' : site);

/** What the seller keeps from an offer on that site (buyer-paid shipping, the app's fee rules). */
export function netFor(site: string, amount: number, item: OfferItem | null): { net: number; profit: number | null } {
  const rows = takeHome(amount, initialShip, item?.weight ?? 1, item?.cost ?? 0);
  const row = rows.find((r) => r.platform === label(site)) ?? rows[0];
  return { net: row.net, profit: row.profit };
}

/** Open offers grouped by item, each rated by take-home, with the best one marked and a cross-site hint. */
export function groupOffers(rows: OfferRow[], items: OfferItem[], now = Date.now()): ItemOffers[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const groups = new Map<string, ItemOffers>();
  for (const row of rows) {
    if (row.kind !== 'offer' || row.status === 'dismissed') continue;
    const item = row.itemId ? byId.get(row.itemId) ?? null : null;
    if (item?.status === 'sold') continue;
    const key = item ? `i${item.id}` : `t${(row.listingTitle ?? row.listingUrl ?? row.id).toString().toLowerCase()}`;
    const group = groups.get(key) ?? { item, title: item?.title ?? row.listingTitle ?? 'Unknown listing', offers: [], betterElsewhere: null };
    const { net, profit } = netFor(row.marketplace, row.amount, item);
    const stale = row.status === 'gone' || now - new Date(row.firstSeenAt).getTime() > STALE_MS;
    group.offers.push({ ...row, net, profit, stale, best: false, belowFloor: row.marketplace === 'poshmark' && item?.floor != null && row.amount < item.floor });
    groups.set(key, group);
  }
  const out = [...groups.values()];
  for (const group of out) {
    group.offers.sort((a, b) => Number(a.stale) - Number(b.stale) || b.net - a.net);
    const live = group.offers.filter((o) => !o.stale);
    if (live.length) live[0].best = true;
    const sites = new Set(live.map((o) => o.marketplace));
    if (sites.size > 1) {
      const top = live[0];
      const bestOther = live.find((o) => o.marketplace !== top.marketplace);
      if (bestOther) group.betterElsewhere = { site: label(top.marketplace), extra: Math.round((top.net - bestOther.net) * 100) / 100 };
    }
  }
  // Items with a live offer first, then the best take-home.
  return out.sort((a, b) => Number(!a.offers.some((o) => !o.stale)) - Number(!b.offers.some((o) => !o.stale)) || (b.offers[0]?.net ?? 0) - (a.offers[0]?.net ?? 0));
}

export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export const siteLabel = label;
