import { useMemo, useState } from 'react';
import {
  getGetDashboardSummaryQueryKey,
  getListItemsQueryKey,
  getListListingsQueryKey,
  useCreateItem,
  useDeleteItem,
  useListItems,
  useListListings,
  useUpdateItem,
  type Item,
  type ItemInputCondition,
  type ItemInputStatus,
} from '@workspace/api-client-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Archive, CheckCircle2, ClipboardCheck, ExternalLink, LayoutGrid, Loader2, Plus, Rows3, Search, Trash2, X } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import PostToMarketplace from '@/components/PostToMarketplace';
import ItemImage from '@/components/ItemImage';
import { MarketplaceBadges, marketplaceName } from '@/components/MarketplaceBadges';
import { PageHeader } from '@/components/PageHeader';
import { Sparkle } from '@/components/ui/sparkle';
import { apiFetch } from '@/lib/supabase';

const CORE_PLATFORMS = ['poshmark', 'depop', 'mercari'] as const;
type DelistingTask = { id: number; itemId: number; itemTitle: string; marketplace: string; status: 'pending' | 'in_progress' | 'completed' | 'failed'; note: string | null };
type StatusFilter = 'all' | 'active' | 'draft' | 'sold' | 'archived';
type View = 'table' | 'grid';

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'draft', label: 'Draft' },
  { id: 'sold', label: 'Sold' },
  { id: 'archived', label: 'Archived' },
];

const money = (value: number) => `$${value.toFixed(2)}`;

function StatusChip({ status, pending }: { status: string; pending: number }) {
  if (status === 'sold') return <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-success-tint px-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-success"><span aria-hidden="true">●</span>Sold{pending ? ` · ${pending} delist` : ''}</span>;
  if (status === 'active') return <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-accent-tint px-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-accent-text"><span aria-hidden="true">✦</span>Active</span>;
  if (status === 'archived') return <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-muted px-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-ink-2"><span aria-hidden="true">▣</span>Archived</span>;
  return <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-dashed border-input px-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-muted-foreground"><span aria-hidden="true">○</span>Draft</span>;
}

