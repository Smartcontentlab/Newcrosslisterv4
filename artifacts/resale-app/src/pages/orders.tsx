import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, ClipboardList, MapPin, PackageCheck, Truck, X } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/supabase';

const MARKETPLACES = ['poshmark', 'depop', 'mercari'] as const;
type Marketplace = (typeof MARKETPLACES)[number];
type OrderStatus = 'pending' | 'awaiting_shipment' | 'shipped' | 'delivered' | 'returned' | 'refunded';
type Order = { id: number; itemId: number; itemTitle?: string | null; marketplace: Marketplace; buyerName?: string | null; salePrice: number; fees: number; shippingCost: number; profit: number; status: OrderStatus; trackingNumber?: string | null; createdAt: string; };
type DelistingTask = { id: number; itemId: number; orderId?: number | null; marketplace: Marketplace; status: 'pending' | 'in_progress' | 'completed' | 'failed'; note?: string | null; itemTitle?: string | null; };
type ShippingStep = { key: string; label: string; completed: boolean; completedAt?: string | null; };
type ShippingTask = { id: number; orderId: number; steps: ShippingStep[]; orderMarketplace?: Marketplace | null; orderBuyerName?: string | null; itemTitle?: string | null; trackingNumber?: string | null; };

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const lifecycleMeta: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: 'Sale recorded', className: 'border-primary/35 bg-primary/10 text-accent-text' },
  awaiting_shipment: { label: 'Ready for fulfillment', className: 'border-input/35 bg-accent-tint text-accent-text' },
  shipped: { label: 'Shipped', className: 'border-success/35 bg-success/10 text-success' },
  delivered: { label: 'Delivered', className: 'border-success/35 bg-success/10 text-success' },
  returned: { label: 'Returned', className: 'border-destructive/35 bg-destructive/10 text-destructive' },
  refunded: { label: 'Refunded', className: 'border-muted-foreground/35 bg-muted/20 text-muted-foreground' },
};

