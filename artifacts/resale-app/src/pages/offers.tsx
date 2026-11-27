import { PageHeader } from '@/components/PageHeader';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, BadgeDollarSign, EyeOff, Info, PackageCheck, RefreshCw, TriangleAlert } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/supabase';
import { ago, groupOffers, siteLabel, type OfferItem, type OfferRow } from '@/lib/offers';

type InboxData = { offers: OfferRow[]; items: OfferItem[]; lastRead: Record<string, string> };
type PickItem = { id: number; title: string; status: string };
type DelistTask = { id: number; itemTitle: string; marketplace: string; status: string; listingUrl: string | null; soldOn: string | null; soldFor: number | null; createdAt: string };

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const OFFER_PAGES: Record<string, string> = { poshmark: 'https://poshmark.com/offers/my_offers', depop: 'https://www.depop.com/sellinghub/offers/' };
const chip = 'rounded-none border px-2.5 py-1 font-semibold text-[0.6rem] uppercase tracking-wider';

function SitePill({ site }: { site: string }) {
  return <span className={`${chip} border-border bg-accent-tint text-foreground`}>{siteLabel(site)}</span>;
}

export default function Offers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [picks, setPicks] = useState<Record<number, string>>({});

  const query = useQuery({
    queryKey: ['offers', 'inbox'],
    queryFn: async () => {
      const response = await apiFetch('/api/offers');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load offers');
      return data as InboxData;
    },
    refetchInterval: 5 * 60 * 1000,
  });
  const rows = query.data?.offers ?? [];
  const unmatchedSales = rows.filter((r) => r.kind === 'sale' && r.status === 'unmatched');
  const recordedSales = rows.filter((r) => r.kind === 'sale' && r.status === 'recorded');
  const groups = useMemo(() => groupOffers(rows, query.data?.items ?? []), [rows, query.data?.items]);
  const liveCount = groups.reduce((n, g) => n + g.offers.filter((o) => !o.stale).length, 0);

  const delistQuery = useQuery({
    queryKey: ['offers', 'delists'],
    queryFn: async () => {
      const response = await apiFetch('/api/workflow/delisting-tasks');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load delist tasks');
      return (data as DelistTask[]).filter((t) => ['pending', 'in_progress', 'failed'].includes(t.status));
    },
    refetchInterval: 5 * 60 * 1000,
  });
  const delists = delistQuery.data ?? [];

  const itemsQuery = useQuery({
    queryKey: ['offers', 'pick-items'],
    enabled: unmatchedSales.length > 0,
    queryFn: async () => {
      const response = await apiFetch('/api/items');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load items');
      return (data as PickItem[]).filter((i) => i.status !== 'sold').map((i) => ({ id: i.id, title: i.title, status: i.status }));
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['offers'] });
  const act = async (path: string, body: unknown, done: string) => {
    setBusy(true);
    try {
      const response = await apiFetch(path, { method: path.endsWith('/item') ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save');
      await refresh();
      toast({ title: done });
    } catch (error) { toast({ title: 'Not saved', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' }); } finally { setBusy(false); }
  };

  if (query.isLoading) return <div className="h-64 animate-pulse rounded-none border border-border bg-muted" />;
  if (query.isError) return <div className="rounded-none border border-destructive bg-destructive/10 p-6 text-sm text-destructive">{query.error instanceof Error ? query.error.message : 'Could not load offers.'}</div>;

  const lastRead = query.data?.lastRead ?? {};
  const readLine = ['poshmark', 'depop'].map((s) => `${siteLabel(s)} ${lastRead[s] ? `checked ${ago(lastRead[s])}` : 'not checked yet'}`).join(' · ');

  return <div className="space-y-6">
    <PageHeader
      label="Sales / offers"
      title="Offers & sales"
      badge={delists.length ? `${delists.length} to delist` : liveCount ? `${liveCount} open` : undefined}
      description="Offers from Poshmark and Depop side by side, ranked by what you'd actually keep after fees. Accept or counter on the marketplace; this page never answers for you."
      actions={<button type="button" onClick={() => void refresh()} className="inline-flex h-[42px] items-center justify-center gap-2 border-2 border-foreground bg-card px-[18px] text-xs font-extrabold uppercase tracking-[0.05em] text-foreground transition-[background-color,transform] duration-150 hover:bg-muted active:scale-95"><RefreshCw size={16} />Refresh</button>}
    />
    <p className="text-xs text-muted-foreground">{readLine}. The Chrome extension checks every few hours; press <span className="font-semibold text-foreground">Check now</span> in its side panel for a fresh read.</p>

    {delists.length > 0 && <section className="cx-panel rounded-none border-destructive">
      <div className="border-b border-border bg-destructive/10 p-5 sm:p-6"><p className="cx-eyebrow text-destructive">Delist now</p><h2 className="mt-2 text-lg font-semibold">{delists.length} sold item{delists.length === 1 ? ' is' : 's are'} still listed somewhere else</h2><p className="mt-2 text-sm text-muted-foreground">Open each listing, delete it or mark it Not For Sale, then confirm here. The Chrome extension also checks these listings and confirms them for you once they're gone.</p></div>
      <div className="divide-y divide-border">{delists.map((task) => <div key={task.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2">{task.soldOn && <span className={`${chip} border-border bg-success-tint text-foreground`}>Sold on {siteLabel(task.soldOn)}{task.soldFor ? ` · ${money(task.soldFor)}` : ''}</span>}<span className={`${chip} border-destructive bg-destructive/10 text-destructive`}>Still on {siteLabel(task.marketplace)}</span></div><p className="mt-2 font-semibold text-foreground">{task.itemTitle}</p><p className="mt-1 text-sm text-muted-foreground">Sale recorded {ago(task.createdAt)}.</p></div>
        <div className="flex flex-wrap gap-2">
          <a href={task.listingUrl || (task.marketplace === 'poshmark' ? 'https://poshmark.com/closet' : 'https://www.depop.com/')} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 border-2 border-foreground bg-card px-3 text-xs font-extrabold uppercase tracking-[0.05em] text-foreground hover:bg-muted">Open {siteLabel(task.marketplace)} listing <ArrowUpRight size={14} /></a>
          <button type="button" disabled={busy} onClick={() => void act(`/api/workflow/delisting-tasks/${task.id}`, { status: 'completed', note: 'Confirmed on Offers & sales page.' }, 'Marked delisted')} className="h-9 border-2 border-foreground bg-primary px-3 text-xs font-extrabold uppercase tracking-[0.05em] text-primary-foreground hover:bg-accent-hover disabled:opacity-50">I delisted it</button>
        </div>
      </div>)}</div>
    </section>}

    {(unmatchedSales.length > 0 || recordedSales.length > 0) && <section className="cx-panel rounded-none">
      <div className="border-b border-border p-5 sm:p-6"><p className="cx-eyebrow">New sales</p><h2 className="mt-2 text-lg font-semibold">Sold in the last 7 days</h2><p className="mt-2 text-sm text-muted-foreground">Each sale is recorded in Orders with a delist task for the other site. Delist there as soon as you can so it can't sell twice.</p></div>
      <div className="divide-y divide-border">
        {recordedSales.map((sale) => <div key={sale.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div><div className="flex flex-wrap items-center gap-2"><SitePill site={sale.marketplace} /><span className={`${chip} border-border bg-success-tint text-foreground`}>Recorded</span></div><p className="mt-2 font-semibold text-foreground">{sale.listingTitle || 'Sold item'}</p><p className="mt-1 text-sm text-muted-foreground">{money(sale.amount)}{sale.buyer ? ` · @${sale.buyer}` : ''} · {ago(sale.firstSeenAt)}</p></div>
          <Link href="/orders" className="inline-flex items-center gap-1 text-xs font-bold text-foreground hover:underline">Delist the other site in Orders <ArrowUpRight size={14} /></Link>
        </div>)}
        {unmatchedSales.map((sale) => <div key={sale.id} className="flex flex-col gap-3 p-5 sm:p-6">
          <div><div className="flex flex-wrap items-center gap-2"><SitePill site={sale.marketplace} /><span className={`${chip} border-warning/30 bg-warning-tint text-warning`}>Which item?</span></div><p className="mt-2 font-semibold text-foreground">{sale.listingTitle || 'Sold item'}</p><p className="mt-1 text-sm text-muted-foreground">{money(sale.amount)}{sale.buyer ? ` · @${sale.buyer}` : ''} · {ago(sale.firstSeenAt)}. CrossLinkOS couldn't tell which of your items this is.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select aria-label="Item that sold" value={picks[sale.id] ?? ''} onChange={(e) => setPicks({ ...picks, [sale.id]: e.target.value })} className="h-10 min-w-0 flex-1 rounded-none border border-input bg-card px-3 text-sm text-foreground">
              <option value="">{itemsQuery.isLoading ? 'Loading items…' : 'Pick the item that sold'}</option>
              {(itemsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <button type="button" disabled={busy || !picks[sale.id]} onClick={() => void act(`/api/offers/${sale.id}/item`, { itemId: Number(picks[sale.id]) }, 'Sale recorded')} className="h-10 border-2 border-foreground bg-primary px-4 text-xs font-extrabold uppercase tracking-[0.05em] text-primary-foreground hover:bg-accent-hover disabled:opacity-50">Record sale</button>
            <button type="button" disabled={busy} onClick={() => void act(`/api/offers/${sale.id}`, { status: 'dismissed' }, 'Hidden')} className="h-10 border border-border px-3 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50">Not mine / hide</button>
          </div>
        </div>)}
      </div>
    </section>}

    {groups.length === 0 ? <section className="cx-panel rounded-none p-12 text-center"><BadgeDollarSign size={28} className="mx-auto text-muted-foreground" /><p className="mt-4 font-semibold text-foreground">No open offers right now.</p><p className="mt-2 text-sm text-muted-foreground">When the extension reads an offer on Poshmark or Depop, it shows up here next to any offers for the same item on the other site.</p></section>
      : <section className="space-y-5">{groups.map((group) => <article key={group.item?.id ?? group.title} className="cx-panel overflow-hidden rounded-none">
        <div className="flex flex-col gap-3 border-b border-border bg-card p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">{group.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{group.item ? <>
              {group.item.listings.length ? group.item.listings.map((l) => `${siteLabel(l.marketplace)} ${money(l.price)}`).join(' · ') : `Listed at ${money(group.item.price)}`}
              {group.item.floor != null ? ` · Poshmark minimum ${money(group.item.floor)}` : ''}
              {group.item.cost > 0 ? ` · You paid ${money(group.item.cost)}` : ''}
            </> : 'Not matched to an item in CrossLinkOS yet.'}</p>
          </div>
          {group.betterElsewhere && <span className={`${chip} shrink-0 border-input bg-success-tint text-foreground`}>Best on {group.betterElsewhere.site}: +{money(group.betterElsewhere.extra)} kept</span>}
        </div>
        <div className="divide-y divide-border">{group.offers.map((offer) => <div key={offer.id} className={`grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6 ${offer.stale ? 'opacity-55' : ''}`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SitePill site={offer.marketplace} />
              {offer.best && <span className={`${chip} border-foreground bg-primary text-primary-foreground`}>Best take-home</span>}
              {offer.belowFloor && <span className={`${chip} border-warning/30 bg-warning-tint text-warning`}>Below your minimum</span>}
              {offer.stale && <span className={`${chip} border-border bg-muted text-muted-foreground`}>Probably expired</span>}
            </div>
            <p className="mt-2 text-sm text-muted-foreground"><span className="text-base font-semibold text-foreground">{money(offer.amount)}</span>{offer.buyer ? ` from @${offer.buyer}` : ''} · seen {ago(offer.firstSeenAt)}</p>
            <p className="mt-1 text-sm text-muted-foreground">You'd keep about <span className="font-semibold text-foreground">{money(offer.net)}</span>{offer.profit != null ? <> · profit <span className={`font-semibold ${offer.profit >= 0 ? 'text-foreground' : 'text-destructive'}`}>{money(offer.profit)}</span></> : null}</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <a href={offer.listingUrl || OFFER_PAGES[offer.marketplace]} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 border-2 border-foreground bg-card px-3 text-xs font-extrabold uppercase tracking-[0.05em] text-foreground hover:bg-muted">Answer on {siteLabel(offer.marketplace)} <ArrowUpRight size={14} /></a>
            <button type="button" disabled={busy} onClick={() => void act(`/api/offers/${offer.id}`, { status: 'dismissed' }, 'Offer hidden')} className="inline-flex h-9 items-center gap-1 border border-border px-3 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"><EyeOff size={14} />Hide</button>
          </div>
        </div>)}</div>
      </article>)}</section>}

    <section className="rounded-none border border-border bg-card p-4 text-sm text-muted-foreground"><div className="flex gap-3"><Info size={17} className="mt-0.5 shrink-0 text-foreground" /><p><span className="font-semibold text-foreground">How it's counted:</span> "You'd keep" uses each site's fees (Poshmark 20%, or $2.95 under $15; Depop 3.3% + $0.45 processing) with buyer-paid shipping. Offers on both sites expire after about a day, so older ones are greyed out. <TriangleAlert size={13} className="inline align-[-2px]" /> First version: if an offer or sale is missing or wrong, tell Claude what the extension's log said so the page reading can be tuned.</p></div></section>
    {recordedSales.length === 0 && unmatchedSales.length === 0 && <p className="flex items-center gap-2 text-xs text-muted-foreground"><PackageCheck size={14} />No new sales in the last 7 days. Past sales are in <Link href="/orders" className="font-semibold text-foreground hover:underline">Orders</Link>.</p>}
  </div>;
}
