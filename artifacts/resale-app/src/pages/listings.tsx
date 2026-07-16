import { useState, useMemo } from 'react';
import { useListListings, useCreateListing, useListItems, getListListingsQueryKey, getListItemsQueryKey, getGetDashboardSummaryQueryKey, Item } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, ExternalLink, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import ItemImage from '@/components/ItemImage';
import type { ListingInputMarketplace } from '@workspace/api-client-react';

export default function Listings() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({
    itemId: '', marketplace: 'ebay' as ListingInputMarketplace, price: ''
  });

  const { data: listings, isLoading: listingsLoading } = useListListings();
  const { data: items } = useListItems();
  const createListing = useCreateListing();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (!search) return items.slice(0, 12);
    const lower = search.toLowerCase();
    return items.filter(i => i.title.toLowerCase().includes(lower) || i.brand?.toLowerCase().includes(lower)).slice(0, 12);
  }, [items, search]);

  const selectedItem = items?.find(i => String(i.id) === formData.itemId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.itemId) {
      toast({ title: 'Select an item', variant: 'destructive' });
      return;
    }

    createListing.mutate(
      {
        data: {
          itemId: Number(formData.itemId),
          marketplace: formData.marketplace,
          status: 'active',
          price: Number(formData.price) || (selectedItem?.price ?? 0),
          title: selectedItem?.title
        },
      },
      {
        onSuccess: () => {
          toast({ title: 'Listing linked!' });
          queryClient.invalidateQueries({ queryKey: getListListingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          setIsOpen(false);
          setFormData({ itemId: '', marketplace: 'ebay', price: '' });
          setSearch('');
        },
      }
    );
  };

  const statusColors: Record<string, string> = {
    active: 'text-primary bg-primary/10 border-primary/20',
    ended: 'text-muted-foreground bg-white/5 border-white/10',
    sold: 'text-accent bg-accent/10 border-accent/20',
  };

  if (listingsLoading) {
    return <div className="h-32 bg-white/5 rounded-xl animate-pulse" />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-end justify-between border-b border-border/50 pb-4">
        <div>
          <h1 className="font-pixel text-xl tracking-wide uppercase text-foreground mb-2">Listings</h1>
          <p className="text-xs font-sans text-muted-foreground uppercase tracking-widest">{listings?.length || 0} TOTAL RECORDS</p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground font-sans font-bold text-sm rounded-lg hover:bg-secondary/90 transition-colors shadow-[0_0_15px_rgba(192,132,252,0.2)]">
              <Plus size={16} /> Link Listing
            </button>
          </DialogTrigger>
          <DialogContent className="bg-background border-border max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="p-6 border-b border-white/5 shrink-0">
              <DialogTitle className="font-pixel text-xs text-muted-foreground uppercase tracking-widest">Manual Link Record</DialogTitle>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Visual Item Picker */}
              <div className="space-y-3">
                <Label>1. Select Item from Inventory</Label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-3 text-muted-foreground" />
                  <Input 
                    placeholder="Search by title or brand..." 
                    value={search} 
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 bg-black/20"
                  />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-black/20 rounded-lg border border-white/5">
                  {filteredItems.map(item => (
                    <div 
                      key={item.id}
                      onClick={() => { setFormData(f => ({ ...f, itemId: String(item.id), price: String(item.price) })); }}
                      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-all border ${
                        formData.itemId === String(item.id) 
                          ? 'border-secondary bg-secondary/10' 
                          : 'border-transparent hover:bg-white/5'
                      }`}
                    >
                      <ItemImage src={item.photos?.[0]} alt={item.title} className="w-10 h-10 rounded object-cover shrink-0" iconSize={16} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-sans font-bold truncate text-foreground">{item.title}</p>
                        <p className="text-[10px] font-pixel text-muted-foreground mt-1">${item.price}</p>
                      </div>
                    </div>
                  ))}
                  {filteredItems.length === 0 && (
                    <p className="col-span-full text-center text-sm text-muted-foreground py-4">No items found.</p>
                  )}
                </div>
              </div>

              {/* Form Details */}
              {formData.itemId && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5 animate-in slide-in-from-top-2">
                  <div>
                    <Label>2. Marketplace</Label>
                    <Select value={formData.marketplace} onValueChange={v => setFormData(f => ({ ...f, marketplace: v as ListingInputMarketplace }))}>
                      <SelectTrigger className="bg-black/20 mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {['ebay', 'poshmark', 'depop', 'mercari', 'grailed', 'etsy'].map(mp => (
                          <SelectItem key={mp} value={mp} className="capitalize">{mp}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>3. Posted Price</Label>
                    <Input type="number" step="0.01" value={formData.price} onChange={e => setFormData(f => ({ ...f, price: e.target.value }))} className="bg-black/20 mt-1.5" />
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-white/5 bg-black/20 shrink-0">
              <button 
                onClick={handleSubmit} 
                disabled={!formData.itemId || createListing.isPending}
                className="w-full py-3 bg-secondary text-secondary-foreground font-sans font-bold rounded-lg disabled:opacity-50 transition-colors"
              >
                {createListing.isPending ? 'Linking...' : 'Save Listing Record'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass-card rounded-xl overflow-hidden border-border/50">
        {!listings?.length ? (
          <div className="p-12 text-center">
            <p className="text-sm font-sans font-bold text-muted-foreground mb-1">No tracked listings</p>
            <p className="text-xs text-muted-foreground">Post items to marketplaces to see them here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-sm">
              <thead className="bg-black/40 text-xs text-muted-foreground uppercase tracking-wider border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 font-normal">Item</th>
                  <th className="px-6 py-4 font-normal">Platform</th>
                  <th className="px-6 py-4 font-normal">Price</th>
                  <th className="px-6 py-4 font-normal">Status</th>
                  <th className="px-6 py-4 font-normal text-right">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {listings.map((l) => (
                  <tr key={l.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4 font-bold text-foreground max-w-[300px] truncate">
                      {l.itemTitle || l.title || 'Unknown'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="capitalize">{l.marketplace}</span>
                    </td>
                    <td className="px-6 py-4 font-pixel text-xs text-primary">${l.price.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wider border ${statusColors[l.status] || statusColors.ended}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {l.marketplaceListingId ? (
                        <button className="text-muted-foreground hover:text-secondary transition-colors inline-flex p-1">
                          <ExternalLink size={14} />
                        </button>
                      ) : (
                        <span className="text-muted-foreground/30">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
