import { useState, useRef, useCallback } from 'react';
import { useCreateItem, getListItemsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, X, Camera, Plus, CheckCircle, PackagePlus, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { ItemInputCondition, Item } from '@workspace/api-client-react';

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

interface QuickAddItemProps {
  onItemCreated?: (item: Item) => void;
}

export default function QuickAddItem({ onItemCreated }: QuickAddItemProps) {
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
          toast({
            title: '♥ Item added!',
            description: `${form.title} is now in your inventory`,
          });
          reset();
          if (onItemCreated) {
            onItemCreated(data);
          }
        },
        onError: () => {
          toast({ title: 'Error', description: 'Could not save item', variant: 'destructive' });
        },
      }
    );
  };

  return (
    <div className={`glass-card rounded-xl border transition-all duration-300 ${isDragging ? 'border-primary/80 bg-primary/5 shadow-[0_0_30px_rgba(255,45,120,0.15)] scale-[1.01]' : 'border-border'}`}>
      {/* Drop zone header */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !expanded && fileInputRef.current?.click()}
        className={`relative p-6 cursor-pointer transition-all ${expanded ? 'border-b border-border/50 bg-white/5 rounded-t-xl' : 'rounded-xl hover:bg-white/5 hover:border-primary/30'}`}
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:bg-primary/20 group-hover:scale-110 transition-all">
                <PackagePlus size={24} />
              </div>
              <div>
                <h3 className="font-sans font-bold text-lg text-foreground flex items-center gap-2">
                  Drop photos to add inventory <Zap size={14} className="text-accent" />
                </h3>
                <p className="font-sans text-sm text-muted-foreground">or click to browse. Max 8 images.</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs font-pixel text-muted-foreground">
              <span className="px-2 py-1 bg-black/40 rounded border border-white/5">JPG</span>
              <span className="px-2 py-1 bg-black/40 rounded border border-white/5">PNG</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex gap-2 flex-wrap flex-1">
              {photos.map((photo, i) => (
                <div key={i} className="relative group">
                  <img
                    src={photo.url}
                    alt={`photo ${i + 1}`}
                    className="w-16 h-16 object-cover rounded-md border border-white/10"
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removePhoto(i); }}
                    className="absolute -top-2 -right-2 bg-background border border-border rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:border-destructive hover:text-destructive"
                  >
                    <X size={12} />
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-1 left-1 text-[8px] font-pixel text-primary bg-background/90 px-1 rounded shadow-sm">
                      MAIN
                    </span>
                  )}
                </div>
              ))}
              {photos.length < 8 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className="w-16 h-16 rounded-md border border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary hover:bg-primary/5 hover:text-primary transition-all text-muted-foreground"
                >
                  <Plus size={20} />
                </button>
              )}
            </div>
            <p className="font-pixel text-[10px] text-muted-foreground whitespace-nowrap hidden sm:block">
              {photos.length}/8
            </p>
          </div>
        )}
      </div>

      {/* Expanded form */}
      {expanded && (
        <form onSubmit={handleSubmit} className="p-6 space-y-5 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <Label className="font-sans font-bold text-foreground mb-1.5 block">
                Item Title <span className="text-primary">*</span>
              </Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Vintage 90s Carhartt Leather Jacket"
                required
                className="bg-black/20 border-border/50 focus:border-primary font-sans text-base py-5"
                autoFocus
              />
            </div>

            <div>
              <Label className="font-sans font-bold text-foreground mb-1.5 block">Brand</Label>
              <Input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="Nike, Supreme..."
                className="bg-black/20 border-border/50 focus:border-primary font-sans"
              />
            </div>

            <div>
              <Label className="font-sans font-bold text-foreground mb-1.5 block">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="bg-black/20 border-border/50 focus:border-primary font-sans">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="glass-card border-border">
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="font-sans">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="font-sans font-bold text-foreground mb-1.5 block">Condition</Label>
              <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v as ItemInputCondition })}>
                <SelectTrigger className="bg-black/20 border-border/50 focus:border-primary font-sans">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-card border-border">
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
                placeholder="vintage, y2k (comma separated)"
                className="bg-black/20 border-border/50 focus:border-primary font-sans"
              />
            </div>

            <div>
              <Label className="font-sans font-bold text-foreground mb-1.5 block">
                Target Price <span className="text-accent ml-1 text-xs">$</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="0.00"
                required
                className="bg-black/20 border-border/50 focus:border-accent font-pixel text-accent text-lg py-5"
              />
            </div>

            <div>
              <Label className="font-sans font-bold text-foreground mb-1.5 block">
                Cost Basis <span className="text-muted-foreground ml-1 text-xs">$</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
                placeholder="0.00"
                className="bg-black/20 border-border/50 focus:border-primary font-mono py-5"
              />
            </div>

            <div className="md:col-span-2">
              <Label className="font-sans font-bold text-foreground mb-1.5 block">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Measurements, flaws, history..."
                rows={3}
                className="bg-black/20 border-border/50 focus:border-primary font-sans resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border/50">
            {form.price && form.cost ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-accent/10 border border-accent/20">
                <span className="font-sans text-xs text-muted-foreground">Profit est:</span>
                <span className="font-pixel text-accent text-sm">
                  ${(Number(form.price) - Number(form.cost)).toFixed(2)}
                </span>
              </div>
            ) : <div />}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={reset}
                className="px-4 py-2 font-sans text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createItem.isPending || !form.title || !form.price}
                className="px-6 py-2.5 rounded-lg font-sans font-bold text-sm text-primary-foreground bg-primary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-all shadow-[0_0_15px_rgba(255,45,120,0.3)] hover:shadow-[0_0_25px_rgba(255,45,120,0.5)] flex items-center gap-2"
              >
                {createItem.isPending ? 'Saving...' : (
                  <>
                    Save & Continue <Zap size={14} />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
