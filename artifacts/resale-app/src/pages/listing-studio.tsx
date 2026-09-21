import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  CircleDollarSign,
  ImagePlus,
  Loader2,
  MessageSquare,
  PackageCheck,
  RotateCcw,
  Save,
  Sparkles,
  Tags,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch } from '@/lib/supabase';

const CATEGORIES = ['Clothing', 'Sneakers', 'Electronics', 'Accessories', 'Home & Garden', 'Collectibles', 'Books', 'Games', 'Toys', 'Sports', 'Beauty', 'Other'];
const CONDITIONS = [
  { value: 'new', label: 'Brand New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
] as const;
const MARKETPLACES = ['poshmark', 'depop', 'mercari'] as const;
const MAX_PHOTOS = 8;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BACKGROUND_REMOVAL_TIMEOUT_MS = 120_000;

type Marketplace = (typeof MARKETPLACES)[number];
type Condition = (typeof CONDITIONS)[number]['value'];
type PhotoRecord = {
  id: string;
  original: string;
  processed?: string | null;
  active: 'original' | 'processed';
  processingStatus: 'original' | 'processing' | 'processed' | 'failed';
  backgroundStyle?: 'white' | 'textured_slate';
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
  condition: Condition;
  status: 'draft' | 'active' | 'sold' | 'archived';
  price: string;
  cost: string;
  weight: string;
  tags: string;
};
type AiSuggestion = Pick<CanonicalForm, 'title' | 'description' | 'category' | 'size' | 'color' | 'tags'> & { confidence: string; usedFallback?: boolean };
type ChatMessage = { role: 'user' | 'assistant'; text: string; suggestions?: string[] };
type FeeAssumptions = {
  poshmarkOverage: string; depopBuyerShipping: string; depopSellerShipping: string; depopBoosted: boolean;
  mercariShippingMode: 'buyer' | 'seller'; mercariBuyerShipping: string; mercariSellerShipping: string;
};
type MarketplaceDetails = {
  department: string; subcategory: string; quantity: string; originalPrice: string; secondaryColor: string; material: string; pattern: string; style: string; fit: string; flaws: string; includedItems: string; authenticity: string; productId: string;
  poshShippingDiscount: string; poshSmartSellMode: 'off' | 'minimum_price' | 'floor_percent'; poshMinimumPrice: string; poshAvailability: 'draft' | 'for_sale' | 'not_for_sale' | 'drops'; poshDropTime: string;
  depopShippingMethod: 'depop_shipping' | 'own_shipping'; depopDomesticShipping: string; depopWorldwide: boolean; depopInternationalShipping: string; depopBundleInfo: string;
  mercariShippingMethod: 'prepaid_label' | 'ship_on_own'; mercariPayer: 'buyer' | 'seller'; mercariPackageLength: string; mercariPackageWidth: string; mercariPackageHeight: string; mercariOriginPostal: string; mercariSmartPriceFloor: string;
  categoryAttributes: string;
};

const initialForm: CanonicalForm = {
  title: '', description: '', brand: '', model: '', category: '', size: '', color: '', measurements: '', sku: '', notes: '', sourceLocation: '', sourceUrl: '',
  condition: 'good', status: 'draft', price: '', cost: '', weight: '', tags: '',
};
const initialFeeAssumptions: FeeAssumptions = { poshmarkOverage: '', depopBuyerShipping: '', depopSellerShipping: '', depopBoosted: false, mercariShippingMode: 'buyer', mercariBuyerShipping: '', mercariSellerShipping: '' };
const initialMarketplaceDetails: MarketplaceDetails = {
  department: '', subcategory: '', quantity: '1', originalPrice: '', secondaryColor: '', material: '', pattern: '', style: '', fit: '', flaws: '', includedItems: '', authenticity: '', productId: '',
  poshShippingDiscount: '', poshSmartSellMode: 'off', poshMinimumPrice: '', poshAvailability: 'draft', poshDropTime: '',
  depopShippingMethod: 'depop_shipping', depopDomesticShipping: '', depopWorldwide: false, depopInternationalShipping: '', depopBundleInfo: '',
  mercariShippingMethod: 'prepaid_label', mercariPayer: 'buyer', mercariPackageLength: '', mercariPackageWidth: '', mercariPackageHeight: '', mercariOriginPostal: '', mercariSmartPriceFloor: '', categoryAttributes: '',
};

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const safeNumber = (value: string) => Math.max(0, Number(value) || 0);

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function createBackdrop(foreground: Blob, style: 'white' | 'textured_slate'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image(); const objectUrl = URL.createObjectURL(foreground);
    image.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) { URL.revokeObjectURL(objectUrl); reject(new Error('Canvas is unavailable')); return; }
      const finish = () => { context.drawImage(image, 0, 0, canvas.width, canvas.height); canvas.toBlob((result) => { URL.revokeObjectURL(objectUrl); if (!result) { reject(new Error('Could not create the processed image')); return; } resolve(result); }, 'image/png'); };
      if (style === 'white') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); finish(); return; }
      const texture = new Image(); texture.onload = () => { context.drawImage(texture, 0, 0, canvas.width, canvas.height); finish(); }; texture.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not load the textured backdrop')); }; texture.src = '/textured-slate-flatlay.png';
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not read the processed image')); };
    image.src = objectUrl;
  });
}

function statusLabel(status: string) {
  return ({ draft: 'Needs details', ready: 'Needs posted', prefilled: 'Prefilled — review', draft_saved: 'Draft saved', published: 'Live', sold: 'Sold', delisted: 'Delisted', needs_attention: 'Needs attention' } as Record<string, string>)[status] ?? status;
}

