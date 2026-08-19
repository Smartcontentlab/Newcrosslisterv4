import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  ChevronRight,
  ImagePlus,
  Loader2,
  PackageCheck,
  RotateCcw,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CATEGORIES = ['Clothing', 'Sneakers', 'Electronics', 'Accessories', 'Home & Garden', 'Collectibles', 'Books', 'Games', 'Toys', 'Sports', 'Beauty', 'Other'];
const CONDITIONS = [
  { value: 'new', label: 'Brand New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
];
const MARKETPLACES = ['poshmark', 'depop', 'mercari'] as const;
const MAX_PHOTOS = 8;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

type Marketplace = (typeof MARKETPLACES)[number];
type PhotoRecord = {
  id: string;
  original: string;
  processed?: string | null;
  active: 'original' | 'processed';
  processingStatus: 'original' | 'processing' | 'processed' | 'failed';
  name?: string;
  createdAt: string;
};
type MarketplaceDraft = {
  id: number;
  marketplace: Marketplace;
  status: string;
  title: string | null;
  description: string | null;
  tags: string[];
  price: number;
  missingFields: string[];
  usedFallback?: boolean;
};

type CanonicalForm = {
  title: string;
  description: string;
  brand: string;
  model: string;
  category: string;
  size: string;
  color: string;
  measurements: string;
  sku: string;
  notes: string;
  sourceLocation: string;
  sourceUrl: string;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
  status: 'draft' | 'active' | 'sold' | 'archived';
  price: string;
  cost: string;
  weight: string;
  tags: string;
};

const initialForm: CanonicalForm = {
  title: '', description: '', brand: '', model: '', category: '', size: '', color: '', measurements: '', sku: '', notes: '', sourceLocation: '', sourceUrl: '',
  condition: 'good', status: 'draft', price: '', cost: '', weight: '', tags: '',
};

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function createWhiteBackground(foreground: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(foreground);
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) { URL.revokeObjectURL(objectUrl); reject(new Error('Canvas is unavailable')); return; }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      canvas.toBlob((result) => {
        URL.revokeObjectURL(objectUrl);
        if (!result) { reject(new Error('Could not create the processed image')); return; }
        resolve(result);
      }, 'image/png');
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not read the processed image')); };
    image.src = objectUrl;
  });
}

