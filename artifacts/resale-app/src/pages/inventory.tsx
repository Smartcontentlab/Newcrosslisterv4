import { useState, useMemo } from 'react';
import { useListItems, useCreateItem, useDeleteItem, useListListings, getListItemsQueryKey, getListListingsQueryKey, getGetDashboardSummaryQueryKey, Item } from '@workspace/api-client-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { CheckCircle2, ClipboardCheck, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { ItemInputCondition, ItemInputStatus } from '@workspace/api-client-react';
import PostToMarketplace from '@/components/PostToMarketplace';
import ItemImage from '@/components/ItemImage';

const CORE_PLATFORMS = ['poshmark', 'depop', 'mercari'] as const;
const PLATFORM_ICONS: Record<string, string> = { poshmark: '♥', depop: '★', mercari: '✦' };

type DelistingTask = {
  id: number;
  itemId: number;
  itemTitle: string;
  marketplace: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  note: string | null;
};

export default function Inventory() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [postItem, setPostItem] = useState<{ item: Item, initialPosted: Set<string> } | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: '', description: '', brand: '', category: '',
    condition: 'good' as ItemInputCondition, status: 'active' as ItemInputStatus, price: '', cost: '',
  });

  const { data: items, isLoading } = useListItems();
  const { data: listings } = useListListings();
  const { data: delistingTasks = [], isLoading: isLoadingDelistingTasks } = useQuery<DelistingTask[]>({
    queryKey: ['workflow', 'delisting-tasks'],
    queryFn: async () => {
      const response = await fetch('/api/workflow/delisting-tasks');
      if (!response.ok) throw new Error('Could not load delisting tasks');
      return response.json();
    },
  });
  const createItem = useCreateItem();
  const deleteItem = useDeleteItem();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createItem.mutate(
      { data: { ...formData, price: Number(formData.price), cost: Number(formData.cost) } },
      {
        onSuccess: () => {
          toast({ title: 'Item saved', description: 'Added to your inventory.' });
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          setIsAddOpen(false);
          setFormData({ title: '', description: '', brand: '', category: '', condition: 'good', status: 'active', price: '', cost: '' });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    if (confirm('Delete this item completely?')) {
      deleteItem.mutate({ id }, {
        onSuccess: () => {
          toast({ title: 'Deleted', description: 'Item removed.' });
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListListingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
      });
    }
  };

  const openDelistingTasks = delistingTasks.filter((task) => ['pending', 'in_progress', 'failed'].includes(task.status));

  const completeDelistingTask = async (task: DelistingTask) => {
    setCompletingTaskId(task.id);
    try {
      const response = await fetch(`/api/workflow/delisting-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', note: 'Manual marketplace removal confirmed from Inventory.' }),
      });
      if (!response.ok) throw new Error('Could not complete delisting task');
      await queryClient.invalidateQueries({ queryKey: ['workflow', 'delisting-tasks'] });
      await queryClient.invalidateQueries({ queryKey: getListListingsQueryKey() });
      toast({ title: 'Delisting confirmed', description: `${task.marketplace} is marked removed for ${task.itemTitle}.` });
    } catch (error) {
      toast({ title: 'Could not update task', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' });
    } finally {
      setCompletingTaskId(null);
    }
  };

  // Pre-calculate listings per item
  const listingsByItem = useMemo(() => {
    const map = new Map<number, Set<string>>();
    if (listings) {
      listings.forEach(l => {
        if (l.status === 'active') {
          if (!map.has(l.itemId)) map.set(l.itemId, new Set());
          map.get(l.itemId)!.add(l.marketplace);
        }
      });
    }
    return map;
  }, [listings]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 w-48 bg-white/5 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => <div key={i} className="h-72 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-end justify-between border-b border-border/50 pb-4">
        <div>
          <h1 className="font-pixel text-xl tracking-wide uppercase text-foreground mb-2">Inventory</h1>
          <p className="text-xs font-sans text-muted-foreground uppercase tracking-widest">{items?.length || 0} ITEMS IN STOCK</p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/listing-studio" className="flex items-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-sm font-bold text-primary transition hover:bg-primary/20">
            <ExternalLink size={15} /> Listing Studio
          </Link>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-sans font-bold text-sm rounded-lg hover:bg-primary/90 transition-colors shadow-[0_0_15px_rgba(255,45,120,0.2)]" data-testid="button-add-item">
              <Plus size={16} /> Add Manual
            </button>
          </DialogTrigger>
          <DialogContent className="bg-background border-border max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-pixel text-xs text-muted-foreground uppercase tracking-widest">New Manual Entry</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>Title</Label>
                  <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required className="bg-black/20" />
                </div>
                <div>
                  <Label>Brand</Label>
                  <Input value={formData.brand} onChange={(e) => setFormData({ ...formData, brand: e.target.value })} className="bg-black/20" />
                </div>
                <div>
                  <Label>Category</Label>
                  <Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="bg-black/20" />
                </div>
                <div>
                  <Label>Price</Label>
                  <Input type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} required className="bg-black/20" />
                </div>
                <div>
                  <Label>Cost</Label>
                  <Input type="number" step="0.01" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} required className="bg-black/20" />
                </div>
              </div>
              <button type="submit" className="w-full py-3 bg-primary text-primary-foreground font-sans font-bold rounded-lg mt-4 disabled:opacity-50">
                {createItem.isPending ? 'Saving...' : 'Save Item'}
              </button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <section className="cx-panel rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="cx-eyebrow">Sold-item control queue</p>
            <h2 className="mt-2 text-lg font-semibold">Delist remaining platforms, then fulfill</h2>
            <p className="mt-2 text-sm text-muted-foreground">Only drafts marked as manually posted are queued here after a recorded sale. Finish these removals before using the pull–print–pack–ship checklist.</p>
          </div>
          <Link href="/shipping" className="inline-flex items-center gap-2 rounded-lg border border-accent/35 bg-accent/10 px-3 py-2 text-xs font-bold text-accent hover:bg-accent/15"><ClipboardCheck size={15} /> Open fulfillment checklist</Link>
        </div>
        {isLoadingDelistingTasks ? <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Loading delisting queue…</div> : openDelistingTasks.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-border bg-background/30 p-5 text-sm text-muted-foreground">No remaining-platform removals are waiting. When an item sells, manually posted Poshmark, Depop, or Mercari drafts will appear here.</div> : <div className="mt-5 grid gap-3 lg:grid-cols-2">{openDelistingTasks.map((task) => <article key={task.id} className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-amber-300">Remove from {task.marketplace}</p><h3 className="mt-2 font-semibold text-foreground">{task.itemTitle}</h3><p className="mt-1 text-xs text-muted-foreground">{task.note || 'Confirm the marketplace listing is removed.'}</p></div><button type="button" onClick={() => completeDelistingTask(task)} disabled={completingTaskId === task.id} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-accent/35 bg-accent/10 px-3 py-2 text-xs font-bold text-accent hover:bg-accent/15 disabled:opacity-50">{completingTaskId === task.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Done</button></div></article>)}</div>}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {!items?.length ? (
          <div className="col-span-full py-20 text-center border border-dashed border-border/50 rounded-xl">
            <p className="font-sans font-bold text-muted-foreground">No items in inventory</p>
          </div>
        ) : (
          items.map((item) => {
            const postedSet = listingsByItem.get(item.id) || new Set<string>();
            const isFullyPosted = CORE_PLATFORMS.every(p => postedSet.has(p));
            const pendingTaskCount = openDelistingTasks.filter((task) => task.itemId === item.id).length;

            return (
              <div key={item.id} className="glass-card rounded-xl overflow-hidden flex flex-col transition-all hover:border-primary/30 group">
                <div className="h-48 bg-black/40 relative overflow-hidden flex items-center justify-center shrink-0">
                  <ItemImage src={item.photos?.[0]} alt={item.title} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" iconSize={40} />
                  {isFullyPosted && (
                    <div className="absolute top-2 right-2 bg-accent/90 backdrop-blur text-background font-pixel text-[8px] px-2 py-1 rounded shadow-sm">
                      THREE PLATFORMS
                    </div>
                  )}
                  {item.status === 'sold' && (
                    <div className="absolute left-2 top-2 rounded bg-primary/90 px-2 py-1 font-mono text-[0.56rem] uppercase text-primary-foreground">Sold{pendingTaskCount ? ` · ${pendingTaskCount} delist` : ''}</div>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-sans font-bold text-foreground leading-tight line-clamp-2 pr-4">{item.title}</h3>
                    <button onClick={() => handleDelete(item.id)} className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="text-xs font-sans text-muted-foreground mb-4">{item.brand || item.category || 'Uncategorized'}</p>

                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                    <p className="font-pixel text-sm text-primary">${item.price.toFixed(2)}</p>
                    
                    {/* Platform presence indicators */}
                    <div className="flex items-center gap-1 bg-black/30 p-1 rounded-md border border-white/5 cursor-pointer hover:border-primary/40 transition-colors" 
                         onClick={() => setPostItem({ item, initialPosted: postedSet })}
                         title="Open Posting Flow"
                    >
                      {CORE_PLATFORMS.map(platform => {
                        const isPosted = postedSet.has(platform);
                        return (
                          <span key={platform} className={`w-5 h-5 flex items-center justify-center text-[10px] rounded-sm transition-all ${isPosted ? 'bg-primary/20 text-primary font-bold' : 'text-muted-foreground/30 font-normal hover:bg-white/5'}`}>
                            {PLATFORM_ICONS[platform]}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {postItem && (
        <PostToMarketplace
          item={postItem.item}
          open={!!postItem}
          onClose={() => setPostItem(null)}
          initialPosted={postItem.initialPosted}
        />
      )}
    </div>
  );
}
