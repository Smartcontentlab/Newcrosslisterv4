import { useListListings, useCreateListing } from '@workspace/api-client-react';
import { Plus, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { ListingInputMarketplace, ListingInputStatus } from '@workspace/api-client-react';

export default function Listings() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    itemId: '',
    marketplace: 'ebay' as ListingInputMarketplace,
    status: 'active' as ListingInputStatus,
    price: '',
    title: '',
  });

  const { data: listings, isLoading } = useListListings();
  const createListing = useCreateListing();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createListing.mutate(
      {
        data: {
          ...formData,
          itemId: Number(formData.itemId),
          price: Number(formData.price),
        },
      },
      {
        onSuccess: () => {
          toast({ title: '✦ Listing created!', description: 'Item listed successfully' });
          setIsOpen(false);
          setFormData({ itemId: '', marketplace: 'ebay', status: 'active', price: '', title: '' });
        },
        onError: () => {
          toast({ title: 'Error', description: 'Failed to create listing', variant: 'destructive' });
        },
      }
    );
  };

  const marketplaceColors: Record<string, string> = {
    ebay: 'bg-yellow-500/20 text-yellow-400 border border-yellow-400/50',
    poshmark: 'bg-pink-500/20 text-pink-400 border border-pink-400/50',
    depop: 'bg-red-500/20 text-red-400 border border-red-400/50',
    mercari: 'bg-blue-500/20 text-blue-400 border border-blue-400/50',
    grailed: 'bg-purple-500/20 text-purple-400 border border-purple-400/50',
    facebook: 'bg-blue-600/20 text-blue-300 border border-blue-300/50',
    etsy: 'bg-orange-500/20 text-orange-400 border border-orange-400/50',
    whatnot: 'bg-green-500/20 text-green-400 border border-green-400/50',
    shopify: 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/50',
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-muted/50 text-muted-foreground',
    active: 'bg-accent/20 text-accent border border-accent/50',
    ended: 'bg-secondary/20 text-secondary border border-secondary/50',
    sold: 'bg-primary/20 text-primary border border-primary/50',
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 bg-muted/20 rounded-lg animate-pulse" />
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 bg-muted/20 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-pixel text-4xl text-secondary text-glow-purple glitch-text mb-2" data-text="Listings">
            Listings
          </h1>
          <p className="text-muted-foreground font-sans">{listings?.length || 0} cross-listed items ★</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="neon-glow-purple bg-secondary hover:bg-secondary/80 font-sans font-bold" data-testid="button-add-listing">
              <Plus size={20} /> New Listing
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card-glow border-secondary/50">
            <DialogHeader>
              <DialogTitle className="font-pixel text-secondary text-glow-purple">Create Listing ★</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="font-sans font-bold">Item ID</Label>
                <Input
                  type="number"
                  value={formData.itemId}
                  onChange={(e) => setFormData({ ...formData, itemId: e.target.value })}
                  required
                  className="glass-card border-border/50 focus:border-secondary"
                  data-testid="input-item-id"
                />
              </div>
              <div>
                <Label className="font-sans font-bold">Marketplace</Label>
                <Select value={formData.marketplace} onValueChange={(v) => setFormData({ ...formData, marketplace: v as ListingInputMarketplace })}>
                  <SelectTrigger className="glass-card border-border/50" data-testid="select-marketplace">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-secondary/50">
                    <SelectItem value="ebay">eBay</SelectItem>
                    <SelectItem value="poshmark">Poshmark</SelectItem>
                    <SelectItem value="depop">Depop</SelectItem>
                    <SelectItem value="mercari">Mercari</SelectItem>
                    <SelectItem value="grailed">Grailed</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="etsy">Etsy</SelectItem>
                    <SelectItem value="whatnot">Whatnot</SelectItem>
                    <SelectItem value="shopify">Shopify</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="font-sans font-bold">Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                  className="glass-card border-border/50 focus:border-secondary"
                  data-testid="input-price"
                />
              </div>
              <Button type="submit" className="w-full neon-glow-purple bg-secondary hover:bg-secondary/80 font-sans font-bold" disabled={createListing.isPending} data-testid="button-submit">
                {createListing.isPending ? 'Creating...' : 'Create Listing ✦'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass-card-glow rounded-xl overflow-hidden">
        {!listings || listings.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-pixel text-xl text-muted-foreground mb-4">No listings yet</p>
            <p className="text-muted-foreground font-sans">Create your first cross-listing ★</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border/50 bg-muted/20">
                <tr>
                  <th className="px-6 py-4 text-left font-pixel text-xs text-primary">Item</th>
                  <th className="px-6 py-4 text-left font-pixel text-xs text-primary">Marketplace</th>
                  <th className="px-6 py-4 text-left font-pixel text-xs text-primary">Status</th>
                  <th className="px-6 py-4 text-left font-pixel text-xs text-primary">Price</th>
                  <th className="px-6 py-4 text-left font-pixel text-xs text-primary">Listed</th>
                  <th className="px-6 py-4 text-left font-pixel text-xs text-primary">Action</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors" data-testid={`listing-${listing.id}`}>
                    <td className="px-6 py-4 font-sans font-bold text-foreground">
                      {listing.itemTitle || listing.title || 'Untitled'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold font-sans ${marketplaceColors[listing.marketplace]}`}>
                        {listing.marketplace.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold font-sans ${statusColors[listing.status]}`}>
                        {listing.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-pixel text-accent text-glow-mint">${listing.price.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground font-sans">
                      {listing.listedAt ? new Date(listing.listedAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <button className="text-secondary hover:text-secondary/80 transition-colors" data-testid={`button-view-${listing.id}`}>
                        <ExternalLink size={16} />
                      </button>
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
