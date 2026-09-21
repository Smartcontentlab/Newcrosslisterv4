import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  useGetDashboardSummary,
  useListRecentOrders,
  useListItems,
  useListListings,
  type Item,
} from '@workspace/api-client-react';
import { ArrowRight, Check, Plus } from 'lucide-react';
import QuickAddItem from '@/components/QuickAddItem';
import PostToMarketplace from '@/components/PostToMarketplace';

const CORE_PLATFORMS = ['poshmark', 'depop', 'mercari', 'ebay', 'grailed', 'etsy'];
const MARKET_CODES: Record<string, string> = {
  ebay: 'EB', poshmark: 'PM', mercari: 'ME', depop: 'DP', etsy: 'ET', grailed: 'GR', facebook: 'FB', whatnot: 'WN', shopify: 'SH',
};
const MARKET_NAMES: Record<string, string> = {
  ebay: 'eBay', poshmark: 'Poshmark', mercari: 'Mercari', depop: 'Depop', etsy: 'Etsy', grailed: 'Grailed', facebook: 'Facebook', whatnot: 'Whatnot', shopify: 'Shopify',
};

const money = (value: number | undefined, digits = 0) => `$${(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="flex flex-col gap-2.5 border-2 border-border bg-muted p-4">
      <p className="cx-eyebrow">{label}</p>
      <p className="cx-metric">{value}</p>
      {note && <p className="text-xs font-semibold text-ink-2">{note}</p>}
    </div>
  );
}

function relativeTime(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function Dashboard() {
  const [postItem, setPostItem] = useState<Item | null>(null);

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: recentOrders } = useListRecentOrders();
  const { data: items } = useListItems();
  const { data: listings } = useListListings();

  const itemsNeedingPosting = useMemo(() => {
    if (!items || !listings) return [];
    return items.filter((item) => {
      if (item.status !== 'active') return false;
      const live = listings.filter((l) => l.itemId === item.id && l.status === 'active');
      return new Set(live.map((l) => l.marketplace)).size < CORE_PLATFORMS.length;
    });
  }, [items, listings]);

  const ordersToShip = useMemo(() => (recentOrders ?? []).filter((o) => o.status === 'awaiting_shipment'), [recentOrders]);
  const attention = itemsNeedingPosting.length + ordersToShip.length;

  const marketRows = useMemo(() => {
    const counts = new Map<string, number>();
    (listings ?? []).filter((l) => l.status === 'active').forEach((l) => counts.set(l.marketplace, (counts.get(l.marketplace) ?? 0) + 1));
    return CORE_PLATFORMS.map((id) => ({ id, live: counts.get(id) ?? 0 }));
  }, [listings]);

  const steps = [
    { done: (items?.length ?? 0) > 0, title: 'Add your first item', body: 'Photos, price and what you paid. It takes about a minute.', href: '/listing-studio', cta: 'Open listing studio' },
    { done: (listings?.length ?? 0) > 0, title: 'Prepare marketplace drafts', body: 'Generate Poshmark, Depop and Mercari drafts from one item.', href: '/listings', cta: 'See listings' },
    { done: false, title: 'Connect the Chrome extension', body: 'Prefill each marketplace form from your own signed-in browser.', href: '/connections', cta: 'Connect marketplaces' },
    { done: (recentOrders?.length ?? 0) > 0, title: 'Record your first sale', body: 'Sold items are delisted elsewhere and land in your shipping queue.', href: '/orders', cta: 'Open orders' },
  ];
  const showOnboarding = !summaryLoading && steps.some((step) => !step.done) && (items?.length ?? 0) < 3;

  if (summaryLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-12 w-64 animate-pulse bg-muted" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-36 animate-pulse rounded-none bg-muted" />)}
        </div>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b-2 border-border pb-5 md:flex-row md:items-end">
        <div className="space-y-2">
          <p className="cx-eyebrow">✦ {today}</p>
          <h1 className="cx-display text-[2rem] sm:text-[2.625rem]">Overview</h1>
        </div>
        <div className="md:text-right">
          <p className="text-2xl font-extrabold tabular-nums">{money(summary?.totalRevenue, 2)}</p>
          <p className="cx-eyebrow mt-1">Lifetime revenue</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Active listings" value={(summary?.activeListings ?? 0).toLocaleString()} note={`${summary?.totalInventory ?? 0} items in inventory`} />
        <Tile label="Sold this month" value={summary?.soldThisMonth ?? 0} note={`${money(summary?.totalProfit)} profit to date`} />
        <Tile label="Inventory value" value={money(summary?.inventoryValue)} note="at list price" />
        <div className="tile-inverse flex flex-col gap-2.5 border-2 border-border p-4">
          <p className="cx-eyebrow text-on-inverse">Needs attention</p>
          <p className="cx-metric">{String(attention).padStart(2, '0')}</p>
          {attention > 0 ? (
            <button
              type="button"
              onClick={() => (itemsNeedingPosting[0] ? setPostItem(itemsNeedingPosting[0]) : undefined)}
              className="mt-auto inline-flex h-[42px] items-center gap-2.5 self-start border-2 border-foreground bg-primary px-[18px] text-xs font-extrabold uppercase tracking-[0.05em] text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-95"
            >
              <Plus size={18} strokeWidth={3} /> Review items
            </button>
          ) : (
            <p className="mt-auto text-xs font-semibold text-accent-alt">All caught up ✦</p>
          )}
        </div>
      </div>

      {attention > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {itemsNeedingPosting.length > 0 && (
            <button type="button" onClick={() => setPostItem(itemsNeedingPosting[0])} className="group flex items-center justify-between gap-4 border-2 border-border bg-accent-tint p-5 text-left transition-colors hover:bg-card">
              <div>
                <p className="cx-eyebrow text-ink-2">✦ Suggested</p>
                <p className="mt-2 text-[0.9375rem] font-semibold">{itemsNeedingPosting.length} {itemsNeedingPosting.length === 1 ? 'item is' : 'items are'} missing from core marketplaces</p>
                <p className="mt-1 text-sm text-ink-2">Prepare drafts and hand them to the extension.</p>
              </div>
              <ArrowRight className="shrink-0 transition-transform group-hover:translate-x-1" size={18} />
            </button>
          )}
          {ordersToShip.length > 0 && (
            <Link href="/shipping" className="group flex items-center justify-between gap-4 border-2 border-border bg-muted p-5 transition-colors hover:bg-card">
              <div>
                <p className="cx-eyebrow">Shipments due</p>
                <p className="mt-2 text-[0.9375rem] font-semibold">{ordersToShip.length} {ordersToShip.length === 1 ? 'order awaits' : 'orders await'} fulfillment</p>
                <p className="mt-1 text-sm text-ink-2">Pull, print, pack and ship from the queue.</p>
              </div>
              <ArrowRight className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" size={18} />
            </Link>
          )}
        </div>
      )}

      {showOnboarding && (
        <section aria-label="Getting started" className="border-2 border-border bg-muted p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="cx-panel-title">Get started / {steps.filter((s) => s.done).length} of {steps.length}</h2>
                      </div>
          <ol className="mt-4 grid gap-3 md:grid-cols-2">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-3 border border-border bg-card p-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center border border-border text-xs font-extrabold tabular-nums ${step.done ? 'bg-success text-success-foreground' : 'bg-muted text-ink-2'}`}>
                  {step.done ? <Check size={14} /> : index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold">{step.title}</p>
                  <p className="mt-1 text-sm text-ink-2">{step.body}</p>
                  {!step.done && <Link href={step.href} className="cx-link mt-2 inline-flex items-center gap-1">{step.cta} →</Link>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <QuickAddItem onItemCreated={(item) => setPostItem(item)} />

      {postItem && <PostToMarketplace item={postItem} open={!!postItem} onClose={() => setPostItem(null)} />}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section aria-label="Activity" className="flex flex-col gap-3 border-2 border-border bg-muted p-4">
          <div className="flex items-center justify-between">
            <h2 className="cx-panel-title">Activity / {Math.min((recentOrders ?? []).length, 6)}</h2>
            <Link href="/orders" className="cx-link">View all →</Link>
          </div>
          {(recentOrders ?? []).length === 0 ? (
            <div className="border border-dashed border-foreground bg-card p-8 text-center">
              <p className="font-semibold">No sales yet</p>
              <p className="mt-1 text-sm text-ink-2">Sold items will show up here with what you kept after fees.</p>
            </div>
          ) : (
            (recentOrders ?? []).slice(0, 6).map((order) => (
              <div key={order.id} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 border border-border bg-card p-3">
                <span className="text-[0.625rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">{relativeTime(order.createdAt)}</span>
                <span className="truncate text-sm font-bold">Sold {order.itemTitle ?? 'item'} on {MARKET_NAMES[order.marketplace] ?? order.marketplace}</span>
                <span className="border border-border bg-success px-2 py-1.5 text-[0.625rem] font-extrabold tabular-nums text-success-foreground">{money(order.salePrice, 2)}</span>
              </div>
            ))
          )}
        </section>

        <section aria-label="Marketplaces" className="flex flex-col gap-3 border-2 border-border bg-accent-tint p-4">
          <div className="flex items-center justify-between">
            <h2 className="cx-panel-title">Your marketplaces</h2>
            <Link href="/connections" className="cx-link">Manage →</Link>
          </div>
          {marketRows.map((row) => (
            <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 border border-foreground bg-tile p-3">
              <span className="text-sm font-bold">{MARKET_NAMES[row.id]}</span>
              <span className="inline-flex items-center gap-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em]">
                {row.live > 0 ? <span className="cx-status-dot" /> : <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 border-muted-foreground" />}
                {row.live > 0 ? 'Live' : 'Not listed'}
              </span>
              <span className="w-10 text-right text-[0.625rem] font-medium uppercase tracking-[0.04em] text-muted-foreground tabular-nums">{MARKET_CODES[row.id]} {row.live}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