export default function ListingStudio() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<CanonicalForm>(initialForm);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [backgroundStyle, setBackgroundStyle] = useState<'white' | 'textured_slate'>('white');
  const [fees, setFees] = useState<FeeAssumptions>(initialFeeAssumptions);
  const [marketplaceDetails, setMarketplaceDetails] = useState<MarketplaceDetails>(initialMarketplaceDetails);
  const [itemId, setItemId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<MarketplaceDraft[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssisting, setIsAssisting] = useState(false);
  const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([{ role: 'assistant', text: 'I can sharpen your title, write an honest description, suggest tags, or help you pressure-test this price. I only use the facts you enter.' }]);
  const [isChatting, setIsChatting] = useState(false);
  const [salePlatform, setSalePlatform] = useState<Marketplace>('poshmark');
  const [salePrice, setSalePrice] = useState('');
  const [isMarkingSold, setIsMarkingSold] = useState(false);

  const activePhotos = useMemo(() => photos.map((photo) => photo.active === 'processed' && photo.processed ? photo.processed : photo.original), [photos]);
  const proceeds = useMemo(() => {
    const listPrice = safeNumber(form.price);
    const paid = safeNumber(form.cost);
    const poshmarkFee = listPrice < 15 ? 2.95 : listPrice * 0.2;
    const poshmarkNet = listPrice - poshmarkFee - safeNumber(fees.poshmarkOverage);
    const depopShipping = safeNumber(fees.depopBuyerShipping);
    const depopFee = (listPrice + depopShipping) * 0.033 + 0.45 + (fees.depopBoosted ? listPrice * 0.12 : 0);
    const depopNet = listPrice - depopFee - safeNumber(fees.depopSellerShipping);
    const mercariBuyerShipping = fees.mercariShippingMode === 'buyer' ? safeNumber(fees.mercariBuyerShipping) : 0;
    const mercariFee = (listPrice + mercariBuyerShipping) * 0.1;
    const mercariNet = listPrice - mercariFee - (fees.mercariShippingMode === 'seller' ? safeNumber(fees.mercariSellerShipping) : 0);
    return [
      { platform: 'Poshmark', net: poshmarkNet, profit: poshmarkNet - paid, fee: poshmarkFee, note: fees.poshmarkOverage ? `Includes ${money(safeNumber(fees.poshmarkOverage))} seller label upgrade` : 'Buyer pays standard shipping; no seller label upgrade entered.' },
      { platform: 'Depop', net: depopNet, profit: depopNet - paid, fee: depopFee, note: fees.depopBoosted ? 'Includes US processing and 12% boosted-listing fee.' : 'Includes US payment processing; no selling fee assumed.' },
      { platform: 'Mercari', net: mercariNet, profit: mercariNet - paid, fee: mercariFee, note: fees.mercariShippingMode === 'buyer' ? '10% seller fee includes buyer-paid shipping entered below.' : '10% seller fee plus seller-funded shipping entered below.' },
    ];
  }, [fees, form.cost, form.price]);

  const update = <K extends keyof CanonicalForm>(key: K, value: CanonicalForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateFee = <K extends keyof FeeAssumptions>(key: K, value: FeeAssumptions[K]) => setFees((current) => ({ ...current, [key]: value }));
  const updateMarketplaceDetail = <K extends keyof MarketplaceDetails>(key: K, value: MarketplaceDetails[K]) => setMarketplaceDetails((current) => ({ ...current, [key]: value }));

  const addFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files);
    const imageFiles = selected.filter((file) => SUPPORTED_IMAGE_TYPES.has(file.type) && file.size <= MAX_FILE_BYTES);
    if (selected.length !== imageFiles.length) toast({ title: 'Some photos were skipped', description: 'Use JPG, PNG, or WEBP files that are 12 MB or smaller.', variant: 'destructive' });
    const available = Math.max(0, MAX_PHOTOS - photos.length);
    if (!available) { toast({ title: 'Photo limit reached', description: `A listing can include up to ${MAX_PHOTOS} photos.` }); return; }
    const records = await Promise.all(imageFiles.slice(0, available).map(async (file) => ({ id: crypto.randomUUID(), original: await toDataUrl(file), active: 'original' as const, processingStatus: 'original' as const, name: file.name, createdAt: new Date().toISOString() })));
    if (imageFiles.length > available) toast({ title: 'Photo limit reached', description: `Only the first ${available} selected photo(s) were added.` });
    setPhotos((current) => [...current, ...records]);
  };

  const processPhoto = async (photoId: string) => {
    const target = photos.find((photo) => photo.id === photoId);
    if (!target) return;
    setPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, processingStatus: 'processing' } : photo));
    try {
      const { removeBackground } = await import('@imgly/background-removal');
      const source = await (await fetch(target.original)).blob();
      const foreground = await Promise.race([
        removeBackground(source, { device: 'cpu', model: 'isnet_quint8', output: { format: 'image/png', quality: 0.92 } }),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Background removal took too long. Keep the original photo or try again on a faster connection.')), BACKGROUND_REMOVAL_TIMEOUT_MS)),
      ]);
      const processed = await toDataUrl(await createBackdrop(foreground, backgroundStyle));
      setPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, processed, active: 'processed', processingStatus: 'processed', backgroundStyle } : photo));
      toast({ title: backgroundStyle === 'white' ? 'White-background photo ready' : 'Textured flat-lay photo ready', description: 'Preview it below; you can revert to the original at any time.' });
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
      price: safeNumber(form.price), cost: safeNumber(form.cost), weight: form.weight ? safeNumber(form.weight) : undefined,
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean), photos: activePhotos, photoRecords: photos, marketplaceDetails,
    };
    try {
      const response = await apiFetch(itemId ? `/api/workflow/items/${itemId}` : '/api/workflow/items', { method: itemId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.fieldErrors ? 'Please review the listing fields.' : data.error || 'Could not save the listing');
      setItemId(data.id);
      toast({ title: itemId ? 'Listing saved' : 'Canonical listing created', description: itemId ? 'Your changes are safely saved.' : 'Your item is now ready for AI assistance and platform drafts.' });
      return data.id as number;
    } catch (error) {
      toast({ title: 'Save failed', description: error instanceof Error ? error.message : 'Your edits are still in the form—please retry.', variant: 'destructive' });
      return null;
    } finally { setIsSaving(false); }
  };

  const saveAndContinue = async () => {
    const id = await saveCanonicalItem();
    if (!id) return;
    window.requestAnimationFrame(() => document.getElementById('marketplace-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const requestAiAssist = async (focus: 'all' | 'title' | 'tags' = 'all') => {
    const id = itemId ?? await saveCanonicalItem();
    if (!id) return;
    setIsAssisting(true);
    try {
      const response = await apiFetch(`/api/workflow/items/${id}/ai-assist`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI assistance is unavailable');
      const suggestion: AiSuggestion = {
        title: focus === 'tags' ? form.title : data.title || form.title,
        description: focus === 'title' || focus === 'tags' ? form.description : data.description || form.description,
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : form.tags,
        category: data.category || form.category,
        color: data.color || form.color,
        size: data.size || form.size,
        confidence: data.confidence || 'Seller review required',
        usedFallback: Boolean(data.usedFallback),
      };
      setAiSuggestion(suggestion);
      toast({ title: data.usedFallback ? 'Template suggestion ready' : 'AI suggestion ready', description: 'Compare it with your copy, edit it if you like, then choose what to apply.' });
    } catch (error) {
      toast({ title: 'AI assistance failed', description: error instanceof Error ? error.message : 'You can keep editing manually.', variant: 'destructive' });
    } finally { setIsAssisting(false); }
  };

  const applySuggestion = () => {
    if (!aiSuggestion) return;
    setForm((current) => ({ ...current, title: aiSuggestion.title, description: aiSuggestion.description, tags: aiSuggestion.tags, category: aiSuggestion.category, color: aiSuggestion.color, size: aiSuggestion.size }));
    setAiSuggestion(null);
    toast({ title: 'Suggestion applied', description: 'Review the changes, then save your canonical listing.' });
  };

  const sendChat = async (prompt?: string) => {
    const message = (prompt ?? chatInput).trim();
    if (!message) return;
    setChat((current) => [...current, { role: 'user', text: message }]);
    setChatInput('');
    setIsChatting(true);
    try {
      const response = await apiFetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, context: { item: { ...form, photoCount: photos.length }, pricing: proceeds.map(({ platform, net, profit }) => ({ platform, net, profit })) } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The co-pilot could not answer right now.');
      setChat((current) => [...current, { role: 'assistant', text: data.reply, suggestions: data.suggestions }]);
    } catch (error) {
      setChat((current) => [...current, { role: 'assistant', text: error instanceof Error ? error.message : 'The co-pilot could not answer right now. Please try again.' }]);
    } finally { setIsChatting(false); }
  };

  const estimatePrice = async () => {
    setIsAssisting(true);
    try {
      const response = await apiFetch('/api/ai/price-estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: form.title, brand: form.brand || undefined, model: form.model || undefined, category: form.category || undefined, condition: form.condition }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Price estimate unavailable');
      setChat((current) => [...current, { role: 'assistant', text: `Price planning estimate: ${money(data.minPrice)}–${money(data.maxPrice)}, with ${money(data.suggestedPrice)} as the suggested starting price. Confidence: ${data.confidence}. ${data.reasoning}` }]);
      update('price', String(data.suggestedPrice));
      toast({ title: 'Estimate added to List price', description: 'Review the estimate against actual sold comparables before you post.' });
    } catch (error) {
      toast({ title: 'Price estimate failed', description: error instanceof Error ? error.message : 'Try again after adding more item details.', variant: 'destructive' });
    } finally { setIsAssisting(false); }
  };

  const generateMarketplaceDrafts = async () => {
    const id = itemId ?? await saveCanonicalItem();
    if (!id) return;
    setIsGeneratingDrafts(true);
    try {
      const response = await apiFetch(`/api/workflow/items/${id}/marketplace-drafts`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not generate marketplace drafts');
      setDrafts(data);
      toast({ title: 'P / D / M drafts ready', description: 'Open the Draft Board to monitor each physical item in one line and push ready drafts to your extension.' });
    } catch (error) {
      toast({ title: 'Draft generation failed', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' });
    } finally { setIsGeneratingDrafts(false); }
  };

  const markSold = async () => {
    const id = itemId ?? await saveCanonicalItem();
    if (!id || !salePrice) { toast({ title: 'Enter the sale price', description: 'Record the final sale price before moving this item to fulfillment.', variant: 'destructive' }); return; }
    setIsMarkingSold(true);
    try {
      const response = await apiFetch(`/api/workflow/items/${id}/mark-sold`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marketplace: salePlatform, salePrice: safeNumber(salePrice) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not record the sale');
      update('status', 'sold');
      toast({ title: 'Sale recorded', description: `Sold on ${salePlatform}. ${data.delistingTasksQueued} remaining-platform delisting task(s) and a pull–print–pack–ship checklist are now ready.` });
    } catch (error) {
      toast({ title: 'Could not record sale', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' });
    } finally { setIsMarkingSold(false); }
  };

  return (
    <div className="space-y-6 pb-28">
      <section className="cx-panel overflow-hidden rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="cx-eyebrow">Listing Studio / canonical record</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Build once. Prepare everywhere.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Create one truthful item record, compare expected take-home money before you choose a price, and prepare reviewable Poshmark, Depop, and Mercari drafts without claiming a post happened before you verify it.</p>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-[0.62rem] uppercase tracking-wider">
            <span className="rounded-full border border-border bg-background/50 px-3 py-2 text-muted-foreground">{photos.length}/{MAX_PHOTOS} photos</span>
            <span className={`rounded-full border px-3 py-2 ${itemId ? 'border-success/40 bg-success/10 text-success' : 'border-primary/40 bg-primary/10 text-accent-text'}`}>{itemId ? `record #${itemId} saved` : 'unsaved draft'}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
        <div className="cx-panel rounded-2xl p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between"><div><p className="cx-eyebrow">01 / product images</p><h2 className="mt-2 text-lg font-semibold">Photo workbench</h2><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setBackgroundStyle('white')} className={`rounded-md border px-2.5 py-1.5 text-[0.62rem] font-semibold ${backgroundStyle === 'white' ? 'border-primary/45 bg-primary/10 text-accent-text' : 'border-border text-muted-foreground'}`}>White studio</button><button type="button" onClick={() => setBackgroundStyle('textured_slate')} className={`rounded-md border px-2.5 py-1.5 text-[0.62rem] font-semibold ${backgroundStyle === 'textured_slate' ? 'border-primary/45 bg-primary/10 text-accent-text' : 'border-border text-muted-foreground'}`}>Gray textured flat lay</button></div></div><button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-accent-text transition hover:bg-primary/20"><ImagePlus size={15} /> Add photos</button></div>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && addFiles(event.target.files)} />
          <div onDrop={(event: DragEvent) => { event.preventDefault(); setIsDragging(false); addFiles(event.dataTransfer.files); }} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onClick={() => photos.length === 0 && inputRef.current?.click()} className={`rounded-xl border border-dashed p-5 transition ${isDragging ? 'border-primary bg-primary/10' : 'border-border bg-background/35'} ${photos.length === 0 ? 'cursor-pointer' : ''}`}>
            {photos.length === 0 ? <div className="flex min-h-44 flex-col items-center justify-center text-center"><span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/35 bg-primary/10 text-accent-text"><ImagePlus size={23} /></span><p className="font-semibold">Drop product photos here</p><p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">JPG, PNG, or WEBP up to 12 MB each. Originals are always kept so you can revert after processing.</p></div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo, index) => <div key={photo.id} className="group overflow-hidden rounded-xl border border-border bg-background/45"><div className="relative aspect-square"><img src={photo.active === 'processed' && photo.processed ? photo.processed : photo.original} alt={`Product ${index + 1}`} className="h-full w-full object-cover" />{index === 0 && <span className="absolute left-2 top-2 rounded bg-background/90 px-2 py-1 font-mono text-[0.55rem] text-accent-text">COVER</span>}{photo.processingStatus === 'processing' && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/75"><Loader2 className="animate-spin text-accent-text" size={22} /><span className="font-mono text-[0.55rem] text-foreground">CUTTING OUT</span></div>}</div><div className="space-y-2 p-2.5"><div className="flex items-center justify-between font-mono text-[0.55rem] uppercase"><span className={photo.processingStatus === 'processed' ? 'text-success' : photo.processingStatus === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{photo.processingStatus === 'processed' ? photo.backgroundStyle === 'textured_slate' ? 'textured bg ready' : 'white bg ready' : photo.processingStatus === 'failed' ? 'retry available' : 'original'}</span><button type="button" onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))} className="text-muted-foreground hover:text-destructive" aria-label="Remove photo"><Trash2 size={13} /></button></div><div className="flex gap-2">{photo.processingStatus !== 'processing' && <button type="button" onClick={() => processPhoto(photo.id)} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-primary/35 bg-primary/10 px-2 py-1.5 text-[0.62rem] font-semibold text-accent-text hover:bg-primary/20"><Wand2 size={12} /> {backgroundStyle === 'white' ? 'White BG' : 'Textured BG'}</button>}{photo.processed && <button type="button" onClick={() => setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, active: item.active === 'processed' ? 'original' : 'processed' } : item))} className="rounded-md border border-border px-2 py-1.5 text-muted-foreground hover:text-foreground" title="Toggle original and processed"><RotateCcw size={12} /></button>}</div></div></div>)}</div>}
          </div>
          {photos.length > 0 && <div className="mt-4 flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-muted-foreground">Photos are ready. Continue into the complete canonical record; every Poshmark, Depop, and Mercari field is available there.</p><button type="button" onClick={() => document.getElementById('listing-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-bold text-accent-text hover:bg-primary/20">Continue to fields <ArrowRight size={14} /></button></div>}
        </div>

        <aside className="cx-panel rounded-2xl p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="cx-eyebrow">02 / AI co-pilot</p><h2 className="mt-2 text-lg font-semibold">Listing help, in the form</h2><p className="mt-2 text-sm leading-5 text-muted-foreground">Suggestions are editable. The co-pilot never invents photos, posts listings, or changes your data without your review.</p></div><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-success/40 bg-success/10 text-success"><Bot size={17} /></span></div>
          <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => requestAiAssist('all')} disabled={isAssisting} className="rounded-lg border border-success/35 bg-success/10 px-3 py-2 text-left text-xs font-semibold text-success hover:bg-success/15 disabled:opacity-50"><Sparkles size={14} className="mb-1" />Write description</button><button type="button" onClick={() => requestAiAssist('title')} disabled={isAssisting} className="rounded-lg border border-border bg-background/40 px-3 py-2 text-left text-xs font-semibold hover:border-primary/35 disabled:opacity-50"><Wand2 size={14} className="mb-1 text-accent-text" />Improve title</button><button type="button" onClick={() => requestAiAssist('tags')} disabled={isAssisting} className="rounded-lg border border-border bg-background/40 px-3 py-2 text-left text-xs font-semibold hover:border-primary/35 disabled:opacity-50"><Tags size={14} className="mb-1 text-accent-text" />Suggest tags</button><button type="button" onClick={estimatePrice} disabled={isAssisting} className="rounded-lg border border-border bg-background/40 px-3 py-2 text-left text-xs font-semibold hover:border-primary/35 disabled:opacity-50"><CircleDollarSign size={14} className="mb-1 text-accent-text" />Estimate price</button></div>
          {isAssisting && <div className="mt-4 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-accent-text"><Loader2 size={14} className="animate-spin" />Working from the item facts you entered…</div>}
          {aiSuggestion && <div className="mt-4 space-y-3 rounded-xl border border-success/30 bg-success/5 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-success">Editable suggestion</p><p className="mt-1 text-[0.68rem] text-muted-foreground">{aiSuggestion.confidence}{aiSuggestion.usedFallback ? ' · template fallback' : ''}</p></div><button type="button" onClick={() => setAiSuggestion(null)} className="text-xs text-muted-foreground hover:text-foreground">Discard</button></div><div className="grid gap-3"><div><Label className="text-[0.68rem]">Suggested title</Label><Input value={aiSuggestion.title} onChange={(event) => setAiSuggestion((current) => current ? { ...current, title: event.target.value } : current)} className="mt-1 bg-background/45 text-xs" /></div><div><Label className="text-[0.68rem]">Suggested description</Label><Textarea value={aiSuggestion.description} onChange={(event) => setAiSuggestion((current) => current ? { ...current, description: event.target.value } : current)} className="mt-1 min-h-24 bg-background/45 text-xs" /></div><div><Label className="text-[0.68rem]">Suggested tags</Label><Input value={aiSuggestion.tags} onChange={(event) => setAiSuggestion((current) => current ? { ...current, tags: event.target.value } : current)} className="mt-1 bg-background/45 text-xs" /></div></div><button type="button" onClick={applySuggestion} className="w-full rounded-lg bg-success px-3 py-2 text-xs font-bold text-success-foreground hover:brightness-110">Apply editable suggestion</button></div>}
          <div className="mt-4 max-h-56 space-y-3 overflow-y-auto rounded-xl border border-border bg-background/30 p-3">{chat.map((entry, index) => <div key={`${entry.role}-${index}`} className={`rounded-lg p-2.5 text-xs leading-5 ${entry.role === 'assistant' ? 'bg-muted/60 text-muted-foreground' : 'ml-5 bg-primary/10 text-foreground'}`}><p className="mb-1 font-mono text-[0.55rem] uppercase tracking-wider text-accent-text">{entry.role === 'assistant' ? 'Co-pilot' : 'You'}</p><p>{entry.text}</p>{entry.suggestions?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{entry.suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => sendChat(suggestion)} className="rounded border border-primary/25 px-2 py-1 text-[0.62rem] text-accent-text hover:bg-primary/10">{suggestion}</button>)}</div> : null}</div>)}{isChatting && <div className="flex items-center gap-2 px-1 text-xs text-accent-text"><Loader2 size={13} className="animate-spin" />Thinking…</div>}</div>
          <div className="mt-3 flex gap-2"><Input value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void sendChat(); } }} placeholder="Ask about title, tags, fees, or pricing…" className="bg-background/45 text-xs" /><button type="button" onClick={() => sendChat()} disabled={isChatting || !chatInput.trim()} className="rounded-lg border border-primary/40 bg-primary/10 px-3 text-accent-text disabled:opacity-50" aria-label="Send co-pilot message"><MessageSquare size={15} /></button></div>
        </aside>
      </section>

      <section id="listing-details" className="cx-panel rounded-2xl p-5 sm:p-6"><div className="mb-6"><p className="cx-eyebrow">03 / universal listing data</p><h2 className="mt-2 text-lg font-semibold">Your canonical item record</h2><p className="mt-2 text-sm text-muted-foreground">Enter the reusable item facts once. P/D/M drafts inherit them and report only what still needs attention.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><div className="md:col-span-2 xl:col-span-3"><Label>Item title <span className="text-accent-text">*</span></Label><Input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="e.g. 1990s Levi's 501 Straight Jeans" className="mt-2 bg-background/45" /></div><div><Label>Brand</Label><Input value={form.brand} onChange={(event) => update('brand', event.target.value)} placeholder="Levi's" className="mt-2 bg-background/45" /></div><div><Label>Model / style</Label><Input value={form.model} onChange={(event) => update('model', event.target.value)} placeholder="501" className="mt-2 bg-background/45" /></div><div><Label>Category</Label><Select value={form.category} onValueChange={(value) => update('category', value)}><SelectTrigger className="mt-2 bg-background/45"><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></div><div><Label>Size</Label><Input value={form.size} onChange={(event) => update('size', event.target.value)} placeholder="e.g. 30 x 32" className="mt-2 bg-background/45" /></div><div><Label>Color</Label><Input value={form.color} onChange={(event) => update('color', event.target.value)} placeholder="Medium wash blue" className="mt-2 bg-background/45" /></div><div><Label>Condition</Label><Select value={form.condition} onValueChange={(value) => update('condition', value as Condition)}><SelectTrigger className="mt-2 bg-background/45"><SelectValue /></SelectTrigger><SelectContent>{CONDITIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div><div><Label>List price <span className="text-accent-text">(one price)</span></Label><Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => update('price', event.target.value)} placeholder="0.00" className="mt-2 bg-background/45" /></div><div><Label>What I paid <span className="text-muted-foreground">(acquisition cost)</span></Label><Input type="number" min="0" step="0.01" value={form.cost} onChange={(event) => update('cost', event.target.value)} placeholder="0.00" className="mt-2 bg-background/45" /></div><div><Label>Weight (lb)</Label><Input type="number" min="0" step="0.01" value={form.weight} onChange={(event) => update('weight', event.target.value)} placeholder="For shipping planning" className="mt-2 bg-background/45" /></div><div><Label>SKU</Label><Input value={form.sku} onChange={(event) => update('sku', event.target.value)} placeholder="BIN-A3-014" className="mt-2 bg-background/45" /></div><div><Label>Source location</Label><Input value={form.sourceLocation} onChange={(event) => update('sourceLocation', event.target.value)} placeholder="Goodwill — Downtown" className="mt-2 bg-background/45" /></div><div><Label>Tags</Label><Input value={form.tags} onChange={(event) => update('tags', event.target.value)} placeholder="vintage, denim, jeans" className="mt-2 bg-background/45" /></div><div className="md:col-span-2 xl:col-span-3"><Label>Measurements</Label><Textarea value={form.measurements} onChange={(event) => update('measurements', event.target.value)} placeholder="Waist: 15 in flat · Inseam: 31 in · Rise: 11 in" className="mt-2 min-h-20 bg-background/45" /></div><div className="md:col-span-2 xl:col-span-3"><Label>Description / known details</Label><Textarea value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Describe material, wear, flaws, fit, and anything a buyer should know." className="mt-2 min-h-28 bg-background/45" /></div><div className="md:col-span-2 xl:col-span-3"><Label>Internal notes</Label><Textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Private notes are not included in marketplace drafts." className="mt-2 min-h-20 bg-background/45" /></div></div></section>

      <section id="marketplace-details" className="cx-panel rounded-2xl p-5 sm:p-6"><div><p className="cx-eyebrow">04 / marketplace-ready details</p><h2 className="mt-2 text-lg font-semibold">Every platform field, captured once.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">These saved details cover the documented Poshmark, Depop, and Mercari listing inputs. Marketplace category menus can change, so the final free-form attributes box carries any item-specific dropdown values you must confirm in the live form.</p></div><div className="mt-5 grid gap-4 lg:grid-cols-3"><div className="rounded-xl border border-border bg-background/30 p-4"><p className="font-semibold">Shared product details</p><div className="mt-3 grid gap-3"><div><Label>Department / gender</Label><Input value={marketplaceDetails.department} onChange={(e) => updateMarketplaceDetail('department', e.target.value)} placeholder="Women, Men, Kids…" className="mt-1 bg-background/45" /></div><div><Label>Subcategory</Label><Input value={marketplaceDetails.subcategory} onChange={(e) => updateMarketplaceDetail('subcategory', e.target.value)} placeholder="Jackets, hoodies…" className="mt-1 bg-background/45" /></div><div className="grid grid-cols-2 gap-2"><div><Label>Quantity</Label><Input type="number" min="1" value={marketplaceDetails.quantity} onChange={(e) => updateMarketplaceDetail('quantity', e.target.value)} className="mt-1 bg-background/45" /></div><div><Label>Original / MSRP</Label><Input type="number" min="0" value={marketplaceDetails.originalPrice} onChange={(e) => updateMarketplaceDetail('originalPrice', e.target.value)} className="mt-1 bg-background/45" /></div></div><div><Label>Second color</Label><Input value={marketplaceDetails.secondaryColor} onChange={(e) => updateMarketplaceDetail('secondaryColor', e.target.value)} placeholder="Optional second color" className="mt-1 bg-background/45" /></div><div><Label>Material · pattern · fit</Label><Input value={[marketplaceDetails.material, marketplaceDetails.pattern, marketplaceDetails.fit].filter(Boolean).join(' · ')} onChange={(e) => { const [material = '', pattern = '', fit = ''] = e.target.value.split('·').map((v) => v.trim()); setMarketplaceDetails((d) => ({ ...d, material, pattern, fit })); }} placeholder="Nylon · solid · fitted" className="mt-1 bg-background/45" /></div><div><Label>Flaws / wear disclosure</Label><Textarea value={marketplaceDetails.flaws} onChange={(e) => updateMarketplaceDetail('flaws', e.target.value)} placeholder="State flaws shown in photos…" className="mt-1 min-h-20 bg-background/45" /></div><div><Label>Included items / authenticity</Label><Input value={[marketplaceDetails.includedItems, marketplaceDetails.authenticity].filter(Boolean).join(' · ')} onChange={(e) => { const [includedItems = '', authenticity = ''] = e.target.value.split('·').map((v) => v.trim()); setMarketplaceDetails((d) => ({ ...d, includedItems, authenticity })); }} placeholder="Dust bag · serial verified" className="mt-1 bg-background/45" /></div><div><Label>UPC / GTIN / Product ID</Label><Input value={marketplaceDetails.productId} onChange={(e) => updateMarketplaceDetail('productId', e.target.value)} className="mt-1 bg-background/45" /></div></div></div><div className="rounded-xl border border-border bg-background/30 p-4"><p className="font-semibold">Poshmark controls</p><div className="mt-3 grid gap-3"><div><Label>Shipping discount</Label><Input value={marketplaceDetails.poshShippingDiscount} onChange={(e) => updateMarketplaceDetail('poshShippingDiscount', e.target.value)} placeholder="Blank, FREE, or amount" className="mt-1 bg-background/45" /></div><div><Label>Smart Sell</Label><Select value={marketplaceDetails.poshSmartSellMode} onValueChange={(v) => updateMarketplaceDetail('poshSmartSellMode', v as MarketplaceDetails['poshSmartSellMode'])}><SelectTrigger className="mt-1 bg-background/45"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="off">Off</SelectItem><SelectItem value="minimum_price">Minimum price</SelectItem><SelectItem value="floor_percent">Floor percentage</SelectItem></SelectContent></Select></div>{marketplaceDetails.poshSmartSellMode !== 'off' && <div><Label>{marketplaceDetails.poshSmartSellMode === 'minimum_price' ? 'Minimum price' : 'Floor % off list price'}</Label><Input type="number" min="0" value={marketplaceDetails.poshMinimumPrice} onChange={(e) => updateMarketplaceDetail('poshMinimumPrice', e.target.value)} className="mt-1 bg-background/45" /></div>}<div><Label>Availability</Label><Select value={marketplaceDetails.poshAvailability} onValueChange={(v) => updateMarketplaceDetail('poshAvailability', v as MarketplaceDetails['poshAvailability'])}><SelectTrigger className="mt-1 bg-background/45"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="for_sale">For sale</SelectItem><SelectItem value="not_for_sale">Not for sale</SelectItem><SelectItem value="drops">Drops</SelectItem></SelectContent></Select></div>{marketplaceDetails.poshAvailability === 'drops' && <div><Label>Drop time</Label><Input type="datetime-local" value={marketplaceDetails.poshDropTime} onChange={(e) => updateMarketplaceDetail('poshDropTime', e.target.value)} className="mt-1 bg-background/45" /></div>}</div></div><div className="rounded-xl border border-border bg-background/30 p-4"><p className="font-semibold">Depop & Mercari shipping</p><div className="mt-3 grid gap-3"><div><Label>Depop shipping</Label><Select value={marketplaceDetails.depopShippingMethod} onValueChange={(v) => updateMarketplaceDetail('depopShippingMethod', v as MarketplaceDetails['depopShippingMethod'])}><SelectTrigger className="mt-1 bg-background/45"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="depop_shipping">Depop Shipping</SelectItem><SelectItem value="own_shipping">My tracked shipping</SelectItem></SelectContent></Select></div><div className="grid grid-cols-2 gap-2"><div><Label>Domestic price</Label><Input type="number" min="0" value={marketplaceDetails.depopDomesticShipping} onChange={(e) => updateMarketplaceDetail('depopDomesticShipping', e.target.value)} className="mt-1 bg-background/45" /></div><div><Label>International price</Label><Input type="number" min="0" value={marketplaceDetails.depopInternationalShipping} onChange={(e) => updateMarketplaceDetail('depopInternationalShipping', e.target.value)} className="mt-1 bg-background/45" /></div></div><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={marketplaceDetails.depopWorldwide} onChange={(e) => updateMarketplaceDetail('depopWorldwide', e.target.checked)} />Offer worldwide shipping</label><div><Label>Bundle / shipping note</Label><Input value={marketplaceDetails.depopBundleInfo} onChange={(e) => updateMarketplaceDetail('depopBundleInfo', e.target.value)} className="mt-1 bg-background/45" /></div><div><Label>Mercari method & payer</Label><div className="mt-1 grid grid-cols-2 gap-2"><Select value={marketplaceDetails.mercariShippingMethod} onValueChange={(v) => updateMarketplaceDetail('mercariShippingMethod', v as MarketplaceDetails['mercariShippingMethod'])}><SelectTrigger className="bg-background/45"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="prepaid_label">Prepaid label</SelectItem><SelectItem value="ship_on_own">Ship on my own</SelectItem></SelectContent></Select><Select value={marketplaceDetails.mercariPayer} onValueChange={(v) => updateMarketplaceDetail('mercariPayer', v as MarketplaceDetails['mercariPayer'])}><SelectTrigger className="bg-background/45"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="buyer">Buyer pays</SelectItem><SelectItem value="seller">I pay</SelectItem></SelectContent></Select></div></div><div className="grid grid-cols-3 gap-2"><div><Label>L</Label><Input value={marketplaceDetails.mercariPackageLength} onChange={(e) => updateMarketplaceDetail('mercariPackageLength', e.target.value)} className="mt-1 bg-background/45" /></div><div><Label>W</Label><Input value={marketplaceDetails.mercariPackageWidth} onChange={(e) => updateMarketplaceDetail('mercariPackageWidth', e.target.value)} className="mt-1 bg-background/45" /></div><div><Label>H</Label><Input value={marketplaceDetails.mercariPackageHeight} onChange={(e) => updateMarketplaceDetail('mercariPackageHeight', e.target.value)} className="mt-1 bg-background/45" /></div></div><div><Label>Origin ZIP · Smart Pricing floor</Label><Input value={[marketplaceDetails.mercariOriginPostal, marketplaceDetails.mercariSmartPriceFloor].filter(Boolean).join(' · ')} onChange={(e) => { const [mercariOriginPostal = '', mercariSmartPriceFloor = ''] = e.target.value.split('·').map((v) => v.trim()); setMarketplaceDetails((d) => ({ ...d, mercariOriginPostal, mercariSmartPriceFloor })); }} placeholder="90210 · $28" className="mt-1 bg-background/45" /></div></div></div></div><div className="mt-4"><Label>Category-specific attributes still shown by a marketplace</Label><Textarea value={marketplaceDetails.categoryAttributes} onChange={(e) => updateMarketplaceDetail('categoryAttributes', e.target.value)} placeholder="Example: sleeve length: long; closure: zip; occasion: outdoor; manufacturer style code: … Save every category-specific option here so it is ready to copy into the live marketplace form." className="mt-2 min-h-20 bg-background/45" /></div></section>

      <section className="cx-panel rounded-2xl p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="cx-eyebrow">05 / net proceeds & profit</p><h2 className="mt-2 text-lg font-semibold">One list price. Three fee-aware outcomes.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">These are US planning estimates, not marketplace quotes. Adjust shipping assumptions below and confirm current fees before you post or accept an offer.</p></div><span className="rounded-full border border-success/35 bg-success/10 px-3 py-2 font-mono text-[0.6rem] uppercase tracking-wider text-success">List price {money(safeNumber(form.price))}</span></div><div className="mt-5 overflow-x-auto rounded-xl border border-border"><table className="min-w-[760px] w-full text-left text-sm"><thead className="border-b border-border bg-background/45 font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Platform</th><th className="px-4 py-3">Estimated fee</th><th className="px-4 py-3">Net proceeds</th><th className="px-4 py-3">Est. profit</th><th className="px-4 py-3">Planning note</th></tr></thead><tbody className="divide-y divide-border/70">{proceeds.map((row) => <tr key={row.platform}><td className="px-4 py-3 font-semibold text-foreground">{row.platform}</td><td className="px-4 py-3 text-muted-foreground">{money(row.fee)}</td><td className="px-4 py-3 font-semibold text-accent-text">{money(row.net)}</td><td className={`px-4 py-3 font-semibold ${row.profit >= 0 ? 'text-success' : 'text-destructive'}`}>{money(row.profit)}</td><td className="max-w-sm px-4 py-3 text-xs leading-5 text-muted-foreground">{row.note}</td></tr>)}</tbody></table></div><div className="mt-5 grid gap-4 lg:grid-cols-3"><div className="rounded-xl border border-border bg-background/30 p-4"><p className="text-sm font-semibold">Poshmark</p><Label className="mt-3 block text-xs">Seller label upgrade / overage</Label><Input type="number" min="0" step="0.01" value={fees.poshmarkOverage} onChange={(event) => updateFee('poshmarkOverage', event.target.value)} placeholder="0.00" className="mt-1.5 bg-background/45" /><p className="mt-2 text-xs leading-5 text-muted-foreground">$2.95 below $15; 20% at $15+. Standard buyer shipping is not added to your proceeds.</p></div><div className="rounded-xl border border-border bg-background/30 p-4"><p className="text-sm font-semibold">Depop (US)</p><Label className="mt-3 block text-xs">Buyer shipping</Label><Input type="number" min="0" step="0.01" value={fees.depopBuyerShipping} onChange={(event) => updateFee('depopBuyerShipping', event.target.value)} placeholder="0.00" className="mt-1.5 bg-background/45" /><Label className="mt-3 block text-xs">Seller-funded shipping</Label><Input type="number" min="0" step="0.01" value={fees.depopSellerShipping} onChange={(event) => updateFee('depopSellerShipping', event.target.value)} placeholder="0.00" className="mt-1.5 bg-background/45" /><label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={fees.depopBoosted} onChange={(event) => updateFee('depopBoosted', event.target.checked)} /> Include 12% boosted-listing fee</label></div><div className="rounded-xl border border-border bg-background/30 p-4"><p className="text-sm font-semibold">Mercari</p><Select value={fees.mercariShippingMode} onValueChange={(value) => updateFee('mercariShippingMode', value as FeeAssumptions['mercariShippingMode'])}><SelectTrigger className="mt-3 bg-background/45"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="buyer">Buyer pays shipping</SelectItem><SelectItem value="seller">I offer free shipping</SelectItem></SelectContent></Select>{fees.mercariShippingMode === 'buyer' ? <><Label className="mt-3 block text-xs">Buyer-paid shipping</Label><Input type="number" min="0" step="0.01" value={fees.mercariBuyerShipping} onChange={(event) => updateFee('mercariBuyerShipping', event.target.value)} placeholder="0.00" className="mt-1.5 bg-background/45" /></> : <><Label className="mt-3 block text-xs">Your estimated shipping cost</Label><Input type="number" min="0" step="0.01" value={fees.mercariSellerShipping} onChange={(event) => updateFee('mercariSellerShipping', event.target.value)} placeholder="0.00" className="mt-1.5 bg-background/45" /></>}</div></div><p className="mt-4 text-[0.68rem] leading-5 text-muted-foreground">Fee basis: <a className="text-accent-text underline-offset-4 hover:underline" href="https://support.poshmark.com/s/article/297755057" target="_blank" rel="noreferrer">Poshmark</a>, <a className="text-accent-text underline-offset-4 hover:underline" href="https://depophelp.zendesk.com/hc/en-gb/articles/360001791127-Seller-fees-and-charges" target="_blank" rel="noreferrer">Depop</a>, and <a className="text-accent-text underline-offset-4 hover:underline" href="https://www.mercari.com/us/help_center/article/169/" target="_blank" rel="noreferrer">Mercari</a>. Platform policies and taxes can change.</p></section>

      <section className="cx-panel rounded-2xl p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="cx-eyebrow">05 / P · D · M readiness</p><h2 className="mt-2 text-lg font-semibold">Generate drafts, then monitor each item once.</h2><p className="mt-2 text-sm text-muted-foreground">“Needs posted” means the CrossLinkOS draft is complete but is not yet confirmed in that marketplace.</p></div>{drafts.length > 0 && <Link href="/listings" className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-4 py-2.5 text-sm font-bold text-accent-text hover:bg-primary/20">Open Draft Board <ArrowRight size={16} /></Link>}</div>{drafts.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-border bg-background/30 p-7 text-center"><p className="font-semibold">No platform drafts yet</p><p className="mt-2 text-sm text-muted-foreground">Save your item, then generate Poshmark, Depop, and Mercari drafts from the sticky action bar below.</p></div> : <div className="mt-5 grid gap-3 md:grid-cols-3">{drafts.map((draft) => <article key={draft.id} className="rounded-xl border border-border bg-background/35 p-4"><div className="flex items-center justify-between"><span className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-accent-text">{draft.marketplace}</span><span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-[0.54rem] uppercase text-accent-text">{statusLabel(draft.status)}</span></div><h3 className="mt-4 line-clamp-2 font-semibold text-foreground">{draft.title || form.title}</h3>{draft.missingFields.length > 0 ? <p className="mt-3 text-xs text-warning">Needs: {draft.missingFields.join(', ')}</p> : <p className="mt-3 flex items-center gap-1.5 text-xs text-success"><Check size={14} /> Ready for your review</p>}</article>)}</div>}</section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.3fr]"><div className="cx-panel rounded-2xl p-5 sm:p-6"><p className="cx-eyebrow">06 / sale handoff</p><h2 className="mt-2 text-lg font-semibold">Record a sale</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Select where it sold. The item then moves to sold records with remaining-platform delisting tasks and its pull–print–pack–ship checklist.</p><div className="mt-5 grid grid-cols-2 gap-3"><div><Label>Sold on</Label><Select value={salePlatform} onValueChange={(value) => setSalePlatform(value as Marketplace)}><SelectTrigger className="mt-2 bg-background/45"><SelectValue /></SelectTrigger><SelectContent>{MARKETPLACES.map((platform) => <SelectItem key={platform} value={platform} className="capitalize">{platform}</SelectItem>)}</SelectContent></Select></div><div><Label>Sale price</Label><Input type="number" min="0" step="0.01" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} placeholder="0.00" className="mt-2 bg-background/45" /></div></div><button type="button" onClick={markSold} disabled={isMarkingSold} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm font-bold text-success hover:bg-success/15 disabled:opacity-50">{isMarkingSold ? <Loader2 className="animate-spin" size={16} /> : <PackageCheck size={16} />}{isMarkingSold ? 'Recording sale…' : 'Record sale and start fulfillment'}</button></div><div className="cx-panel rounded-2xl p-5 sm:p-6"><p className="cx-eyebrow">Lifecycle promise</p><h2 className="mt-2 text-lg font-semibold">No lost inventory after a sale</h2><div className="mt-5 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3"><div className="rounded-lg border border-border bg-background/30 p-3"><p className="font-mono text-[0.6rem] text-accent-text">01 / SOLD ON</p><p className="mt-2">See the platform and final sale amount.</p></div><div className="rounded-lg border border-border bg-background/30 p-3"><p className="font-mono text-[0.6rem] text-accent-text">02 / DELIST</p><p className="mt-2">Track each remaining P/D/M listing until you confirm it is removed.</p></div><div className="rounded-lg border border-border bg-background/30 p-3"><p className="font-mono text-[0.6rem] text-accent-text">03 / FULFILL</p><p className="mt-2">Pull, print, pack, ship, and record delivery steps.</p></div></div></div></section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-background/95 px-4 py-3 backdrop-blur-xl lg:left-[248px] lg:px-10"><div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className={`h-2 w-2 rounded-full ${itemId ? 'bg-success' : 'bg-primary'}`} />{itemId ? 'Changes save to your canonical listing.' : 'Save this item before preparing marketplace drafts.'}</div><div className="grid grid-cols-3 gap-2 sm:flex"><button type="button" onClick={saveAndContinue} disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-3 py-2.5 text-xs font-bold text-background hover:brightness-110 disabled:opacity-50">{isSaving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}{isSaving ? 'Saving' : 'Save & Continue'}</button><button type="button" onClick={() => requestAiAssist('all')} disabled={isAssisting} className="inline-flex items-center justify-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2.5 text-xs font-bold text-success hover:bg-success/15 disabled:opacity-50"><Sparkles size={15} />AI assist</button><button type="button" onClick={generateMarketplaceDrafts} disabled={isGeneratingDrafts} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background/55 px-3 py-2.5 text-xs font-bold text-foreground hover:border-primary/40 disabled:opacity-50">{isGeneratingDrafts ? <Loader2 className="animate-spin" size={15} /> : <ArrowRight size={15} />}{isGeneratingDrafts ? 'Preparing' : 'Generate P/D/M'}</button></div></div></div>
    </div>
  );
}
