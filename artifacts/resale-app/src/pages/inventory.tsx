import { useState } from 'react';
import { useListItems, useCreateItem, useDeleteItem } from '@workspace/api-client-react';
import { Plus, Trash2, Edit, DollarSign, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { ItemInputCondition, ItemInputStatus } from '@workspace/api-client-react';

export default function Inventory() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    brand: '',
    category: '',
    condition: 'good' as ItemInputCondition,
    status: 'active' as ItemInputStatus,
    price: '',
    cost: '',
  });

  const { data: items, isLoading } = useListItems();
  const createItem = useCreateItem();
  const deleteItem = useDeleteItem();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createItem.mutate(
      {
        data: {
          ...formData,
          price: Number(formData.price),
          cost: Number(formData.cost),
        },
      },
      {
        onSuccess: () => {
          toast({ title: '✦ Item created!', description: 'Your item has been added to inventory' });
          setIsOpen(false);
          setFormData({
            title: '',
            description: '',
            brand: '',
            category: '',
            condition: 'good',
            status: 'active',
            price: '',
            cost: '',
          });
        },
        onError: () => {
          toast({ title: 'Error', description: 'Failed to create item', variant: 'destructive' });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    if (confirm('Delete this item?')) {
      deleteItem.mutate({ id }, {
        onSuccess: () => {
          toast({ title: '✦ Deleted', description: 'Item removed from inventory' });
        },
      });
    }
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-muted/50 text-muted-foreground',
    active: 'bg-accent/20 text-accent border border-accent/50',
    sold: 'bg-primary/20 text-primary border border-primary/50',
    archived: 'bg-secondary/20 text-secondary border border-secondary/50',
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 bg-muted/20 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-80 bg-muted/20 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-pixel text-4xl text-primary text-glow-pink glitch-text mb-2" data-text="Inventory">
            Inventory
          </h1>
          <p className="text-muted-foreground font-sans">{items?.length || 0} items in stock ★</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="neon-glow-pink font-sans font-bold" data-testid="button-add-item">
              <Plus size={20} /> Add Item
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card-glow border-primary/50 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-pixel text-primary text-glow-pink">New Item ★</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="font-sans font-bold">Title</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="glass-card border-border/50 focus:border-primary neon-glow-pink"
                  data-testid="input-title"
                />
              </div>
              <div>
                <Label className="font-sans font-bold">Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="glass-card border-border/50 focus:border-primary"
                  data-testid="input-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-sans font-bold">Brand</Label>
                  <Input
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="glass-card border-border/50 focus:border-primary"
                    data-testid="input-brand"
                  />
                </div>
                <div>
                  <Label className="font-sans font-bold">Category</Label>
                  <Input
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="glass-card border-border/50 focus:border-primary"
                    data-testid="input-category"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-sans font-bold">Condition</Label>
                  <Select value={formData.condition} onValueChange={(v) => setFormData({ ...formData, condition: v as ItemInputCondition })}>
                    <SelectTrigger className="glass-card border-border/50" data-testid="select-condition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-primary/50">
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="like_new">Like New</SelectItem>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="poor">Poor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-sans font-bold">Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as ItemInputStatus })}>
                    <SelectTrigger className="glass-card border-border/50" data-testid="select-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-primary/50">
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="sold">Sold</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-sans font-bold">Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    required
                    className="glass-card border-border/50 focus:border-primary"
                    data-testid="input-price"
                  />
                </div>
                <div>
                  <Label className="font-sans font-bold">Cost</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                    required
                    className="glass-card border-border/50 focus:border-primary"
                    data-testid="input-cost"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full neon-glow-pink font-sans font-bold" disabled={createItem.isPending} data-testid="button-submit">
                {createItem.isPending ? 'Creating...' : 'Create Item ✦'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {!items || items.length === 0 ? (
          <div className="col-span-full glass-card-glow p-12 rounded-xl text-center">
            <p className="font-pixel text-xl text-muted-foreground mb-4">No items yet</p>
            <p className="text-muted-foreground font-sans">Add your first item to get started ★</p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="glass-card-glow p-6 rounded-xl hover:scale-105 transition-all" data-testid={`item-${item.id}`}>
              <div className="flex items-start justify-between mb-4">
                <span className={`px-3 py-1 rounded-full text-xs font-bold font-sans ${statusColors[item.status]}`}>
                  {item.status.toUpperCase()}
                </span>
                <div className="flex gap-2">
                  <button className="text-secondary hover:text-secondary/80 transition-colors" data-testid={`button-edit-${item.id}`}>
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-destructive hover:text-destructive/80 transition-colors"
                    data-testid={`button-delete-${item.id}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              <h3 className="font-sans font-bold text-lg text-foreground mb-2">{item.title}</h3>
              {item.brand && <p className="text-sm text-muted-foreground font-sans mb-1">by {item.brand}</p>}
              {item.category && <p className="text-xs text-muted-foreground font-sans mb-3">{item.category}</p>}
              
              <div className="flex items-center justify-between pt-4 border-t border-border/30">
                <div className="flex items-center gap-2">
                  <DollarSign size={16} className="text-primary" />
                  <span className="font-pixel text-lg text-primary text-glow-pink">${item.price.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-accent" />
                  <span className="font-pixel text-sm text-accent text-glow-mint">${(item.price - item.cost).toFixed(2)}</span>
                </div>
              </div>
              
              {item.listingCount !== undefined && item.listingCount > 0 && (
                <p className="text-xs text-muted-foreground font-sans mt-3">
                  Listed on {item.listingCount} marketplace{item.listingCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
