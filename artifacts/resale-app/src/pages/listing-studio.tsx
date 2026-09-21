import { PageHeader } from '@/components/PageHeader';
import { cutOutWholeItem } from '@/lib/cutout';
import { photoForVision } from '@/lib/downscale';
import PricingPanel from '@/components/PricingPanel';
import { initialShip, takeHome, type ShipAssumptions } from '@/lib/pricing';
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  Copy,
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
  copyOrigin?: 'seller' | 'ai' | 'template';
  copyReason?: string | null;
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
type QuickSuggestion = { kind: 'title' | 'tags'; value: string; confidence: string };
type PlatformCopyState = { title: string; description: string; hashtags: string[] };
type CopyInfo = { warnings: string[]; hints: string[]; source: 'ai' | 'template'; model: string | null; reason?: string; limits: { title: number; description: number; titleVerified: boolean; descriptionVerified: boolean }; trendsUsed: string[] };
type CopyMeta = { trendsAsOf: string; playbooks: Record<string, { voice: string; sources: Array<{ label: string; url?: string; kind: string }>; hashtags: { min: number; max: number } }> };
type PhotoFieldKey = 'title' | 'brand' | 'model' | 'category' | 'subcategory' | 'department' | 'color' | 'secondaryColor' | 'material' | 'pattern' | 'style' | 'size' | 'flaws';
type PhotoReadResult = { unsure: string[]; model: string; photosRead: number };
type ChatMessage = { role: 'user' | 'assistant'; text: string; suggestions?: string[] };
type MarketplaceDetails = {
  department: string; subcategory: string; quantity: string; originalPrice: string; secondaryColor: string; material: string; pattern: string; style: string; fit: string; flaws: string; includedItems: string; authenticity: string; productId: string;
  poshShippingDiscount: string; poshSmartSellMode: 'off' | 'minimum_price' | 'floor_percent'; poshMinimumPrice: string; poshAvailability: 'draft' | 'for_sale' | 'not_for_sale' | 'drops'; poshDropTime: string;
  depopShippingMethod: 'depop_shipping' | 'own_shipping'; depopDomesticShipping: string; depopWorldwide: boolean; depopInternationalShipping: string; depopBundleInfo: string;
  mercariShippingMethod: 'prepaid_label' | 'ship_on_own'; mercariPayer: 'buyer' | 'seller'; mercariPackageLength: string; mercariPackageWidth: string; mercariPackageHeight: string; mercariOriginPostal: string; mercariSmartPriceFloor: string;
  categoryAttributes: string;
  /** Per-platform listing copy written in section 04. Saved with the item and used for the drafts. */
  platformCopy: Partial<Record<Marketplace, PlatformCopyState>>;
};

const initialForm: CanonicalForm = {
  title: '', description: '', brand: '', model: '', category: '', size: '', color: '', measurements: '', sku: '', notes: '', sourceLocation: '', sourceUrl: '',
  condition: 'good', status: 'draft', price: '', cost: '', weight: '', tags: '',
};
const initialMarketplaceDetails: MarketplaceDetails = {
  department: '', subcategory: '', quantity: '1', originalPrice: '', secondaryColor: '', material: '', pattern: '', style: '', fit: '', flaws: '', includedItems: '', authenticity: '', productId: '',
  poshShippingDiscount: '', poshSmartSellMode: 'off', poshMinimumPrice: '', poshAvailability: 'draft', poshDropTime: '',
  depopShippingMethod: 'depop_shipping', depopDomesticShipping: '', depopWorldwide: false, depopInternationalShipping: '', depopBundleInfo: '',
  mercariShippingMethod: 'prepaid_label', mercariPayer: 'buyer', mercariPackageLength: '', mercariPackageWidth: '', mercariPackageHeight: '', mercariOriginPostal: '', mercariSmartPriceFloor: '', categoryAttributes: '', platformCopy: {},
};