function DelistingChip({ task, onComplete, disabled }: { task: DelistingTask | undefined; onComplete: () => void; disabled: boolean }) {
  if (!task) return <span className="rounded-lg border border-border bg-background/35 px-2 py-1.5 text-[0.65rem] text-muted-foreground">No remaining listing</span>;
  const complete = task.status === 'completed';
  return <div className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 ${complete ? 'border-success/35 bg-success/10 text-success' : task.status === 'failed' ? 'border-destructive/35 bg-destructive/10 text-destructive' : 'border-warning/30 bg-warning-tint text-warning'}`}><span className="font-mono text-[0.62rem] uppercase">{task.marketplace[0]} · {complete ? 'delisted' : task.status.replace('_', ' ')}</span>{!complete && <button type="button" onClick={onComplete} disabled={disabled} className="rounded border border-current/30 px-1.5 py-0.5 text-[0.58rem] font-bold hover:bg-black/10 disabled:opacity-50">Confirm</button>}</div>;
}

export default function Orders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isMutating, setIsMutating] = useState(false);
  const query = useQuery({
    queryKey: ['workflow', 'sold-lifecycle'],
    queryFn: async () => {
      const [ordersResponse, delistingResponse, shippingResponse] = await Promise.all([apiFetch('/api/orders'), apiFetch('/api/workflow/delisting-tasks'), apiFetch('/api/shipping')]);
      const [orders, delistingTasks, shippingTasks] = await Promise.all([ordersResponse.json(), delistingResponse.json(), shippingResponse.json()]);
      if (!ordersResponse.ok) throw new Error(orders.error || 'Could not load sold items');
      if (!delistingResponse.ok) throw new Error(delistingTasks.error || 'Could not load delisting tasks');
      if (!shippingResponse.ok) throw new Error(shippingTasks.error || 'Could not load fulfillment tasks');
      return { orders: orders as Order[], delistingTasks: delistingTasks as DelistingTask[], shippingTasks: shippingTasks as ShippingTask[] };
    },
  });

  const tasksByOrder = useMemo(() => new Map((query.data?.delistingTasks ?? []).reduce<Array<[number, DelistingTask[]]>>((rows, task) => {
    if (!task.orderId) return rows;
    const found = rows.find(([id]) => id === task.orderId);
    if (found) found[1].push(task); else rows.push([task.orderId, [task]]);
    return rows;
  }, [])), [query.data?.delistingTasks]);
  const shippingByOrder = useMemo(() => new Map((query.data?.shippingTasks ?? []).map((task) => [task.orderId, task])), [query.data?.shippingTasks]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['workflow', 'sold-lifecycle'] });
  const completeDelisting = async (taskId: number) => {
    setIsMutating(true);
    try {
      const response = await apiFetch(`/api/workflow/delisting-tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save delisting confirmation');
      await refresh();
      toast({ title: 'Delisting confirmed', description: 'The remaining-platform draft is now tracked as delisted.' });
    } catch (error) { toast({ title: 'Delisting update failed', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' }); } finally { setIsMutating(false); }
  };
  const toggleShippingStep = async (task: ShippingTask, stepKey: string) => {
    setIsMutating(true);
    try {
      const steps = task.steps.map((step) => step.key === stepKey ? { ...step, completed: !step.completed } : step);
      const response = await apiFetch(`/api/shipping/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ steps }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update fulfillment step');
      await refresh();
      toast({ title: 'Fulfillment checklist saved', description: 'Your pull–print–pack–ship progress is up to date.' });
    } catch (error) { toast({ title: 'Checklist update failed', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' }); } finally { setIsMutating(false); }
  };

  if (query.isLoading) return <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/60" />;
  if (query.isError) return <div className="rounded-2xl border border-destructive/35 bg-destructive/10 p-6 text-sm text-destructive">{query.error instanceof Error ? query.error.message : 'Could not load sold items.'}</div>;

  const orders = query.data?.orders ?? [];
  return <div className="space-y-6">
    <section className="cx-panel rounded-2xl p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><p className="cx-eyebrow">Sales / close the loop</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Sold & Fulfillment</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Every sold item shows where it sold, which remaining marketplace listings still need removal, and its exact pull–print–pack–ship progress in one place.</p></div><Link href="/shipping" className="inline-flex items-center justify-center gap-2 rounded-lg border border-success/35 bg-success/10 px-4 py-3 text-sm font-bold text-success hover:bg-success/15"><Truck size={16} />Open full fulfillment queue</Link></div></section>
    {orders.length === 0 ? <section className="cx-panel rounded-2xl p-12 text-center"><PackageCheck size={28} className="mx-auto text-muted-foreground" /><p className="mt-4 font-semibold text-foreground">No sales recorded yet.</p><p className="mt-2 text-sm text-muted-foreground">When you record a sale from Listing Studio, it will appear here with delisting and fulfillment actions.</p></section> : <section className="space-y-5">{orders.map((order) => {
      const status = lifecycleMeta[order.status] ?? lifecycleMeta.pending;
      const delisting = tasksByOrder.get(order.id) ?? [];
      const shipping = shippingByOrder.get(order.id);
      const completedDelists = delisting.filter((task) => task.status === 'completed').length;
      const completedSteps = shipping?.steps.filter((step) => step.completed).length ?? 0;
      const totalSteps = shipping?.steps.length ?? 0;
      return <article key={order.id} className="cx-panel overflow-hidden rounded-2xl"><div className="flex flex-col gap-4 border-b border-border/70 bg-background/25 p-5 sm:p-6 xl:flex-row xl:items-start xl:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-wider ${status.className}`}>{status.label}</span><span className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-wider text-accent-text">Sold on {order.marketplace}</span></div><h2 className="mt-3 text-xl font-semibold text-foreground">{order.itemTitle || 'Untitled item'}</h2><p className="mt-2 text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · Buyer: <span className="font-semibold text-foreground">{order.buyerName || 'Not recorded'}</span>{order.trackingNumber ? <> · Tracking: <span className="font-mono text-xs text-foreground">{order.trackingNumber}</span></> : null}</p></div><div className="grid grid-cols-3 gap-5 text-right"><div><p className="font-mono text-sm text-success">{money(order.salePrice)}</p><p className="mt-1 text-[0.58rem] uppercase tracking-wider text-muted-foreground">Sold for</p></div><div><p className="font-mono text-sm text-muted-foreground">{money(order.fees + order.shippingCost)}</p><p className="mt-1 text-[0.58rem] uppercase tracking-wider text-muted-foreground">Fees + ship</p></div><div><p className={`font-mono text-sm ${order.profit >= 0 ? 'text-accent-text' : 'text-destructive'}`}>{money(order.profit)}</p><p className="mt-1 text-[0.58rem] uppercase tracking-wider text-muted-foreground">Profit</p></div></div></div><div className="grid gap-0 xl:grid-cols-[0.95fr_1.05fr]"><section className="border-b border-border/70 p-5 sm:p-6 xl:border-b-0 xl:border-r"><div className="flex items-start justify-between gap-3"><div><p className="cx-eyebrow">Remaining listing removal</p><h3 className="mt-2 text-lg font-semibold">Delist the other platforms</h3><p className="mt-2 text-sm leading-5 text-muted-foreground">This sale happened on <span className="font-semibold text-foreground capitalize">{order.marketplace}</span>. Confirm removal only after you have actually delisted the remaining listing.</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${delisting.length > 0 && completedDelists === delisting.length ? 'border-success/35 bg-success/10 text-success' : 'border-warning/30 bg-warning-tint text-warning'}`}>{completedDelists}/{delisting.length} delisted</span></div><div className="mt-5 grid gap-2">{delisting.length === 0 ? <div className="rounded-lg border border-border bg-background/35 p-3 text-sm text-muted-foreground">No remaining listing records need delisting for this sale.</div> : MARKETPLACES.filter((platform) => platform !== order.marketplace).map((platform) => <DelistingChip key={platform} task={delisting.find((task) => task.marketplace === platform)} onComplete={() => { const task = delisting.find((entry) => entry.marketplace === platform); if (task) void completeDelisting(task.id); }} disabled={isMutating} />)}</div>{delisting.length > 0 && completedDelists === delisting.length && <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs font-semibold text-success"><Check size={14} />All remaining marketplace listings are confirmed delisted.</div>}</section><section className="p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="cx-eyebrow">Pull · print · pack · ship</p><h3 className="mt-2 text-lg font-semibold">Fulfillment checklist</h3><p className="mt-2 text-sm leading-5 text-muted-foreground">{shipping ? `${completedSteps}/${totalSteps} steps completed for this sale.` : 'This order has no active fulfillment checklist.'}</p></div><Link href="/shipping" className="inline-flex items-center gap-1 text-xs font-bold text-accent-text hover:underline">Full queue <ChevronRight size={14} /></Link></div>{shipping ? <div className="mt-5 grid gap-1.5">{shipping.steps.map((step) => <button key={step.key} type="button" disabled={isMutating} onClick={() => void toggleShippingStep(shipping, step.key)} className="flex items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-muted/60 disabled:opacity-50"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${step.completed ? 'border-success bg-success text-success-foreground' : 'border-muted-foreground/50 text-muted-foreground'}`}>{step.completed ? <Check size={12} /> : <ClipboardList size={11} />}</span><span className={`text-sm ${step.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{step.label}</span></button>)}</div> : <div className="mt-5 rounded-lg border border-dashed border-border bg-background/30 p-4 text-sm text-muted-foreground">This sale will appear in fulfillment when its order status is awaiting shipment.</div>}</section></div></article>;
    })}</section>}
    <section className="rounded-xl border border-border bg-background/30 p-4 text-sm text-muted-foreground"><div className="flex gap-3"><MapPin size={17} className="mt-0.5 shrink-0 text-accent-text" /><p><span className="font-semibold text-foreground">Workflow guardrail:</span> this page never silently claims a platform listing is removed. A delisting chip changes only after you confirm the removal. The actual shipment steps are recorded in the fulfillment checklist.</p></div></section>
  </div>;
}
