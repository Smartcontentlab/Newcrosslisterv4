import { useState, useRef, useCallback } from 'react';
import { useCreateItem } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { getListItemsQueryKey } from '@workspace/api-client-react';
import { Upload, X, Camera, Plus, CheckCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { ItemInputCondition } from '@workspace/api-client-react';

const CONDITIONS: { value: ItemInputCondition; label: string }[] = [
  { value: 'new', label: 'Brand New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
];

const CATEGORIES = [
  'Clothing', 'Sneakers', 'Electronics', 'Accessories', 'Home & Garden',
  'Collectibles', 'Books', 'Games', 'Toys', 'Sports', 'Beauty', 'Other',
];

interface PhotoPreview {
  url: string; // object URL for display
  dataUrl: string; // base64 for storage
  name: string;
}

export default function QuickAddItem() {
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    brand: '',
    category: '',
    condition: 'good' as ItemInputCondition,
    price: '',
    cost: '',
    tags: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const createItem = useCreateItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const previews = await Promise.all(
      imageFiles.slice(0, 8).map(async (file) => ({
        url: URL.createObjectURL(file),
        dataUrl: await readAsDataUrl(file),
        name: file.name,
      }))
    );

    setPhotos((prev) => [...prev, ...previews].slice(0, 8));
    setExpanded(true);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].url);
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setExpanded(false);
      return next;
    });
  };

  const reset = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setExpanded(false);
    setSubmitted(false);
    setForm({
      title: '', description: '', brand: '', category: '',
      condition: 'good', price: '', cost: '', tags: '',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.price) return;

    createItem.mutate(
      {
        data: {
          title: form.title,
          description: form.description || undefined,
          brand: form.brand || undefined,
          category: form.category || undefined,
          condition: form.condition,
          status: 'active',
          price: Number(form.price),
          cost: Number(form.cost) || 0,
          photos: photos.map((p) => p.dataUrl),
          tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
          setSubmitted(true);
          toast({
            title: '♥ Item added!',
            description: `${form.title} is now in your inventory`,
          });
          setTimeout(reset, 2000);
        },
        onError: () => {
          toast({ title: 'Error', description: 'Could not save item', variant: 'destructive' });
        },
      }
    );
  };

  if (submitted) {
    return (
      <div className="glass-card-glow rounded-xl p-8 flex flex-col items-center justify-center gap-3 border border-accent/50 neon-glow-mint animate-fade-in">
        <CheckCircle className="text-accent" size={40} />
        <p className="font-pixel text-accent text-glow-mint text-lg">Item saved!</p>
        <p className="font-sans text-muted-foreground text-sm">Adding to inventory...</p>
      </div>
    );
  }

  return (
    <div className={`glass-card-glow rounded-xl border transition-all duration-300 ${isDragging ? 'border-primary neon-glow-pink scale-[1.01]' : 'border-primary/40'}`}>
      {/* Drop zone header — always visible */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !expanded && fileInputRef.current?.click()}
        className={`relative p-6 rounded-t-xl cursor-pointer transition-all ${expanded ? 'rounded-t-xl border-b border-border/30' : 'rounded-xl'} ${!expanded ? 'hover:bg-primary/5' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />

        {photos.length === 0 ? (
          /* Empty drop zone */
          <div className="flex flex-col items-center justify-center gap-3 py-4 select-none">
            <div className="p-4 rounded-full bg-primary/10 border border-primary/30 neon-glow-pink animate-glow-pulse">
              <Camera className="text-primary" size={32} />
            </div>
            <div className="text-center">
              <p className="font-pixel text-primary text-glow-pink text-sm mb-1">Drop photos here</p>
              <p className="font-sans text-muted-foreground text-xs">or click to upload — up to 8 images, any format</p>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div className="h-px bg-border/40 w-16" />
              <span className="text-muted-foreground text-xs font-sans">New Inventory Item</span>
              <div className="h-px bg-border/40 w-16" />
            </div>
          </div>
        ) : (
          /* Photo strip */
          <div className="flex items-center gap-3">
            <div className="flex gap-2 flex-wrap flex-1">
              {photos.map((photo, i) => (
                <div key={i} className="relative group">
                  <img
                    src={photo.url}
                    alt={`photo ${i + 1}`}
                    className="w-20 h-20 object-cover rounded-lg border border-primary/40"
                    style={{ boxShadow: '0 0 10px rgba(255,45,120,0.3)' }}
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removePhoto(i); }}
                    className="absolute -top-2 -right-2 bg-background border border-primary/50 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={12} className="text-primary" />
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-1 left-1 text-[8px] font-pixel text-primary bg-background/80 px-1 rounded">
                      MAIN
                    </span>
                  )}
                </div>
              ))}
              {photos.length < 8 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className="w-20 h-20 rounded-lg border border-dashed border-primary/40 flex items-center justify-center hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <Plus size={20} className="text-muted-foreground" />
                </button>
              )}
            </div>
            <p className="font-pixel text-xs text-primary text-glow-pink whitespace-nowrap">
              {photos.length} photo{photos.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Expanded form */}
      {expanded && (
        <form onSubmit={handleSubmit} className="p-6 space-y-5 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label className="font-sans font-bold text-foreground mb-1.5 block">
                Item Title <span className="text-primary">★</span>
              </Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Nike Air Jordan 1 Chicago Size 10"
                required
                className="glass-card border-border/50 focus:border-primary font-sans"
                style={{ boxShadow: form.title ? '0 0 8px rgba(255,45,120,0.2)' : undefined }}
              />
            </div>

            <div>
              <Label className="font-sans font-bold text-foreground mb-1.5 block">Brand</Label>
              <Input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="Nike, Supreme, Coach..."
                className="glass-card border-border/50 focus:border-primary font-sans"
              />
            </div>

            <div>
              <Label className="font-sans font-bold text-foreground mb-1.5 block">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="glass-card border-border/50 focus:border-primary font-sans">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="glass-card-glow border-primary/30">
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="font-sans">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="font-sans font-bold text-foreground mb-1.5 block">Condition</Label>
              <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v as ItemInputCondition })}>
                <SelectTrigger className="glass-card border-border/50 focus:border-primary font-sans">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-card-glow border-primary/30">
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="font-sans">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="font-sans font-bold text-foreground mb-1.5 block">Tags</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="jordan, sneakers, og (comma-separated)"
                className="glass-card border-border/50 focus:border-primary font-sans"
              />
            </div>

            <div>
              <Label className="font-sans font-bold text-foreground mb-1.5 block">
                Listing Price <span className="text-accent">$</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="0.00"
                required
                className="glass-card border-border/50 focus:border-accent font-pixel text-accent"
                style={{ boxShadow: form.price ? '0 0 8px rgba(0,255,209,0.15)' : undefined }}
              />
            </div>

            <div>
              <Label className="font-sans font-bold text-foreground mb-1.5 block">
                What You Paid <span className="text-muted-foreground">$</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
                placeholder="0.00"
                className="glass-card border-border/50 focus:border-primary font-pixel"
              />
            </div>

            <div className="md:col-span-2">
              <Label className="font-sans font-bold text-foreground mb-1.5 block">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Condition details, measurements, any flaws..."
                rows={3}
                className="glass-card border-border/50 focus:border-primary font-sans resize-none"
              />
            </div>
          </div>

          {/* Profit preview */}
          {form.price && form.cost && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/5 border border-accent/20">
              <span className="font-sans text-sm text-muted-foreground">Est. profit:</span>
              <span className="font-pixel text-accent text-glow-mint text-sm">
                ${(Number(form.price) - Number(form.cost)).toFixed(2)}
              </span>
              <span className="font-sans text-xs text-muted-foreground">(before fees)</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={reset}
              className="font-sans text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createItem.isPending || !form.title || !form.price}
              className="px-6 py-2.5 rounded-full font-pixel text-sm text-white bg-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105"
              style={{ boxShadow: '0 0 20px rgba(255,45,120,0.5), 0 0 40px rgba(255,45,120,0.2)' }}
            >
              {createItem.isPending ? 'Saving...' : '♥ Add to Inventory'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
