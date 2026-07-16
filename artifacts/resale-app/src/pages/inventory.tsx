import { useState, useMemo } from 'react';
import { useListItems, useCreateItem, useDeleteItem, useListListings, getListItemsQueryKey, getListListingsQueryKey, getGetDashboardSummaryQueryKey, Item } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, DollarSign, TrendingUp, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { ItemInputCondition, ItemInputStatus } from '@workspace/api-client-react';
import PostToMarketplace from '@/components/PostToMarketplace';
import ItemImage from '@/components/ItemImage';

const CORE_PLATFORMS = ['poshmark', 'depop', 'mercari', 'ebay', 'grailed', 'etsy'] as const;
const PLATFORM_ICONS: Record<string, string> = {
  poshmark: '♥', depop: '★', mercari: '✦', ebay: '◆', grailed: '✧', etsy: '◇'
};

export default function Inventory() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [postItem, setPostItem] = useState<{ item: Item, initialPosted: Set<string> } | null>(null);
  const [formData, setFormData] = useState({
    title: '', description: '', brand: '', category: '',
    condition: 'good' as ItemInputCondition, status: 'active' as ItemInputStatus, price: '', cost: '',
  });

  const { data: items, isLoading } = useListItems();
  const { data: listings } = useListListings();
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {!items?.length ? (
          <div className="col-span-full py-20 text-center border border-dashed border-border/50 rounded-xl">
            <p className="font-sans font-bold text-muted-foreground">No items in inventory</p>
          </div>
        ) : (
          items.map((item) => {
            const postedSet = listingsByItem.get(item.id) || new Set<string>();
            const isFullyPosted = CORE_PLATFORMS.every(p => postedSet.has(p));

            return (
              <div key={item.id} className="glass-card rounded-xl overflow-hidden flex flex-col transition-all hover:border-primary/30 group">
                <div className="h-48 bg-black/40 relative overflow-hidden flex items-center justify-center shrink-0">
                  <ItemImage src={item.photos?.[0]} alt={item.title} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" iconSize={40} />
                  {isFullyPosted && (
                    <div className="absolute top-2 right-2 bg-accent/90 backdrop-blur text-background font-pixel text-[8px] px-2 py-1 rounded shadow-sm">
                      OMNIPRESENT
                    </div>
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