export default function Inventory() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [postItem, setPostItem] = useState<{ item: Item; initialPosted: Set<string> } | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'grid' : 'table'));
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<number[] | null>(null);
  const [formData, setFormData] = useState({
    title: '', description: '', brand: '', category: '',
    condition: 'good' as ItemInputCondition, status: 'active' as ItemInputStatus, price: '', cost: '',
  });

  const { data: items, isLoading } = useListItems();
  const { data: listings } = useListListings();
  const { data: delistingTasks = [], isLoading: isLoadingDelistingTasks } = useQuery<DelistingTask[]>({
    queryKey: ['workflow', 'delisting-tasks'],
    queryFn: async () => {
      const response = await apiFetch('/api/workflow/delisting-tasks');
      if (!response.ok) throw new Error('Could not load delisting tasks');
      return response.json();
    },
  });
  const createItem = useCreateItem();
  const deleteItem = useDeleteItem();
  const updateItem = useUpdateItem();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListListingsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createItem.mutate(
      { data: { ...formData, price: Number(formData.price), cost: Number(formData.cost) } },
      {
        onSuccess: () => {
          toast({ title: 'Item saved', description: 'Added to your inventory.' });
          refresh();
          setIsAddOpen(false);
          setFormData({ title: '', description: '', brand: '', category: '', condition: 'good', status: 'active', price: '', cost: '' });
        },
        onError: () => toast({ title: 'Could not save item', description: 'Check the fields and try again.', variant: 'destructive' }),
      },
    );
  };

  const runDelete = async (ids: number[]) => {
    const results = await Promise.allSettled(ids.map((id) => deleteItem.mutateAsync({ id })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    refresh();
    setSelected(new Set());
    toast(failed
      ? { title: `Deleted ${ids.length - failed} of ${ids.length}`, description: `${failed} could not be removed.`, variant: 'destructive' }
      : { title: ids.length === 1 ? 'Item deleted' : `${ids.length} items deleted` });
  };

  const runArchive = async (ids: number[]) => {
    const results = await Promise.allSettled(ids.map((id) => updateItem.mutateAsync({ id, data: { status: 'archived' } })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    refresh();
    setSelected(new Set());
    toast(failed
      ? { title: `Archived ${ids.length - failed} of ${ids.length}`, description: `${failed} could not be updated.`, variant: 'destructive' }
      : { title: ids.length === 1 ? 'Item archived' : `${ids.length} items archived` });
  };

  const openDelistingTasks = delistingTasks.filter((task) => ['pending', 'in_progress', 'failed'].includes(task.status));

  const completeDelistingTask = async (task: DelistingTask) => {
    setCompletingTaskId(task.id);
    try {
      const response = await apiFetch(`/api/workflow/delisting-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', note: 'Manual marketplace removal confirmed from Inventory.' }),
      });
      if (!response.ok) throw new Error('Could not complete delisting task');
      await queryClient.invalidateQueries({ queryKey: ['workflow', 'delisting-tasks'] });
      await queryClient.invalidateQueries({ queryKey: getListListingsQueryKey() });
      toast({ title: 'Delisting confirmed', description: `${marketplaceName(task.marketplace)} is marked removed for ${task.itemTitle}.` });
    } catch (error) {
      toast({ title: 'Could not update task', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' });
    } finally {
      setCompletingTaskId(null);
    }
  };

  const listingsByItem = useMemo(() => {
    const map = new Map<number, Set<string>>();
    (listings ?? []).forEach((l) => {
      if (l.status === 'active') {
        if (!map.has(l.itemId)) map.set(l.itemId, new Set());
        map.get(l.itemId)!.add(l.marketplace);
      }
    });
    return map;
  }, [listings]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter((item) => {
      if (filter !== 'all' && item.status !== filter) return false;
      if (!q) return true;
      return [item.title, item.brand, item.category, item.model].some((field) => field?.toLowerCase().includes(q));
    });
  }, [items, filter, search]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: items?.length ?? 0, active: 0, draft: 0, sold: 0, archived: 0 };
    (items ?? []).forEach((item) => { c[item.status as StatusFilter] += 1; });
    return c;
  }, [items]);

  const allVisibleSelected = visible.length > 0 && visible.every((item) => selected.has(item.id));
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((item) => item.id)));
  const toggleOne = (id: number) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const rowPad = compact ? 'py-2' : 'py-3.5';

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-12 w-48 animate-pulse rounded-xl bg-muted" />
        <div className="h-72 animate-pulse rounded-[20px] bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        label={`${counts.all} ${counts.all === 1 ? 'item' : 'items'} / ${counts.active} active`}
        title="Inventory"
        actions={(
          <>
            <Link href="/listing-studio" className="inline-flex h-11 items-center gap-2 rounded-full border border-foreground px-5 text-sm font-medium transition-colors hover:bg-muted"><ExternalLink size={15} /> Listing studio</Link>
            <button type="button" onClick={() => setIsAddOpen(true)} data-testid="button-add-item" className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/85"><Plus size={16} /> Quick add</button>
          </>
        )}
      />

      {(openDelistingTasks.length > 0 || isLoadingDelistingTasks) && (
        <section className="rounded-[20px] border border-border bg-card p-5 sm:p-6" aria-label="Sold-item delisting queue">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="cx-eyebrow cx-bracket">Delist queue</p>
              <h2 className="mt-2 font-display text-lg font-bold">Remove sold items from other marketplaces</h2>
              <p className="mt-1.5 max-w-2xl text-sm text-ink-2">Confirm each removal once you have done it in the marketplace, then finish the pull, print, pack and ship checklist.</p>
            </div>
            <Link href="/shipping" className="inline-flex h-10 items-center gap-2 rounded-full border border-foreground px-4 text-sm font-medium hover:bg-muted"><ClipboardCheck size={15} /> Open shipping queue</Link>
          </div>
          {isLoadingDelistingTasks ? (
            <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Loading delisting queue…</div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {openDelistingTasks.map((task) => (
                <article key={task.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-warning-tint p-4">
                  <div className="min-w-0">
                    <p className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-warning">Remove from {marketplaceName(task.marketplace)}</p>
                    <h3 className="mt-2 truncate text-[0.9375rem] font-semibold">{task.itemTitle}</h3>
                    <p className="mt-1 text-xs text-ink-2">{task.note || 'Confirm the marketplace listing is removed.'}</p>
                  </div>
                  <button type="button" onClick={() => completeDelistingTask(task)} disabled={completingTaskId === task.id} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-semibold text-background disabled:opacity-50">
                    {completingTaskId === task.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Done
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${filter === f.id ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-ink-2 hover:border-input'}`}
            >
              {f.label}<span className={`font-mono text-[0.6875rem] ${filter === f.id ? 'text-accent-alt' : 'text-muted-foreground'}`}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="relative block">
            <span className="sr-only">Search inventory</span>
            <Search size={15} className="pointer-events-none absolute left-3.5 top-3.5 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, brand, category" className="h-11 w-full rounded-full border border-input bg-card pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 lg:w-72" />
          </label>
          <div className="flex gap-1 rounded-full bg-muted p-1" role="group" aria-label="View">
            <button type="button" onClick={() => setView('table')} aria-pressed={view === 'table'} aria-label="Table view" className={`flex h-9 w-9 items-center justify-center rounded-full ${view === 'table' ? 'bg-card text-foreground' : 'text-ink-2'}`}><Rows3 size={16} /></button>
            <button type="button" onClick={() => setView('grid')} aria-pressed={view === 'grid'} aria-label="Grid view" className={`flex h-9 w-9 items-center justify-center rounded-full ${view === 'grid' ? 'bg-card text-foreground' : 'text-ink-2'}`}><LayoutGrid size={16} /></button>
          </div>
          {view === 'table' && (
            <button type="button" onClick={() => setCompact((c) => !c)} aria-pressed={compact} className="hidden h-11 rounded-full border border-border bg-card px-4 font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-ink-2 sm:inline-flex sm:items-center">{compact ? 'Compact' : 'Comfortable'}</button>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="tile-inverse flex flex-wrap items-center justify-between gap-3 px-5 py-3" role="region" aria-label="Bulk actions">
          <span className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-label-on-inverse">[ {selected.size} selected ]</span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void runArchive([...selected])} className="inline-flex h-9 items-center gap-2 rounded-full bg-accent-alt px-4 text-sm font-semibold text-inverse"><Archive size={14} /> Archive</button>
            <button type="button" onClick={() => setConfirmDelete([...selected])} className="inline-flex h-9 items-center gap-2 rounded-full border border-dot-on-inverse px-4 text-sm font-medium"><Trash2 size={14} /> Delete</button>
            <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection" className="flex h-9 w-9 items-center justify-center rounded-full border border-dot-on-inverse"><X size={14} /></button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="dot-grid corner-ticks rounded-[20px] border border-dashed border-input bg-card px-6 py-16 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent-tint text-accent-text"><Sparkle size={18} /></span>
          <p className="mt-4 font-display text-xl font-bold">{items?.length ? 'No items match' : 'Your inventory is empty'}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{items?.length ? 'Try a different filter or search.' : 'Add an item with photos in the listing studio, or use Quick add for a fast entry.'}</p>
          {!items?.length && <Link href="/listing-studio" className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background">Open listing studio</Link>}
        </div>
      ) : view === 'table' ? (
        <div className="overflow-x-auto rounded-[20px] border border-border bg-card">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="cx-eyebrow">
                <th className="w-12 py-3 pl-5"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all" className="h-4 w-4 accent-[hsl(var(--primary))]" /></th>
                <th className="py-3 font-normal">Item</th>
                <th className="py-3 font-normal">Status</th>
                <th className="py-3 text-right font-normal">Price</th>
                <th className="py-3 text-right font-normal">Cost</th>
                <th className="py-3 pl-6 pr-5 font-normal">Live on</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const posted = listingsByItem.get(item.id) ?? new Set<string>();
                const pending = openDelistingTasks.filter((t) => t.itemId === item.id).length;
                return (
                  <tr key={item.id} className={`border-t border-border transition-colors hover:bg-muted/40 ${selected.has(item.id) ? 'bg-accent-tint/50' : ''}`}>
                    <td className={`pl-5 ${rowPad}`}><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleOne(item.id)} aria-label={`Select ${item.title}`} className="h-4 w-4 accent-[hsl(var(--primary))]" /></td>
                    <td className={rowPad}>
                      <div className="flex items-center gap-3">
                        <ItemImage src={item.photos?.[0]} alt="" className={`${compact ? 'h-8 w-8' : 'h-11 w-11'} shrink-0 rounded-xl object-cover`} iconSize={16} />
                        <div className="min-w-0">
                          <p className="truncate text-[0.9375rem] font-medium">{item.title}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">{[item.brand, item.category].filter(Boolean).join(' · ') || 'Uncategorized'}</p>
                        </div>
                      </div>
                    </td>
                    <td className={rowPad}><StatusChip status={item.status} pending={pending} /></td>
                    <td className={`text-right font-mono text-sm tabular-nums ${rowPad}`}>{money(item.price)}</td>
                    <td className={`text-right font-mono text-sm tabular-nums text-ink-2 ${rowPad}`}>{money(item.cost)}</td>
                    <td className={`pl-6 pr-5 ${rowPad}`}>
                      <button type="button" onClick={() => setPostItem({ item, initialPosted: posted })} title="Open posting flow" className="rounded-full p-1 transition-colors hover:bg-muted">
                        <MarketplaceBadges markets={CORE_PLATFORMS} live={posted} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((item) => {
            const posted = listingsByItem.get(item.id) ?? new Set<string>();
            const pending = openDelistingTasks.filter((t) => t.itemId === item.id).length;
            return (
              <article key={item.id} className={`group flex flex-col overflow-hidden rounded-[20px] border bg-card transition-colors hover:border-input ${selected.has(item.id) ? 'border-primary' : 'border-border'}`}>
                <div className="relative h-44 shrink-0 bg-muted">
                  <ItemImage src={item.photos?.[0]} alt={item.title} className="h-full w-full object-cover" iconSize={36} />
                  <label className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-card/90">
                    <span className="sr-only">Select {item.title}</span>
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleOne(item.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                  </label>
                  <div className="absolute right-3 top-3"><StatusChip status={item.status} pending={pending} /></div>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="line-clamp-2 text-[0.9375rem] font-semibold leading-snug">{item.title}</h3>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{[item.brand, item.category].filter(Boolean).join(' · ') || 'Uncategorized'}</p>
                  <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
                    <p className="font-mono text-lg font-medium tabular-nums">{money(item.price)}</p>
                    <button type="button" onClick={() => setPostItem({ item, initialPosted: posted })} title="Open posting flow" className="rounded-full p-1 hover:bg-muted"><MarketplaceBadges markets={CORE_PLATFORMS} live={posted} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-xl rounded-[20px]">
          <DialogHeader>
            <p className="cx-eyebrow cx-bracket">Quick add</p>
            <DialogTitle className="font-display text-2xl font-bold">New item</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><Label htmlFor="qa-title">Title</Label><Input id="qa-title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required className="mt-1.5" /></div>
              <div><Label htmlFor="qa-brand">Brand</Label><Input id="qa-brand" value={formData.brand} onChange={(e) => setFormData({ ...formData, brand: e.target.value })} className="mt-1.5" /></div>
              <div><Label htmlFor="qa-cat">Category</Label><Input id="qa-cat" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="mt-1.5" /></div>
              <div><Label htmlFor="qa-price">List price</Label><Input id="qa-price" type="number" min="0" step="0.01" inputMode="decimal" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} required className="mt-1.5 font-mono" /></div>
              <div><Label htmlFor="qa-cost">What I paid</Label><Input id="qa-cost" type="number" min="0" step="0.01" inputMode="decimal" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} required className="mt-1.5 font-mono" /></div>
            </div>
            <button type="submit" disabled={createItem.isPending} className="mt-2 flex h-12 w-full items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background disabled:opacity-50">
              {createItem.isPending ? 'Saving…' : 'Save item'}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <AlertDialogContent className="rounded-[20px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl font-bold">Delete {confirmDelete?.length === 1 ? 'this item' : `${confirmDelete?.length} items`}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the item and its marketplace drafts from CrossLinkOS. It does not remove anything already posted on a marketplace. Archive instead if you may relist it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (confirmDelete) void runDelete(confirmDelete); setConfirmDelete(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {postItem && <PostToMarketplace item={postItem.item} open={!!postItem} onClose={() => setPostItem(null)} initialPosted={postItem.initialPosted} />}
    </div>
  );
}