const PHOTO_FIELDS: Array<{ key: PhotoFieldKey; label: string }> = [
  { key: 'title', label: 'Title' }, { key: 'brand', label: 'Brand' }, { key: 'model', label: 'Model / style' }, { key: 'category', label: 'Category' }, { key: 'subcategory', label: 'Subcategory' },
  { key: 'department', label: 'Department' }, { key: 'color', label: 'Color' }, { key: 'secondaryColor', label: 'Second color' }, { key: 'material', label: 'Material' },
  { key: 'pattern', label: 'Pattern' }, { key: 'style', label: 'Style' }, { key: 'size', label: 'Size' }, { key: 'flaws', label: 'Visible flaws' },
];
const PLATFORM_BLURB: Record<Marketplace, string> = {
  poshmark: 'Long and detailed, with measurements and a hashtag line. Poshmark shoppers compare and bundle.',
  depop: 'Short, casual and trend-aware. The first line is your search title, then a few punchy lines and up to 5 hashtags.',
  mercari: 'Plain, factual and easy to skim. Brand up front, honest condition, at most 3 hashtags.',
};
const PLATFORM_NAME: Record<Marketplace, string> = { poshmark: 'Poshmark', depop: 'Depop', mercari: 'Mercari' };

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
      const finish = () => { const longSide = Math.max(canvas.width, canvas.height); context.shadowColor = 'rgba(30, 24, 20, 0.28)'; context.shadowBlur = Math.round(longSide * 0.014); context.shadowOffsetY = Math.round(longSide * 0.006); /* soft contact shadow so white items stay visible on the white backdrop */ context.drawImage(image, 0, 0, canvas.width, canvas.height); context.shadowColor = 'transparent'; canvas.toBlob((result) => { URL.revokeObjectURL(objectUrl); if (!result) { reject(new Error('Could not create the processed image')); return; } resolve(result); }, 'image/png'); };
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
  const [ship, setShip] = useState<ShipAssumptions>(initialShip);
  const [marketplaceDetails, setMarketplaceDetails] = useState<MarketplaceDetails>(initialMarketplaceDetails);
  const [itemId, setItemId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<MarketplaceDraft[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false);
  const [copyNotice, setCopyNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [copyInfo, setCopyInfo] = useState<Partial<Record<Marketplace, CopyInfo>>>({});
  const [copyMeta, setCopyMeta] = useState<CopyMeta | null>(null);
  const [copyTab, setCopyTab] = useState<Marketplace>('poshmark');
  const [writing, setWriting] = useState<Marketplace[]>([]);
  const [quick, setQuick] = useState<QuickSuggestion | null>(null);
  const [quickBusy, setQuickBusy] = useState<'title' | 'tags' | null>(null);
  const [photoReading, setPhotoReading] = useState(false);
  const [photoNotice, setPhotoNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [photoResult, setPhotoResult] = useState<PhotoReadResult | null>(null);
  const [photoEdit, setPhotoEdit] = useState<Partial<Record<PhotoFieldKey, string>>>({});
  const [photoPick, setPhotoPick] = useState<Partial<Record<PhotoFieldKey, boolean>>>({});
  const [chatInput, setChatInput] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([{ role: 'assistant', text: 'Ask me about your title, tags, fees or pricing. I only use the facts you enter.' }]);
  const [isChatting, setIsChatting] = useState(false);
  const [salePlatform, setSalePlatform] = useState<Marketplace>('poshmark');
  const [salePrice, setSalePrice] = useState('');
  const [isMarkingSold, setIsMarkingSold] = useState(false);

  const activePhotos = useMemo(() => photos.map((photo) => photo.active === 'processed' && photo.processed ? photo.processed : photo.original), [photos]);
  const proceeds = useMemo(() => takeHome(safeNumber(form.price), ship, safeNumber(form.weight), safeNumber(form.cost)).map((row) => ({ platform: row.platform, net: row.net, profit: row.profit })), [ship, form.cost, form.price, form.weight]);

  const update = <K extends keyof CanonicalForm>(key: K, value: CanonicalForm[K]) => setForm((current) => ({ ...current, [key]: value }));
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
      const source = await (await fetch(target.original)).blob();
      const { blob: foreground, grown } = await Promise.race([
        cutOutWholeItem(source),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Background removal took too long. Keep the original photo or try again on a faster connection.')), BACKGROUND_REMOVAL_TIMEOUT_MS)),
      ]);
      const processed = await toDataUrl(await createBackdrop(foreground, backgroundStyle));
      setPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, processed, active: 'processed', processingStatus: 'processed', backgroundStyle } : photo));
      toast({ title: backgroundStyle === 'white' ? 'White-background photo ready' : 'Textured flat-lay photo ready', description: grown ? 'The whole item is kept, not just the print. Check the edges, and use the revert button for the original if needed.' : 'Preview it below; you can revert to the original at any time.' });
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

  const currentFor = (key: PhotoFieldKey): string => {
    if (key === 'title' || key === 'brand' || key === 'model' || key === 'category' || key === 'color' || key === 'size') return form[key];
    return marketplaceDetails[key];
  };

  const readMyPhotos = async () => {
    setPhotoNotice(null);
    if (photos.length === 0) { setPhotoNotice({ tone: 'error', text: 'Add at least one photo first. The AI reads what is in your photos.' }); return; }
    setPhotoReading(true);
    setPhotoResult(null);
    try {
      const shrunk = await Promise.all(photos.slice(0, 3).map((photo) => photoForVision(photo.original)));
      const response = await apiFetch('/api/workflow/photo-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photos: shrunk, hints: { title: form.title || undefined, brand: form.brand || undefined, category: form.category || undefined } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The AI could not read the photos.');
      const draft: Partial<Record<PhotoFieldKey, string>> = {};
      const pick: Partial<Record<PhotoFieldKey, boolean>> = {};
      for (const { key } of PHOTO_FIELDS) {
        const value = key === 'flaws' ? (Array.isArray(data.flaws) ? data.flaws.join('; ') : '') : typeof data[key] === 'string' ? data[key] : '';
        if (!value) continue;
        draft[key] = value;
        pick[key] = !currentFor(key).trim();
      }
      setPhotoEdit(draft);
      setPhotoPick(pick);
      setPhotoResult({ unsure: Array.isArray(data.unsure) ? data.unsure : [], model: data.model, photosRead: data.photosRead ?? 1 });
      setPhotoNotice(Object.keys(draft).length ? { tone: 'info', text: `Read ${data.photosRead ?? 1} photo${data.photosRead === 1 ? '' : 's'}. Boxes are ticked only for fields that are still empty. Edit anything, then apply.` } : { tone: 'error', text: 'The AI could not make out enough in these photos. Try a clearer cover photo, or add a close-up of the tag.' });
    } catch (error) {
      setPhotoNotice({ tone: 'error', text: `${error instanceof Error ? error.message : 'The AI could not read the photos.'} Nothing was changed. You can fill the form by hand.` });
    } finally { setPhotoReading(false); }
  };

  const applyPhotoFields = () => {
    const formPatch: Partial<CanonicalForm> = {};
    const detailPatch: Partial<MarketplaceDetails> = {};
    let count = 0;
    for (const { key } of PHOTO_FIELDS) {
      const value = (photoEdit[key] ?? '').trim();
      if (!photoPick[key] || !value) continue;
      count++;
      if (key === 'title' || key === 'brand' || key === 'model' || key === 'category' || key === 'color' || key === 'size') formPatch[key] = value;
      else (detailPatch as Record<string, string>)[key] = value;
    }
    if (!count) { setPhotoNotice({ tone: 'error', text: 'Tick at least one field to apply.' }); return; }
    setForm((current) => ({ ...current, ...formPatch }));
    setMarketplaceDetails((current) => ({ ...current, ...detailPatch }));
    setPhotoResult(null);
    setPhotoNotice({ tone: 'info', text: `${count} field${count === 1 ? '' : 's'} filled in below. Check them against the item, then continue.` });
    window.requestAnimationFrame(() => document.getElementById('listing-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const copyFacts = () => ({
    title: form.title.trim(), description: form.description || undefined, brand: form.brand || undefined, model: form.model || undefined, category: form.category || undefined,
    subcategory: marketplaceDetails.subcategory || undefined, department: marketplaceDetails.department || undefined, size: form.size || undefined, color: form.color || undefined,
    secondaryColor: marketplaceDetails.secondaryColor || undefined, condition: form.condition, measurements: form.measurements || undefined, material: marketplaceDetails.material || undefined,
    pattern: marketplaceDetails.pattern || undefined, fit: marketplaceDetails.fit || undefined, style: marketplaceDetails.style || undefined, flaws: marketplaceDetails.flaws || undefined,
    includedItems: marketplaceDetails.includedItems || undefined, authenticity: marketplaceDetails.authenticity || undefined, bundleInfo: marketplaceDetails.depopBundleInfo || undefined,
    originalPrice: marketplaceDetails.originalPrice || undefined, tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
  });

  const writeCopy = async (platforms: Marketplace[] = [...MARKETPLACES]) => {
    setCopyNotice(null);
    if (!form.title.trim()) { setCopyNotice({ tone: 'error', text: 'Add an item title in section 02 first. The writer only uses the facts you enter.' }); return; }
    setWriting(platforms);
    try {
      const response = await apiFetch('/api/workflow/listing-copy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...copyFacts(), platforms }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The listing writer is unavailable.');
      const copies = data.copies as Record<string, PlatformCopyState & CopyInfo & { platform: Marketplace; source: 'ai' | 'template' }>;
      setMarketplaceDetails((current) => {
        const next = { ...current.platformCopy };
        for (const platform of platforms) { const copy = copies[platform]; if (copy) next[platform] = { title: copy.title, description: copy.description, hashtags: copy.hashtags }; }
        return { ...current, platformCopy: next };
      });
      setCopyInfo((current) => {
        const next = { ...current };
        for (const platform of platforms) { const copy = copies[platform]; if (copy) next[platform] = { warnings: copy.warnings, hints: copy.hints, source: copy.source, model: copy.model, reason: copy.reason, limits: copy.limits, trendsUsed: copy.trendsUsed }; }
        return next;
      });
      setCopyMeta({ trendsAsOf: data.trendsAsOf, playbooks: data.playbooks });
      setCopyTab(platforms[0]);
      const templated = platforms.filter((platform) => copies[platform]?.source === 'template');
      if (data.aiProblem) setCopyNotice({ tone: 'error', text: `${data.aiProblem} Showing plain templates built only from your entries, nothing invented. Try again in a minute.` });
      else if (templated.length) setCopyNotice({ tone: 'error', text: `The AI could not write ${templated.map((platform) => PLATFORM_NAME[platform]).join(' and ')}, so those tabs hold a plain template. Use Rewrite on that tab to try again.` });
      else setCopyNotice({ tone: 'info', text: 'Copy ready. Edit any tab, then Save. Saved copy is what your drafts and the browser extension use.' });
    } catch (error) {
      setCopyNotice({ tone: 'error', text: `${error instanceof Error ? error.message : 'The listing writer is unavailable.'} You can keep editing by hand.` });
    } finally { setWriting([]); }
  };

  const editCopyText = (platform: Marketplace, description: string) => {
    const hashtags = Array.from(description.matchAll(/#([A-Za-z0-9_]+)/g)).map((match) => match[1].toLowerCase());
    setMarketplaceDetails((current) => {
      const previous = current.platformCopy[platform] ?? { title: '', description: '', hashtags: [] };
      // Depop has no title box: its first line is the title.
      const title = platform === 'depop' ? description.split('\n')[0].trim() : previous.title;
      return { ...current, platformCopy: { ...current.platformCopy, [platform]: { title, description, hashtags } } };
    });
  };
  const editCopyTitle = (platform: Marketplace, title: string) => setMarketplaceDetails((current) => ({ ...current, platformCopy: { ...current.platformCopy, [platform]: { ...(current.platformCopy[platform] ?? { description: '', hashtags: [] }), title } } }));

  const copyToClipboard = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: `${label} copied` }); } catch { toast({ title: 'Could not copy', description: 'Select the text and copy it by hand.', variant: 'destructive' }); }
  };

  const requestQuick = async (kind: 'title' | 'tags') => {
    setCopyNotice(null);
    setQuick(null);
    if (!form.title.trim()) { setCopyNotice({ tone: 'error', text: 'Add an item title in section 02 first. The AI works from the facts you enter.' }); return; }
    setQuickBusy(kind);
    try {
      const response = await apiFetch('/api/workflow/ai-assist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        focus: kind, title: form.title.trim(), description: form.description || undefined, brand: form.brand || undefined, model: form.model || undefined, category: form.category || undefined,
        size: form.size || undefined, color: form.color || undefined, measurements: form.measurements || undefined, material: marketplaceDetails.material || undefined,
        flaws: marketplaceDetails.flaws || undefined, condition: form.condition, tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The AI could not answer right now.');
      const value = kind === 'title' ? String(data.title || '') : Array.isArray(data.tags) ? data.tags.join(', ') : '';
      if (!value) throw new Error('The AI did not return anything usable.');
      setQuick({ kind, value, confidence: data.confidence || 'Review before using' });
    } catch (error) {
      setCopyNotice({ tone: 'error', text: `${error instanceof Error ? error.message : 'The AI could not answer right now.'} Nothing was changed.` });
    } finally { setQuickBusy(null); }
  };

  const applyQuick = () => {
    if (!quick) return;
    if (quick.kind === 'title') update('title', quick.value); else update('tags', quick.value);
    setQuick(null);
    toast({ title: quick.kind === 'title' ? 'Title updated' : 'Tags updated', description: 'Review it, then save your listing.' });
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
      <PageHeader
        label="Listing studio / canonical record"
        title="Build once. Prepare everywhere."
        description="Create one truthful item record, compare take-home money before you pick a price, and prepare reviewable Poshmark, Depop and Mercari drafts."
        actions={
          <div className="flex flex-wrap gap-2 text-[0.625rem] font-medium uppercase tracking-[0.04em]">
            <span className="border border-border bg-card px-3 py-2 text-muted-foreground">{photos.length}/{MAX_PHOTOS} photos</span>
            <span className={`inline-flex items-center gap-2 border border-border px-3 py-2 ${itemId ? 'bg-card text-foreground' : 'bg-accent-tint text-foreground'}`}>{itemId ? <span className="cx-status-dot" /> : <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-muted-foreground" />}{itemId ? `record #${itemId} saved` : 'unsaved draft'}</span>
          </div>
        }
      />

      <section className="grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
        <div className="cx-panel rounded-none p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between"><div><p className="cx-eyebrow">01 / product images</p><h2 className="mt-2 text-lg font-semibold">Photo workbench</h2><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setBackgroundStyle('white')} className={`rounded-none border px-2.5 py-1.5 text-[0.62rem] font-semibold ${backgroundStyle === 'white' ? 'border-border bg-accent-tint text-foreground' : 'border-border text-muted-foreground'}`}>White studio</button><button type="button" onClick={() => setBackgroundStyle('textured_slate')} className={`rounded-none border px-2.5 py-1.5 text-[0.62rem] font-semibold ${backgroundStyle === 'textured_slate' ? 'border-border bg-accent-tint text-foreground' : 'border-border text-muted-foreground'}`}>Gray textured flat lay</button></div></div><button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-none border border-border bg-accent-tint px-3 py-2 text-xs font-bold text-foreground transition hover:bg-accent-tint"><ImagePlus size={15} /> Add photos</button></div>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && addFiles(event.target.files)} />
          <div onDrop={(event: DragEvent) => { event.preventDefault(); setIsDragging(false); addFiles(event.dataTransfer.files); }} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onClick={() => photos.length === 0 && inputRef.current?.click()} className={`rounded-none border border-dashed p-5 transition ${isDragging ? 'border-border bg-accent-tint' : 'border-border bg-card'} ${photos.length === 0 ? 'cursor-pointer' : ''}`}>
            {photos.length === 0 ? <div className="flex min-h-44 flex-col items-center justify-center text-center"><span className="mb-4 flex h-12 w-12 items-center justify-center rounded-none border border-border bg-accent-tint text-foreground"><ImagePlus size={23} /></span><p className="font-semibold">Drop product photos here</p><p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">JPG, PNG, or WEBP up to 12 MB each. Originals are always kept so you can revert after processing.</p></div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo, index) => <div key={photo.id} className="group overflow-hidden rounded-none border border-border bg-card"><div className="relative aspect-square"><img src={photo.active === 'processed' && photo.processed ? photo.processed : photo.original} alt={`Product ${index + 1}`} className="h-full w-full object-cover" />{index === 0 && <span className="absolute left-2 top-2 rounded bg-card px-2 py-1 font-semibold text-[0.55rem] text-foreground">COVER</span>}{photo.processingStatus === 'processing' && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card"><Loader2 className="animate-spin text-foreground" size={22} /><span className="font-semibold text-[0.55rem] text-foreground">CUTTING OUT</span></div>}</div><div className="space-y-2 p-2.5"><div className="flex items-center justify-between font-semibold text-[0.55rem] uppercase"><span className={photo.processingStatus === 'processed' ? 'text-foreground' : photo.processingStatus === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{photo.processingStatus === 'processed' ? photo.backgroundStyle === 'textured_slate' ? 'textured bg ready' : 'white bg ready' : photo.processingStatus === 'failed' ? 'retry available' : 'original'}</span><button type="button" onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))} className="text-muted-foreground hover:text-destructive" aria-label="Remove photo"><Trash2 size={13} /></button></div><div className="flex gap-2">{photo.processingStatus !== 'processing' && <button type="button" onClick={() => processPhoto(photo.id)} className="flex flex-1 items-center justify-center gap-1 rounded-none border border-border bg-accent-tint px-2 py-1.5 text-[0.62rem] font-semibold text-foreground hover:bg-accent-tint"><Wand2 size={12} /> {backgroundStyle === 'white' ? 'White BG' : 'Textured BG'}</button>}{photo.processed && <button type="button" onClick={() => setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, active: item.active === 'processed' ? 'original' : 'processed' } : item))} className="rounded-none border border-border px-2 py-1.5 text-muted-foreground hover:text-foreground" title="Toggle original and processed"><RotateCcw size={12} /></button>}</div></div></div>)}</div>}
          </div>
          {photos.length > 0 && <div className="mt-4 flex flex-col gap-3 rounded-none border border-border bg-accent-tint p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-muted-foreground">Photos are ready. Let the AI read them (right), or continue straight into the item record below.</p><button type="button" onClick={() => document.getElementById('listing-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-none border border-border bg-accent-tint px-3 py-2 text-xs font-bold text-foreground hover:bg-accent-tint">Continue to fields <ArrowRight size={14} /></button></div>}
        </div>

        <aside className="cx-panel rounded-none p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="cx-eyebrow">✦ AI · reads your photos</p><h2 className="mt-2 text-lg font-semibold">Start from your photos</h2><p className="mt-2 text-sm leading-5 text-muted-foreground">Add photos, then let the AI look at them. It proposes a title, brand, color, category and any flaws it can see. You check every field before anything is filled in.</p></div><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-border bg-success-tint text-foreground"><Camera size={17} /></span></div>
          <button type="button" onClick={readMyPhotos} disabled={photoReading || photos.length === 0} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-none border-2 border-foreground bg-primary px-4 py-3 text-xs font-extrabold uppercase tracking-[0.05em] text-primary-foreground hover:bg-accent-hover disabled:border-muted-foreground disabled:bg-muted disabled:text-muted-foreground">{photoReading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{photoReading ? 'Reading your photos…' : 'Read my photos'}</button>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{photos.length === 0 ? 'Add a photo on the left to switch this on.' : 'Uses your first 3 photos as small copies. Your originals are never changed. Add a close-up of the tag to help it find the brand and size.'}</p>
          {photoNotice && <p role={photoNotice.tone === 'error' ? 'alert' : 'status'} className={`mt-4 border-2 border-border px-3 py-2 text-xs font-semibold text-foreground ${photoNotice.tone === 'error' ? 'border-l-[10px] border-l-destructive bg-warning-tint' : 'bg-success-tint'}`}>{photoNotice.text}</p>}
          {photoResult && (
            <div className="mt-4 space-y-3 rounded-none border border-border bg-success-tint p-4">
              <p className="text-xs font-bold text-foreground">What the AI sees <span className="font-medium text-muted-foreground">· editable · nothing is filled until you apply</span></p>
              <div className="grid gap-2.5">
                {PHOTO_FIELDS.filter(({ key }) => photoEdit[key] !== undefined).map(({ key, label }) => (
                  <div key={key} className="grid grid-cols-[auto_1fr] items-start gap-x-2.5 gap-y-1">
                    <input type="checkbox" checked={Boolean(photoPick[key])} onChange={(event) => setPhotoPick((current) => ({ ...current, [key]: event.target.checked }))} aria-label={`Use ${label}`} className="mt-2.5 h-4 w-4" />
                    <div>
                      <Label className="text-[0.68rem]">{label}</Label>
                      <Input value={photoEdit[key] ?? ''} onChange={(event) => setPhotoEdit((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 bg-card text-xs" />
                      {currentFor(key).trim() && currentFor(key).trim() !== (photoEdit[key] ?? '').trim() && <p className="mt-1 text-[0.65rem] text-muted-foreground">Currently: {currentFor(key)}</p>}
                    </div>
                  </div>
                ))}
              </div>
              {photoResult.unsure.length > 0 && <p className="text-[0.68rem] leading-5 text-muted-foreground">Could not tell from the photos: {photoResult.unsure.join(', ')}. Check the tags and fill these in yourself.</p>}
              <div className="flex gap-2">
                <button type="button" onClick={applyPhotoFields} className="flex-1 rounded-none border-2 border-foreground bg-success px-3 py-2 text-xs font-extrabold uppercase tracking-[0.05em] text-success-foreground hover:brightness-95">Apply ticked fields</button>
                <button type="button" onClick={() => { setPhotoResult(null); setPhotoNotice(null); }} className="rounded-none border-2 border-foreground bg-card px-3 py-2 text-xs font-extrabold uppercase tracking-[0.05em] hover:bg-muted">Discard</button>
              </div>
              <p className="text-[0.62rem] uppercase tracking-[0.04em] text-muted-foreground">AI can misread a logo or size. Always check against the tag.</p>
            </div>
          )}
        </aside>
      </section>

      <section id="listing-details" className="cx-panel rounded-none p-5 sm:p-6"><div className="mb-6"><p className="cx-eyebrow">02 / universal listing data</p><h2 className="mt-2 text-lg font-semibold">Your canonical item record</h2><p className="mt-2 text-sm text-muted-foreground">Enter the reusable item facts once. P/D/M drafts inherit them and report only what still needs attention.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><div className="md:col-span-2 xl:col-span-3"><Label>Item title <span className="text-foreground">*</span></Label><Input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="e.g. 1990s Levi's 501 Straight Jeans" className="mt-2 bg-card" /></div><div><Label>Brand</Label><Input value={form.brand} onChange={(event) => update('brand', event.target.value)} placeholder="Levi's" className="mt-2 bg-card" /></div><div><Label>Model / style</Label><Input value={form.model} onChange={(event) => update('model', event.target.value)} placeholder="501" className="mt-2 bg-card" /></div><div><Label>Category</Label><Select value={form.category} onValueChange={(value) => update('category', value)}><SelectTrigger className="mt-2 bg-card"><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></div><div><Label>Size</Label><Input value={form.size} onChange={(event) => update('size', event.target.value)} placeholder="e.g. 30 x 32" className="mt-2 bg-card" /></div><div><Label>Color</Label><Input value={form.color} onChange={(event) => update('color', event.target.value)} placeholder="Medium wash blue" className="mt-2 bg-card" /></div><div><Label>Condition</Label><Select value={form.condition} onValueChange={(value) => update('condition', value as Condition)}><SelectTrigger className="mt-2 bg-card"><SelectValue /></SelectTrigger><SelectContent>{CONDITIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div><PricingPanel price={form.price} weight={form.weight} cost={form.cost} ship={ship} item={{ title: form.title, brand: form.brand, model: form.model, category: form.category, condition: form.condition }} onPrice={(value) => update('price', value)} onWeight={(value) => update('weight', value)} onShip={setShip} /><div><Label>SKU</Label><Input value={form.sku} onChange={(event) => update('sku', event.target.value)} placeholder="BIN-A3-014" className="mt-2 bg-card" /></div><div><Label>Source location</Label><Input value={form.sourceLocation} onChange={(event) => update('sourceLocation', event.target.value)} placeholder="Goodwill — Downtown" className="mt-2 bg-card" /></div><div><Label>Tags</Label><Input value={form.tags} onChange={(event) => update('tags', event.target.value)} placeholder="vintage, denim, jeans" className="mt-2 bg-card" /></div><div className="md:col-span-2 xl:col-span-3"><Label>Measurements</Label><Textarea value={form.measurements} onChange={(event) => update('measurements', event.target.value)} placeholder="Waist: 15 in flat · Inseam: 31 in · Rise: 11 in" className="mt-2 min-h-20 bg-card" /></div><div className="md:col-span-2 xl:col-span-3"><Label>Description / known details</Label><Textarea value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Describe material, wear, flaws, fit, and anything a buyer should know." className="mt-2 min-h-28 bg-card" /></div><div className="md:col-span-2 xl:col-span-3"><Label>Internal notes</Label><Textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Private notes are not included in marketplace drafts." className="mt-2 min-h-20 bg-card" /></div><details className="group md:col-span-2 xl:col-span-3 border border-border bg-card"><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-extrabold uppercase tracking-[0.05em]"><span>Private records (optional)</span><span className="text-[0.625rem] font-medium text-muted-foreground group-open:hidden">Only you see this. Never sent to a marketplace.</span></summary><div className="grid gap-4 border-t border-border p-4 md:grid-cols-3"><div><Label>What I paid <span className="text-muted-foreground">(for profit tracking)</span></Label><Input type="number" min="0" step="0.01" value={form.cost} onChange={(event) => update('cost', event.target.value)} placeholder="0.00" className="mt-2 bg-card" /></div><p className="text-xs leading-5 text-muted-foreground md:col-span-2 md:self-end">Fill this in if you want profit figures. Take-home above works without it. It stays in your account and is never included in a listing draft.</p></div></details></div></section>

      <section id="marketplace-details" className="cx-panel rounded-none p-5 sm:p-6"><div><p className="cx-eyebrow">03 / marketplace-ready details</p><h2 className="mt-2 text-lg font-semibold">Every platform field, captured once.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">These saved details cover the documented Poshmark, Depop, and Mercari listing inputs. Marketplace category menus can change, so the final free-form attributes box carries any item-specific dropdown values you must confirm in the live form.</p></div><div className="mt-5 grid gap-4 lg:grid-cols-3"><div className="rounded-none border border-border bg-card p-4"><p className="font-semibold">Shared product details</p><div className="mt-3 grid gap-3"><div><Label>Department / gender</Label><Input value={marketplaceDetails.department} onChange={(e) => updateMarketplaceDetail('department', e.target.value)} placeholder="Women, Men, Kids…" className="mt-1 bg-card" /></div><div><Label>Subcategory</Label><Input value={marketplaceDetails.subcategory} onChange={(e) => updateMarketplaceDetail('subcategory', e.target.value)} placeholder="Jackets, hoodies…" className="mt-1 bg-card" /></div><div className="grid grid-cols-2 gap-2"><div><Label>Quantity</Label><Input type="number" min="1" value={marketplaceDetails.quantity} onChange={(e) => updateMarketplaceDetail('quantity', e.target.value)} className="mt-1 bg-card" /></div><div><Label>Original / MSRP</Label><Input type="number" min="0" value={marketplaceDetails.originalPrice} onChange={(e) => updateMarketplaceDetail('originalPrice', e.target.value)} className="mt-1 bg-card" /></div></div><div><Label>Second color</Label><Input value={marketplaceDetails.secondaryColor} onChange={(e) => updateMarketplaceDetail('secondaryColor', e.target.value)} placeholder="Optional second color" className="mt-1 bg-card" /></div><div><Label>Material</Label><Input value={marketplaceDetails.material} onChange={(e) => updateMarketplaceDetail('material', e.target.value)} placeholder="Nylon" className="mt-1 bg-card" /></div><div className="grid grid-cols-2 gap-2"><div><Label>Pattern</Label><Input value={marketplaceDetails.pattern} onChange={(e) => updateMarketplaceDetail('pattern', e.target.value)} placeholder="Solid" className="mt-1 bg-card" /></div><div><Label>Fit</Label><Input value={marketplaceDetails.fit} onChange={(e) => updateMarketplaceDetail('fit', e.target.value)} placeholder="Fitted" className="mt-1 bg-card" /></div></div><div><Label>Flaws / wear disclosure</Label><Textarea value={marketplaceDetails.flaws} onChange={(e) => updateMarketplaceDetail('flaws', e.target.value)} placeholder="State flaws shown in photos…" className="mt-1 min-h-20 bg-card" /></div><div><Label>Included items</Label><Input value={marketplaceDetails.includedItems} onChange={(e) => updateMarketplaceDetail('includedItems', e.target.value)} placeholder="Dust bag, extra strap" className="mt-1 bg-card" /></div><div><Label>Authenticity</Label><Input value={marketplaceDetails.authenticity} onChange={(e) => updateMarketplaceDetail('authenticity', e.target.value)} placeholder="Serial number verified" className="mt-1 bg-card" /></div><div><Label>UPC / GTIN / Product ID</Label><Input value={marketplaceDetails.productId} onChange={(e) => updateMarketplaceDetail('productId', e.target.value)} className="mt-1 bg-card" /></div></div></div><div className="rounded-none border border-border bg-card p-4"><p className="font-semibold">Poshmark controls</p><div className="mt-3 grid gap-3"><div><Label>Shipping discount</Label><Input value={marketplaceDetails.poshShippingDiscount} onChange={(e) => updateMarketplaceDetail('poshShippingDiscount', e.target.value)} placeholder="Blank, FREE, or amount" className="mt-1 bg-card" /></div><div><Label>Smart Sell</Label><Select value={marketplaceDetails.poshSmartSellMode} onValueChange={(v) => updateMarketplaceDetail('poshSmartSellMode', v as MarketplaceDetails['poshSmartSellMode'])}><SelectTrigger className="mt-1 bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="off">Off</SelectItem><SelectItem value="minimum_price">Minimum price</SelectItem><SelectItem value="floor_percent">Floor percentage</SelectItem></SelectContent></Select></div>{marketplaceDetails.poshSmartSellMode !== 'off' && <div><Label>{marketplaceDetails.poshSmartSellMode === 'minimum_price' ? 'Minimum price' : 'Floor % off list price'}</Label><Input type="number" min="0" value={marketplaceDetails.poshMinimumPrice} onChange={(e) => updateMarketplaceDetail('poshMinimumPrice', e.target.value)} className="mt-1 bg-card" /></div>}<div><Label>Availability</Label><Select value={marketplaceDetails.poshAvailability} onValueChange={(v) => updateMarketplaceDetail('poshAvailability', v as MarketplaceDetails['poshAvailability'])}><SelectTrigger className="mt-1 bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="for_sale">For sale</SelectItem><SelectItem value="not_for_sale">Not for sale</SelectItem><SelectItem value="drops">Drops</SelectItem></SelectContent></Select></div>{marketplaceDetails.poshAvailability === 'drops' && <div><Label>Drop time</Label><Input type="datetime-local" value={marketplaceDetails.poshDropTime} onChange={(e) => updateMarketplaceDetail('poshDropTime', e.target.value)} className="mt-1 bg-card" /></div>}</div></div><div className="rounded-none border border-border bg-card p-4"><p className="font-semibold">Depop & Mercari shipping</p><div className="mt-3 grid gap-3"><div><Label>Depop shipping</Label><Select value={marketplaceDetails.depopShippingMethod} onValueChange={(v) => updateMarketplaceDetail('depopShippingMethod', v as MarketplaceDetails['depopShippingMethod'])}><SelectTrigger className="mt-1 bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="depop_shipping">Depop Shipping</SelectItem><SelectItem value="own_shipping">My tracked shipping</SelectItem></SelectContent></Select></div><div className="grid grid-cols-2 gap-2"><div><Label>Domestic price</Label><Input type="number" min="0" value={marketplaceDetails.depopDomesticShipping} onChange={(e) => updateMarketplaceDetail('depopDomesticShipping', e.target.value)} className="mt-1 bg-card" /></div><div><Label>International price</Label><Input type="number" min="0" value={marketplaceDetails.depopInternationalShipping} onChange={(e) => updateMarketplaceDetail('depopInternationalShipping', e.target.value)} className="mt-1 bg-card" /></div></div><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={marketplaceDetails.depopWorldwide} onChange={(e) => updateMarketplaceDetail('depopWorldwide', e.target.checked)} />Offer worldwide shipping</label><div><Label>Bundle / shipping note</Label><Input value={marketplaceDetails.depopBundleInfo} onChange={(e) => updateMarketplaceDetail('depopBundleInfo', e.target.value)} className="mt-1 bg-card" /></div><div><Label>Mercari method & payer</Label><div className="mt-1 grid grid-cols-2 gap-2"><Select value={marketplaceDetails.mercariShippingMethod} onValueChange={(v) => updateMarketplaceDetail('mercariShippingMethod', v as MarketplaceDetails['mercariShippingMethod'])}><SelectTrigger className="bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="prepaid_label">Prepaid label</SelectItem><SelectItem value="ship_on_own">Ship on my own</SelectItem></SelectContent></Select><Select value={marketplaceDetails.mercariPayer} onValueChange={(v) => updateMarketplaceDetail('mercariPayer', v as MarketplaceDetails['mercariPayer'])}><SelectTrigger className="bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="buyer">Buyer pays</SelectItem><SelectItem value="seller">I pay</SelectItem></SelectContent></Select></div></div><div className="grid grid-cols-3 gap-2"><div><Label>L</Label><Input value={marketplaceDetails.mercariPackageLength} onChange={(e) => updateMarketplaceDetail('mercariPackageLength', e.target.value)} className="mt-1 bg-card" /></div><div><Label>W</Label><Input value={marketplaceDetails.mercariPackageWidth} onChange={(e) => updateMarketplaceDetail('mercariPackageWidth', e.target.value)} className="mt-1 bg-card" /></div><div><Label>H</Label><Input value={marketplaceDetails.mercariPackageHeight} onChange={(e) => updateMarketplaceDetail('mercariPackageHeight', e.target.value)} className="mt-1 bg-card" /></div></div><div className="grid grid-cols-2 gap-2"><div><Label>Origin ZIP</Label><Input value={marketplaceDetails.mercariOriginPostal} onChange={(e) => updateMarketplaceDetail('mercariOriginPostal', e.target.value)} placeholder="90210" className="mt-1 bg-card" /></div><div><Label>Smart Pricing floor</Label><Input value={marketplaceDetails.mercariSmartPriceFloor} onChange={(e) => updateMarketplaceDetail('mercariSmartPriceFloor', e.target.value)} placeholder="28" className="mt-1 bg-card" /></div></div></div></div></div><div className="mt-4"><Label>Category-specific attributes still shown by a marketplace</Label><Textarea value={marketplaceDetails.categoryAttributes} onChange={(e) => updateMarketplaceDetail('categoryAttributes', e.target.value)} placeholder="Example: sleeve length: long; closure: zip; occasion: outdoor; manufacturer style code: … Save every category-specific option here so it is ready to copy into the live marketplace form." className="mt-2 min-h-20 bg-card" /></div></section>

      <section id="listing-copy" className="cx-panel rounded-none p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div><p className="cx-eyebrow">04 / listing copy</p><h2 className="mt-2 text-lg font-semibold">One item. Three voices.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Poshmark reads long and detailed, Depop short and trend-aware, Mercari plain and searchable. The writer follows each platform&apos;s own guidance and uses only the facts you entered above. It never invents measurements, flaws or brands.</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => writeCopy()} disabled={writing.length > 0} className="inline-flex items-center justify-center gap-2 rounded-none border-2 border-foreground bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.05em] text-primary-foreground hover:bg-accent-hover disabled:border-muted-foreground disabled:bg-muted disabled:text-muted-foreground">{writing.length === MARKETPLACES.length ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{writing.length === MARKETPLACES.length ? 'Writing all three…' : 'Write all three'}</button>
            <button type="button" onClick={() => requestQuick('title')} disabled={quickBusy !== null} className="inline-flex items-center justify-center gap-2 rounded-none border-2 border-foreground bg-card px-3 py-2.5 text-xs font-extrabold uppercase tracking-[0.05em] hover:bg-muted disabled:opacity-50">{quickBusy === 'title' ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}Sharper item title</button>
            <button type="button" onClick={() => requestQuick('tags')} disabled={quickBusy !== null} className="inline-flex items-center justify-center gap-2 rounded-none border-2 border-foreground bg-card px-3 py-2.5 text-xs font-extrabold uppercase tracking-[0.05em] hover:bg-muted disabled:opacity-50">{quickBusy === 'tags' ? <Loader2 size={15} className="animate-spin" /> : <Tags size={15} />}Suggest tags</button>
          </div>
        </div>
        {copyNotice && <p role={copyNotice.tone === 'error' ? 'alert' : 'status'} className={`mt-4 border-2 border-border px-3 py-2 text-sm font-semibold text-foreground ${copyNotice.tone === 'error' ? 'border-l-[10px] border-l-destructive bg-warning-tint' : 'bg-success-tint'}`}>{copyNotice.text}</p>}
        {quick && <div className="mt-4 space-y-2 border border-border bg-success-tint p-4"><p className="text-xs font-bold">{quick.kind === 'title' ? 'Suggested item title' : 'Suggested tags'} <span className="font-medium text-muted-foreground">· {quick.confidence}</span></p>{quick.kind === 'title' ? <Input value={quick.value} onChange={(event) => setQuick({ ...quick, value: event.target.value })} className="bg-card text-sm" /> : <Textarea value={quick.value} onChange={(event) => setQuick({ ...quick, value: event.target.value })} className="min-h-16 bg-card text-sm" />}<div className="flex gap-2"><button type="button" onClick={applyQuick} className="rounded-none border-2 border-foreground bg-success px-3 py-2 text-xs font-extrabold uppercase tracking-[0.05em] text-success-foreground hover:brightness-95">Use this</button><button type="button" onClick={() => setQuick(null)} className="rounded-none border-2 border-foreground bg-card px-3 py-2 text-xs font-extrabold uppercase tracking-[0.05em] hover:bg-muted">Discard</button></div></div>}
        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Platform copy">
          {MARKETPLACES.map((platform) => { const has = Boolean(marketplaceDetails.platformCopy[platform]); const info = copyInfo[platform]; return <button key={platform} type="button" role="tab" aria-selected={copyTab === platform} onClick={() => setCopyTab(platform)} className={`inline-flex items-center gap-2 rounded-none border-2 border-foreground px-4 py-2 text-xs font-extrabold uppercase tracking-[0.05em] ${copyTab === platform ? 'bg-accent-tint' : 'bg-card hover:bg-muted'}`}>{PLATFORM_NAME[platform]}{writing.includes(platform) ? <Loader2 size={12} className="animate-spin" /> : has ? <span className={`border border-border px-1.5 py-0.5 text-[0.55rem] ${info?.source === 'template' ? 'bg-warning-tint' : 'bg-success-tint'}`}>{info ? (info.source === 'template' ? 'template' : 'AI') : 'saved'}</span> : null}</button>; })}
        </div>
        {(() => {
          const platform = copyTab; const copy = marketplaceDetails.platformCopy[platform]; const info = copyInfo[platform]; const playbook = copyMeta?.playbooks[platform];
          const titleLimit = info?.limits.title ?? 80; const descLimit = info?.limits.description ?? (platform === 'poshmark' ? 1500 : 1000);
          if (!copy) return <div className="mt-4 border border-dashed border-border bg-card p-6 text-center"><p className="font-semibold">{PLATFORM_NAME[platform]} copy is not written yet</p><p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{PLATFORM_BLURB[platform]}</p><button type="button" onClick={() => writeCopy([platform])} disabled={writing.length > 0} className="mt-4 inline-flex items-center gap-2 rounded-none border-2 border-foreground bg-card px-4 py-2 text-xs font-extrabold uppercase tracking-[0.05em] hover:bg-muted disabled:opacity-50"><Sparkles size={14} />Write {PLATFORM_NAME[platform]} copy</button></div>;
          const over = copy.description.length > descLimit;
          return (
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                {platform !== 'depop' && <div><div className="flex items-baseline justify-between"><Label>{PLATFORM_NAME[platform]} title</Label><span className={`text-[0.68rem] ${copy.title.length > titleLimit ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{copy.title.length}/{titleLimit}</span></div><div className="mt-2 flex gap-2"><Input value={copy.title} onChange={(event) => editCopyTitle(platform, event.target.value)} className="bg-card" /><button type="button" onClick={() => copyToClipboard(copy.title, 'Title')} className="shrink-0 rounded-none border-2 border-foreground bg-card px-3 hover:bg-muted" aria-label="Copy title"><Copy size={14} /></button></div></div>}
                <div><div className="flex items-baseline justify-between"><Label>{platform === 'depop' ? 'Depop description (first line is your search title)' : `${PLATFORM_NAME[platform]} description`}</Label><span className={`text-[0.68rem] ${over ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{copy.description.length}/{descLimit}</span></div><Textarea value={copy.description} onChange={(event) => editCopyText(platform, event.target.value)} className="mt-2 min-h-56 bg-card text-sm leading-6" />{over && <p className="mt-1 text-xs font-semibold text-destructive">Over the length {info?.limits.descriptionVerified ? 'limit' : 'usually reported for this platform'}. Trim it before posting.</p>}</div>
                <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => copyToClipboard(copy.description, 'Description')} className="inline-flex items-center gap-2 rounded-none border-2 border-foreground bg-card px-3 py-2 text-xs font-extrabold uppercase tracking-[0.05em] hover:bg-muted"><Copy size={14} />Copy description</button><button type="button" onClick={() => writeCopy([platform])} disabled={writing.length > 0} className="inline-flex items-center gap-2 rounded-none border-2 border-foreground bg-card px-3 py-2 text-xs font-extrabold uppercase tracking-[0.05em] hover:bg-muted disabled:opacity-50">{writing.includes(platform) ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}Rewrite {PLATFORM_NAME[platform]}</button><span className="text-[0.68rem] text-muted-foreground">Hashtags: {copy.hashtags.length ? copy.hashtags.map((tag) => `#${tag}`).join(' ') : 'none'}</span></div>
              </div>
              <div className="space-y-3 text-sm">
                {info?.source === 'template' && <p className="border-2 border-l-[10px] border-border border-l-destructive bg-warning-tint px-3 py-2 text-xs font-semibold">Plain template. {info.reason ?? 'The AI did not answer.'} Nothing here was invented, but it is not tailored yet.</p>}
                {info?.warnings.map((warning) => <p key={warning} className="border border-border bg-warning-tint px-3 py-2 text-xs">{warning}</p>)}
                {info && info.hints.length > 0 && <div className="border border-border bg-card p-3"><p className="cx-eyebrow">To make this stronger</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-ink-2">{info.hints.map((hint) => <li key={hint}>• {hint}</li>)}</ul></div>}
                {info && info.trendsUsed.length > 0 && <p className="text-xs leading-5 text-muted-foreground">Trend words offered to the AI (only where they fit): {info.trendsUsed.join('; ')}.</p>}
                <details className="border border-border bg-card p-3"><summary className="cursor-pointer text-xs font-extrabold uppercase tracking-[0.05em]">What this style is based on</summary><p className="mt-2 text-xs leading-5 text-ink-2">{PLATFORM_BLURB[platform]}</p>{playbook && <><p className="mt-2 text-xs leading-5 text-ink-2">{playbook.voice}</p><ul className="mt-2 space-y-1 text-xs leading-5">{playbook.sources.map((source) => <li key={source.label}>{source.url ? <a className="underline underline-offset-4" href={source.url} target="_blank" rel="noreferrer">{source.label}</a> : source.label} <span className="text-muted-foreground">({source.kind})</span></li>)}</ul><p className="mt-2 text-[0.68rem] leading-5 text-muted-foreground">Trend words checked {copyMeta?.trendsAsOf}. Length limits marked &quot;reported&quot; come from third-party seller tools, so confirm them in the live app.</p></>}</details>
              </div>
            </div>
          );
        })()}
        <details className="mt-5 border border-border bg-card"><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-extrabold uppercase tracking-[0.05em]"><span>Ask the co-pilot</span><span className="text-[0.625rem] font-medium normal-case tracking-normal text-muted-foreground">Questions about title, tags, fees or pricing</span></summary><div className="border-t border-border p-4"><div className="max-h-56 space-y-3 overflow-y-auto rounded-none border border-border bg-card p-3">{chat.map((entry, index) => <div key={`${entry.role}-${index}`} className={`rounded-none p-2.5 text-xs leading-5 ${entry.role === 'assistant' ? 'bg-muted text-muted-foreground' : 'ml-5 bg-accent-tint text-foreground'}`}><p className="mb-1 font-semibold text-[0.55rem] uppercase tracking-wider text-foreground">{entry.role === 'assistant' ? 'Co-pilot' : 'You'}</p><p>{entry.text}</p>{entry.suggestions?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{entry.suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => sendChat(suggestion)} className="rounded border border-border px-2 py-1 text-[0.62rem] text-foreground hover:bg-accent-tint">{suggestion}</button>)}</div> : null}</div>)}{isChatting && <div className="flex items-center gap-2 px-1 text-xs text-foreground"><Loader2 size={13} className="animate-spin" />Thinking…</div>}</div><div className="mt-3 flex gap-2"><Input value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void sendChat(); } }} placeholder="Ask about title, tags, fees, or pricing…" className="bg-card text-xs" /><button type="button" onClick={() => sendChat()} disabled={isChatting || !chatInput.trim()} className="rounded-none border-2 border-foreground bg-accent-tint px-3 text-foreground disabled:opacity-50" aria-label="Send co-pilot message"><MessageSquare size={15} /></button></div></div></details>
      </section>

      <section className="cx-panel rounded-none p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="cx-eyebrow">05 / P · D · M readiness</p><h2 className="mt-2 text-lg font-semibold">Generate drafts, then monitor each item once.</h2><p className="mt-2 text-sm text-muted-foreground">“Needs posted” means the CrossLinkOS draft is complete but is not yet confirmed in that marketplace.</p></div>{drafts.length > 0 && <Link href="/listings" className="inline-flex items-center justify-center gap-2 rounded-none border border-border bg-accent-tint px-4 py-2.5 text-sm font-bold text-foreground hover:bg-accent-tint">Open Draft Board <ArrowRight size={16} /></Link>}</div>{drafts.length === 0 ? <div className="mt-5 rounded-none border border-dashed border-border bg-card p-7 text-center"><p className="font-semibold">No platform drafts yet</p><p className="mt-2 text-sm text-muted-foreground">Save your item, then generate Poshmark, Depop, and Mercari drafts from the sticky action bar below.</p></div> : <div className="mt-5 grid gap-3 md:grid-cols-3">{drafts.map((draft) => <article key={draft.id} className="rounded-none border border-border bg-card p-4"><div className="flex items-center justify-between"><span className="font-semibold text-[0.68rem] uppercase tracking-[0.14em] text-foreground">{draft.marketplace}</span><span className="rounded-none border border-border bg-accent-tint px-2 py-1 font-semibold text-[0.54rem] uppercase text-foreground">{statusLabel(draft.status)}</span></div><h3 className="mt-4 line-clamp-2 font-semibold text-foreground">{draft.title || form.title}</h3><p className="mt-2 text-[0.68rem] text-muted-foreground">{draft.copyOrigin === 'seller' ? 'Uses the copy you wrote in section 04.' : draft.copyOrigin === 'ai' ? 'Written by the AI for this platform. Review it.' : draft.copyOrigin === 'template' ? `Plain template. ${draft.copyReason ?? 'The AI did not answer.'} Write it in section 04 for better copy.` : ''}</p>{draft.missingFields.length > 0 ? <p className="mt-3 text-xs text-warning">Needs: {draft.missingFields.join(', ')}</p> : <p className="mt-3 flex items-center gap-1.5 text-xs text-foreground"><Check size={14} /> Ready for your review</p>}</article>)}</div>}</section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.3fr]"><div className="cx-panel rounded-none p-5 sm:p-6"><p className="cx-eyebrow">06 / sale handoff</p><h2 className="mt-2 text-lg font-semibold">Record a sale</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Select where it sold. The item then moves to sold records with remaining-platform delisting tasks and its pull–print–pack–ship checklist.</p><div className="mt-5 grid grid-cols-2 gap-3"><div><Label>Sold on</Label><Select value={salePlatform} onValueChange={(value) => setSalePlatform(value as Marketplace)}><SelectTrigger className="mt-2 bg-card"><SelectValue /></SelectTrigger><SelectContent>{MARKETPLACES.map((platform) => <SelectItem key={platform} value={platform} className="capitalize">{platform}</SelectItem>)}</SelectContent></Select></div><div><Label>Sale price</Label><Input type="number" min="0" step="0.01" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} placeholder="0.00" className="mt-2 bg-card" /></div></div><button type="button" onClick={markSold} disabled={isMarkingSold} className="mt-4 flex w-full items-center justify-center gap-2 rounded-none border border-border bg-success-tint px-4 py-3 text-sm font-bold text-foreground hover:bg-success-tint disabled:opacity-50">{isMarkingSold ? <Loader2 className="animate-spin" size={16} /> : <PackageCheck size={16} />}{isMarkingSold ? 'Recording sale…' : 'Record sale and start fulfillment'}</button></div><div className="cx-panel rounded-none p-5 sm:p-6"><p className="cx-eyebrow">Lifecycle promise</p><h2 className="mt-2 text-lg font-semibold">No lost inventory after a sale</h2><div className="mt-5 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3"><div className="rounded-none border border-border bg-card p-3"><p className="font-semibold text-[0.6rem] text-foreground">01 / SOLD ON</p><p className="mt-2">See the platform and final sale amount.</p></div><div className="rounded-none border border-border bg-card p-3"><p className="font-semibold text-[0.6rem] text-foreground">02 / DELIST</p><p className="mt-2">Track each remaining P/D/M listing until you confirm it is removed.</p></div><div className="rounded-none border border-border bg-card p-3"><p className="font-semibold text-[0.6rem] text-foreground">03 / FULFILL</p><p className="mt-2">Pull, print, pack, ship, and record delivery steps.</p></div></div></div></section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card px-4 py-3  lg:left-[248px] lg:px-10"><div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className={`h-2 w-2 rounded-full ${itemId ? 'bg-success' : 'bg-primary'}`} />{itemId ? 'Changes save to your canonical listing.' : 'Save this item before preparing marketplace drafts.'}</div><div className="grid grid-cols-3 gap-2 sm:flex"><button type="button" onClick={saveAndContinue} disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-none bg-primary border-2 border-foreground hover:bg-accent-hover px-3 py-2.5 text-xs font-extrabold uppercase tracking-[0.05em] text-primary-foreground  disabled:opacity-50">{isSaving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}{isSaving ? 'Saving' : 'Save & Continue'}</button><button type="button" onClick={() => { document.getElementById('listing-copy')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); void writeCopy(); }} disabled={writing.length > 0} className="inline-flex items-center justify-center gap-2 rounded-none border border-border bg-success-tint px-3 py-2.5 text-xs font-extrabold uppercase tracking-[0.05em] text-foreground hover:bg-success-tint disabled:opacity-50">{writing.length > 0 ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} />}Write copy</button><button type="button" onClick={generateMarketplaceDrafts} disabled={isGeneratingDrafts} className="inline-flex items-center justify-center gap-2 rounded-none border border-border bg-card px-3 py-2.5 text-xs font-extrabold uppercase tracking-[0.05em] text-foreground hover:border-border disabled:opacity-50">{isGeneratingDrafts ? <Loader2 className="animate-spin" size={15} /> : <ArrowRight size={15} />}{isGeneratingDrafts ? 'Preparing' : 'Generate P/D/M'}</button></div></div></div>
    </div>
  );
}