export default function ListingStudio() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<CanonicalForm>(initialForm);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [itemId, setItemId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<MarketplaceDraft[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssisting, setIsAssisting] = useState(false);
  const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false);
  const [salePlatform, setSalePlatform] = useState<Marketplace>('poshmark');
  const [salePrice, setSalePrice] = useState('');
  const [isMarkingSold, setIsMarkingSold] = useState(false);

  const activePhotos = useMemo(() => photos.map((photo) => photo.active === 'processed' && photo.processed ? photo.processed : photo.original), [photos]);
  const estimatedMargin = form.price && form.cost ? Number(form.price) - Number(form.cost) : null;

  const update = <K extends keyof CanonicalForm>(key: K, value: CanonicalForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const addFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files);
    const imageFiles = selected.filter((file) => file.type.startsWith('image/') && file.size <= MAX_FILE_BYTES);
    if (selected.length !== imageFiles.length) toast({ title: 'Some photos were skipped', description: 'Use image files that are 12 MB or smaller.', variant: 'destructive' });
    const available = Math.max(0, MAX_PHOTOS - photos.length);
    if (!available) { toast({ title: 'Photo limit reached', description: `A listing can include up to ${MAX_PHOTOS} photos.` }); return; }
    const records = await Promise.all(imageFiles.slice(0, available).map(async (file) => ({
      id: crypto.randomUUID(),
      original: await toDataUrl(file),
      active: 'original' as const,
      processingStatus: 'original' as const,
      name: file.name,
      createdAt: new Date().toISOString(),
    })));
    if (imageFiles.length > available) toast({ title: 'Photo limit reached', description: `Only the first ${available} selected photo(s) were added.` });
    setPhotos((current) => [...current, ...records]);
  };

  const processPhoto = async (photoId: string) => {
    const target = photos.find((photo) => photo.id === photoId);
    if (!target) return;
    setPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, processingStatus: 'processing' } : photo));
    try {
      const { default: removeBackground } = await import('@imgly/background-removal');
      const source = await (await fetch(target.original)).blob();
      const foreground = await removeBackground(source, { model: 'isnet_quint8', output: { format: 'image/png', quality: 0.92, type: 'foreground' } });
      const whiteBackground = await createWhiteBackground(foreground);
      const processed = await toDataUrl(whiteBackground);
      setPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, processed, active: 'processed', processingStatus: 'processed' } : photo));
      toast({ title: 'White-background photo ready', description: 'Preview it below; you can revert to the original at any time.' });
    } catch (error) {
      setPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, processingStatus: 'failed' } : photo));
      toast({ title: 'Background removal failed', description: error instanceof Error ? error.message : 'Please retry or use the original image.', variant: 'destructive' });
    }
  };

  const saveCanonicalItem = async () => {
    if (!form.title.trim()) { toast({ title: 'Add a title', description: 'A canonical listing needs a clear item title.', variant: 'destructive' }); return null; }
    setIsSaving(true);
    const body = {
      ...form,
      title: form.title.trim(), description: form.description || undefined, brand: form.brand || undefined, model: form.model || undefined,
      category: form.category || undefined, size: form.size || undefined, color: form.color || undefined, measurements: form.measurements || undefined,
      sku: form.sku || undefined, notes: form.notes || undefined, sourceLocation: form.sourceLocation || undefined, sourceUrl: form.sourceUrl || undefined,
      price: Number(form.price) || 0, cost: Number(form.cost) || 0, weight: form.weight ? Number(form.weight) : undefined,
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean), photos: activePhotos, photoRecords: photos,
    };
    try {
      const response = await fetch(itemId ? `/api/workflow/items/${itemId}` : '/api/workflow/items', {
        method: itemId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.fieldErrors ? 'Please review the highlighted listing fields.' : data.error || 'Could not save the listing');
      setItemId(data.id);
      toast({ title: itemId ? 'Listing saved' : 'Canonical listing created', description: itemId ? 'Your latest edits are persisted.' : 'Now generate platform-ready drafts when you are ready.' });
      return data.id as number;
    } catch (error) {
      toast({ title: 'Save failed', description: error instanceof Error ? error.message : 'Your edits are still in the form—please retry.', variant: 'destructive' });
      return null;
    } finally { setIsSaving(false); }
  };

  const requestAiAssist = async () => {
    const id = itemId ?? await saveCanonicalItem();
    if (!id) return;
    setIsAssisting(true);
    try {
      const response = await fetch(`/api/workflow/items/${id}/ai-assist`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI assistance is unavailable');
      setForm((current) => ({
        ...current,
        title: data.title || current.title,
        description: data.description || current.description,
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : current.tags,
        category: data.category || current.category,
        color: data.color || current.color,
        size: data.size || current.size,
      }));
      toast({ title: data.usedFallback ? 'Listing template applied' : 'AI suggestions applied', description: `${data.confidence || 'Seller review required'}. Review every field before publishing.` });
    } catch (error) {
      toast({ title: 'AI assistance failed', description: error instanceof Error ? error.message : 'You can keep editing manually.', variant: 'destructive' });
    } finally { setIsAssisting(false); }
  };

  const generateMarketplaceDrafts = async () => {
    const id = itemId ?? await saveCanonicalItem();
    if (!id) return;
    setIsGeneratingDrafts(true);
    try {
      const response = await fetch(`/api/workflow/items/${id}/marketplace-drafts`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not generate marketplace drafts');
      setDrafts(data);
      toast({ title: 'Platform drafts ready', description: 'Review platform-specific copy and required fields before any publishing connection is enabled.' });
    } catch (error) {
      toast({ title: 'Draft generation failed', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' });
    } finally { setIsGeneratingDrafts(false); }
  };

  const updateDraftStatus = async (draftId: number, status: string) => {
    try {
      const response = await fetch(`/api/workflow/marketplace-drafts/${draftId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the marketplace draft');
      setDrafts((current) => current.map((draft) => draft.id === draftId ? { ...draft, status: data.status } : draft));
      toast({ title: 'Marketplace status updated', description: status === 'published' ? 'This draft is now tracked as manually posted. It will be queued for delisting if the item sells elsewhere.' : 'Marketplace status updated.' });
    } catch (error) {
      toast({ title: 'Status update failed', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' });
    }
  };

  const markSold = async () => {
    const id = itemId ?? await saveCanonicalItem();
    if (!id || !salePrice) { toast({ title: 'Enter the sale price', description: 'Record the final sale price before moving this item to fulfillment.', variant: 'destructive' }); return; }
    setIsMarkingSold(true);
    try {
      const response = await fetch(`/api/workflow/items/${id}/mark-sold`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marketplace: salePlatform, salePrice: Number(salePrice) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not record the sale');
      update('status', 'sold');
      toast({ title: 'Sale recorded', description: `${data.delistingTasksQueued} remaining-platform delisting task(s) were added and the pull–print–pack–ship workflow is ready.` });
    } catch (error) {
      toast({ title: 'Could not record sale', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' });
    } finally { setIsMarkingSold(false); }
  };

  return (
    <div className="space-y-6">
      <section className="cx-panel overflow-hidden rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="cx-eyebrow">Listing Studio / canonical record</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Build once. Prepare everywhere.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Upload the product, preserve original photos, create white-background versions, keep your core listing data in one editable record, then generate separate Poshmark, Depop, and Mercari drafts.</p>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-[0.62rem] uppercase tracking-wider">
            <span className="rounded-full border border-border bg-background/50 px-3 py-2 text-muted-foreground">{photos.length}/{MAX_PHOTOS} photos</span>
            <span className={`rounded-full border px-3 py-2 ${itemId ? 'border-accent/40 bg-accent/10 text-accent' : 'border-primary/40 bg-primary/10 text-primary'}`}>{itemId ? `record #${itemId} saved` : 'unsaved draft'}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="cx-panel rounded-2xl p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div><p className="cx-eyebrow">01 / product images</p><h2 className="mt-2 text-lg font-semibold">Photo workbench</h2></div>
            <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/20"><ImagePlus size={15} /> Add photos</button>
          </div>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && addFiles(event.target.files)} />
          <div onDrop={(event: DragEvent) => { event.preventDefault(); setIsDragging(false); addFiles(event.dataTransfer.files); }} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onClick={() => photos.length === 0 && inputRef.current?.click()} className={`rounded-xl border border-dashed p-5 transition ${isDragging ? 'border-primary bg-primary/10' : 'border-border bg-background/35'} ${photos.length === 0 ? 'cursor-pointer' : ''}`}>
            {photos.length === 0 ? <div className="flex min-h-44 flex-col items-center justify-center text-center"><span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/35 bg-primary/10 text-primary"><ImagePlus size={23} /></span><p className="font-semibold">Drop product photos here</p><p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">JPG, PNG, WEBP, or HEIC up to 12 MB each. Originals are always kept so you can revert after processing.</p></div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo, index) => <div key={photo.id} className="group overflow-hidden rounded-xl border border-border bg-background/45"><div className="relative aspect-square"><img src={photo.active === 'processed' && photo.processed ? photo.processed : photo.original} alt={`Product ${index + 1}`} className="h-full w-full object-cover" />{index === 0 && <span className="absolute left-2 top-2 rounded bg-background/90 px-2 py-1 font-mono text-[0.55rem] text-primary">COVER</span>}{photo.processingStatus === 'processing' && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/75"><Loader2 className="animate-spin text-primary" size={22} /><span className="font-mono text-[0.55rem] text-foreground">CUTTING OUT</span></div>}</div><div className="space-y-2 p-2.5"><div className="flex items-center justify-between font-mono text-[0.55rem] uppercase"><span className={photo.processingStatus === 'processed' ? 'text-accent' : photo.processingStatus === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{photo.processingStatus === 'processed' ? 'white bg ready' : photo.processingStatus === 'failed' ? 'retry available' : 'original'}</span><button type="button" onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))} className="text-muted-foreground hover:text-destructive" aria-label="Remove photo"><Trash2 size={13} /></button></div><div className="flex gap-2">{photo.processingStatus !== 'processing' && <button type="button" onClick={() => processPhoto(photo.id)} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-primary/35 bg-primary/10 px-2 py-1.5 text-[0.62rem] font-semibold text-primary hover:bg-primary/20"><Wand2 size={12} /> White BG</button>}{photo.processed && <button type="button" onClick={() => setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, active: item.active === 'processed' ? 'original' : 'processed' } : item))} className="rounded-md border border-border px-2 py-1.5 text-muted-foreground hover:text-foreground" title="Toggle original and processed"><RotateCcw size={12} /></button>}</div></div></div>)}</div>}</div>
          {photos.length > 0 && <p className="mt-4 text-xs text-muted-foreground">Background removal runs in your browser. The first use may take longer while the model downloads; you can still save the original photos immediately.</p>}
        </div>

        <div className="cx-panel rounded-2xl p-5 sm:p-6">
          <p className="cx-eyebrow">02 / action center</p><h2 className="mt-2 text-lg font-semibold">Save, assist, and prepare</h2>
          <div className="mt-5 space-y-3">
            <button type="button" onClick={saveCanonicalItem} disabled={isSaving} className="flex w-full items-center justify-between rounded-xl border border-primary/45 bg-primary px-4 py-3 text-left text-primary-foreground transition hover:brightness-110 disabled:opacity-50"><span><span className="block text-sm font-bold">{isSaving ? 'Saving canonical record…' : itemId ? 'Save listing changes' : 'Create canonical listing'}</span><span className="mt-1 block text-xs opacity-75">Persists your listing and active photo selections.</span></span>{isSaving ? <Loader2 className="animate-spin" size={18} /> : <ChevronRight size={18} />}</button>
            <button type="button" onClick={requestAiAssist} disabled={isAssisting} className="flex w-full items-center justify-between rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-left text-accent transition hover:bg-accent/15 disabled:opacity-50"><span><span className="block text-sm font-bold">{isAssisting ? 'Getting AI suggestions…' : 'Ask AI to refine fields'}</span><span className="mt-1 block text-xs text-muted-foreground">Suggestions are always editable and never published automatically.</span></span>{isAssisting ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}</button>
            <button type="button" onClick={generateMarketplaceDrafts} disabled={isGeneratingDrafts} className="flex w-full items-center justify-between rounded-xl border border-border bg-background/40 px-4 py-3 text-left text-foreground transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"><span><span className="block text-sm font-bold">{isGeneratingDrafts ? 'Writing platform drafts…' : 'Generate three platform drafts'}</span><span className="mt-1 block text-xs text-muted-foreground">Creates Poshmark, Depop, and Mercari readiness records.</span></span>{isGeneratingDrafts ? <Loader2 className="animate-spin text-primary" size={18} /> : <Bot className="text-primary" size={18} />}</button>
          </div>
          <div className="mt-6 rounded-xl border border-border bg-background/35 p-4"><p className="cx-eyebrow">Margin snapshot</p><div className="mt-3 flex items-end justify-between"><div><p className="text-xs text-muted-foreground">Target price</p><p className="mt-1 text-2xl font-semibold text-foreground">${Number(form.price || 0).toFixed(2)}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Before fees</p><p className={`mt-1 text-2xl font-semibold ${estimatedMargin === null ? 'text-muted-foreground' : estimatedMargin >= 0 ? 'text-accent' : 'text-destructive'}`}>{estimatedMargin === null ? '—' : `$${estimatedMargin.toFixed(2)}`}</p></div></div></div>
        </div>
      </section>

      <section className="cx-panel rounded-2xl p-5 sm:p-6"><div className="mb-6"><p className="cx-eyebrow">03 / universal listing data</p><h2 className="mt-2 text-lg font-semibold">Your canonical item record</h2><p className="mt-2 text-sm text-muted-foreground">Enter the information once. Platform-specific drafts inherit this record and report only the fields they still need.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><div className="md:col-span-2 xl:col-span-3"><Label>Item title <span className="text-primary">*</span></Label><Input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="e.g. 1990s Levi's 501 Straight Jeans" className="mt-2 bg-background/45" /></div><div><Label>Brand</Label><Input value={form.brand} onChange={(event) => update('brand', event.target.value)} placeholder="Levi's" className="mt-2 bg-background/45" /></div><div><Label>Model / style</Label><Input value={form.model} onChange={(event) => update('model', event.target.value)} placeholder="501" className="mt-2 bg-background/45" /></div><div><Label>Category</Label><Select value={form.category} onValueChange={(value) => update('category', value)}><SelectTrigger className="mt-2 bg-background/45"><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></div><div><Label>Size</Label><Input value={form.size} onChange={(event) => update('size', event.target.value)} placeholder="e.g. 30 x 32" className="mt-2 bg-background/45" /></div><div><Label>Color</Label><Input value={form.color} onChange={(event) => update('color', event.target.value)} placeholder="Medium wash blue" className="mt-2 bg-background/45" /></div><div><Label>Condition</Label><Select value={form.condition} onValueChange={(value) => update('condition', value as CanonicalForm['condition'])}><SelectTrigger className="mt-2 bg-background/45"><SelectValue /></SelectTrigger><SelectContent>{CONDITIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div><div><Label>Target list price</Label><Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => update('price', event.target.value)} placeholder="0.00" className="mt-2 bg-background/45" /></div><div><Label>Cost basis</Label><Input type="number" min="0" step="0.01" value={form.cost} onChange={(event) => update('cost', event.target.value)} placeholder="0.00" className="mt-2 bg-background/45" /></div><div><Label>SKU</Label><Input value={form.sku} onChange={(event) => update('sku', event.target.value)} placeholder="BIN-A3-014" className="mt-2 bg-background/45" /></div><div><Label>Source location</Label><Input value={form.sourceLocation} onChange={(event) => update('sourceLocation', event.target.value)} placeholder="Goodwill — Downtown" className="mt-2 bg-background/45" /></div><div><Label>Tags</Label><Input value={form.tags} onChange={(event) => update('tags', event.target.value)} placeholder="vintage, denim, jeans" className="mt-2 bg-background/45" /></div><div className="md:col-span-2 xl:col-span-3"><Label>Measurements</Label><Textarea value={form.measurements} onChange={(event) => update('measurements', event.target.value)} placeholder="Waist: 15 in flat · Inseam: 31 in · Rise: 11 in" className="mt-2 min-h-20 bg-background/45" /></div><div className="md:col-span-2 xl:col-span-3"><Label>Description / known details</Label><Textarea value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Describe the item honestly: material, wear, flaws, fit, and anything a buyer should know." className="mt-2 min-h-28 bg-background/45" /></div><div className="md:col-span-2 xl:col-span-3"><Label>Internal notes</Label><Textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Private notes are not included in marketplace drafts." className="mt-2 min-h-20 bg-background/45" /></div></div></section>

      <section className="cx-panel rounded-2xl p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="cx-eyebrow">04 / platform readiness</p><h2 className="mt-2 text-lg font-semibold">Poshmark, Depop, and Mercari drafts</h2></div><p className="max-w-md text-xs leading-5 text-muted-foreground">These are reviewable draft records only. CrossLinkOS will not claim a marketplace post succeeded until a supported connection confirms it.</p></div>{drafts.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-border bg-background/30 p-7 text-center"><p className="font-semibold">No platform drafts yet</p><p className="mt-2 text-sm text-muted-foreground">Save the canonical record, then generate the three platform drafts.</p></div> : <div className="mt-5 grid gap-4 lg:grid-cols-3">{drafts.map((draft) => <article key={draft.id} className="rounded-xl border border-border bg-background/35 p-4"><div className="flex items-center justify-between"><span className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-primary">{draft.marketplace}</span><span className={`rounded-full border px-2 py-1 font-mono text-[0.54rem] uppercase ${draft.status === 'ready' ? 'border-accent/35 bg-accent/10 text-accent' : 'border-primary/35 bg-primary/10 text-primary'}`}>{draft.status}</span></div><h3 className="mt-4 line-clamp-2 font-semibold text-foreground">{draft.title || form.title}</h3><p className="mt-2 text-sm text-muted-foreground">${draft.price.toFixed(2)} · {draft.tags.slice(0, 3).join(' · ') || 'No tags yet'}</p>{draft.missingFields.length > 0 ? <div className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3"><p className="text-xs font-semibold text-amber-300">Needs: {draft.missingFields.join(', ')}</p></div> : <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-accent"><Check size={14} /> Ready for review</div>}{draft.usedFallback && <p className="mt-3 text-[0.66rem] text-muted-foreground">Template fallback used; review wording before publishing.</p>}{draft.status === 'ready' && <button type="button" onClick={() => updateDraftStatus(draft.id, 'published')} className="mt-4 w-full rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20">Mark posted manually</button>}{draft.status === 'published' && <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-accent"><Check size={14} /> Tracked as posted</div>}</article>)}</div>}</section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.3fr]"><div className="cx-panel rounded-2xl p-5 sm:p-6"><p className="cx-eyebrow">05 / sale handoff</p><h2 className="mt-2 text-lg font-semibold">Record a sale</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">This changes the inventory status to sold, creates remaining-platform delisting tasks, and starts the pull–print–pack–ship checklist.</p><div className="mt-5 grid grid-cols-2 gap-3"><div><Label>Sold on</Label><Select value={salePlatform} onValueChange={(value) => setSalePlatform(value as Marketplace)}><SelectTrigger className="mt-2 bg-background/45"><SelectValue /></SelectTrigger><SelectContent>{MARKETPLACES.map((platform) => <SelectItem key={platform} value={platform} className="capitalize">{platform}</SelectItem>)}</SelectContent></Select></div><div><Label>Sale price</Label><Input type="number" min="0" step="0.01" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} placeholder="0.00" className="mt-2 bg-background/45" /></div></div><button type="button" onClick={markSold} disabled={isMarkingSold} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-bold text-accent hover:bg-accent/15 disabled:opacity-50">{isMarkingSold ? <Loader2 className="animate-spin" size={16} /> : <PackageCheck size={16} />}{isMarkingSold ? 'Recording sale…' : 'Mark sold and create tasks'}</button></div><div className="cx-panel rounded-2xl p-5 sm:p-6"><p className="cx-eyebrow">Workflow promise</p><h2 className="mt-2 text-lg font-semibold">What happens after a sale</h2><ol className="mt-5 space-y-3 text-sm text-muted-foreground"><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 font-mono text-[0.6rem] text-primary">01</span><span>Record the sale platform and final price on the canonical item.</span></li><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 font-mono text-[0.6rem] text-primary">02</span><span>Queue the remaining Poshmark, Depop, or Mercari drafts for delisting—not silent automatic removal.</span></li><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 font-mono text-[0.6rem] text-primary">03</span><span>Create the pull–print–pack–ship task, with the existing fulfillment page as the operational checklist.</span></li></ol></div></section>
    </div>
  );
}
