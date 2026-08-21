import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, ExternalLink, Loader2, Search, Send, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import ItemImage from '@/components/ItemImage';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/supabase';

const MARKETPLACES = ['poshmark', 'depop', 'mercari'] as const;
type Marketplace = (typeof MARKETPLACES)[number];
type DraftStatus = 'draft' | 'ready' | 'prefilled' | 'draft_saved' | 'published' | 'sold' | 'delisted' | 'needs_attention';
type Draft = { id: number; marketplace: Marketplace; status: DraftStatus; title: string | null; description: string | null; tags: string[]; price: number; missingFields: string[]; externalUrl?: string | null; externalListingId?: string | null; updatedAt: string; };
type BoardItem = { item: { id: number; title: string; brand?: string | null; category?: string | null; size?: string | null; sku?: string | null; condition: string; price: number; photos: string[]; photoRecords?: Array<{ original: string; processed?: string | null; active: 'original' | 'processed' }>; updatedAt: string; }; drafts: Draft[]; };
type SelectedDraft = { row: BoardItem; draft: Draft | null; marketplace: Marketplace } | null;

const statusMeta: Record<DraftStatus, { label: string; className: string; summary: string }> = {
  draft: { label: 'Needs details', className: 'border-amber-400/35 bg-amber-400/10 text-amber-200', summary: 'The CrossLinkOS draft exists but needs the listed required details.' },
  ready: { label: 'Needs posted', className: 'border-primary/35 bg-primary/10 text-primary', summary: 'The draft is complete in CrossLinkOS and ready to send to your extension. It has not been posted or saved in the marketplace.' },
  prefilled: { label: 'Prefilled — review', className: 'border-secondary/40 bg-secondary/10 text-secondary', summary: 'The extension reported that it filled the open marketplace form. Review every field and save or publish manually.' },
  draft_saved: { label: 'Draft saved', className: 'border-accent/35 bg-accent/10 text-accent', summary: 'You confirmed the marketplace draft was saved after review. CrossLinkOS does not assume it is live.' },
  published: { label: 'Live', className: 'border-accent/40 bg-accent/10 text-accent', summary: 'You confirmed this listing is live on the marketplace.' },
  sold: { label: 'Sold', className: 'border-accent/40 bg-accent/10 text-accent', summary: 'This platform recorded the sale.' },
  delisted: { label: 'Delisted', className: 'border-muted-foreground/35 bg-muted/20 text-muted-foreground', summary: 'You confirmed this remaining-platform listing was removed.' },
  needs_attention: { label: 'Needs attention', className: 'border-destructive/40 bg-destructive/10 text-destructive', summary: 'This platform draft needs your review before it can move forward.' },
};

function photoFor(row: BoardItem) {
  const record = row.item.photoRecords?.[0];
  return record?.active === 'processed' && record.processed ? record.processed : record?.original ?? row.item.photos?.[0];
}
function draftFor(row: BoardItem, marketplace: Marketplace) { return row.drafts.find((draft) => draft.marketplace === marketplace) ?? null; }
function itemStage(row: BoardItem) {
  const drafts = row.drafts;
  if (!drafts.length) return 'Needs drafts';
  if (drafts.some((draft) => draft.status === 'needs_attention' || draft.status === 'draft')) return 'Needs details';
  const live = drafts.filter((draft) => draft.status === 'published').length;
  if (live === 3) return 'Live on all 3';
  if (live > 0) return `Live on ${live}/3`;
  if (drafts.some((draft) => draft.status === 'prefilled')) return 'Pushed for review';
  if (drafts.some((draft) => draft.status === 'draft_saved')) return 'Draft saved';
  return 'Ready to push';
}

export default function Listings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const [selectedDraft, setSelectedDraft] = useState<SelectedDraft>(null);
  const [liveUrl, setLiveUrl] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const boardQuery = useQuery({
    queryKey: ['workflow', 'draft-board'],
    queryFn: async () => {
      const response = await apiFetch('/api/workflow/draft-board');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load the Draft Board');
      return data as BoardItem[];
    },
  });

  const rows = useMemo(() => {
    const source = boardQuery.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return source;
    return source.filter(({ item }) => [item.title, item.brand, item.category, item.sku].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [boardQuery.data, search]);
  const selectedRows = useMemo(() => (boardQuery.data ?? []).filter((row) => selectedItemIds.has(row.item.id)), [boardQuery.data, selectedItemIds]);
  const readySelections = useMemo(() => selectedRows.flatMap((row) => row.drafts.filter((draft) => draft.status === 'ready').map((draft) => ({ itemId: row.item.id, draftId: draft.id, marketplace: draft.marketplace }))), [selectedRows]);
  const extensionHandoffDrafts = useMemo(() => selectedRows.flatMap((row) => row.drafts.filter((draft) => draft.status === 'ready').map((draft) => {
    const photoCount = row.item.photoRecords?.length ?? row.item.photos?.length ?? 0;
    return { itemId: row.item.id, draftId: draft.id, marketplace: draft.marketplace, title: draft.title ?? row.item.title, description: draft.description ?? '', tags: draft.tags, price: draft.price, photos: [], photoCount, photoNotice: photoCount ? `${photoCount} photo(s) remain in CrossLinkOS. Upload them manually in the marketplace form.` : 'No listing photos are stored in this extension handoff.' };
  })), [selectedRows]);
  const toggleRow = (itemId: number) => setSelectedItemIds((current) => { const next = new Set(current); if (next.has(itemId)) next.delete(itemId); else next.add(itemId); return next; });

  const updateDraft = async (draftId: number, body: Partial<Pick<Draft, 'status' | 'title' | 'description' | 'tags' | 'price' | 'externalUrl'>>) => {
    setIsUpdating(true);
    try {
      const response = await apiFetch(`/api/workflow/marketplace-drafts/${draftId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update this platform draft');
      await queryClient.invalidateQueries({ queryKey: ['workflow', 'draft-board'] });
      if (selectedDraft?.draft?.id === draftId) setSelectedDraft((current) => current ? { ...current, draft: data } : current);
      toast({ title: 'Platform state updated', description: statusMeta[data.status as DraftStatus]?.summary ?? 'The status was saved.' });
      return data as Draft;
    } catch (error) {
      toast({ title: 'Update failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
      return null;
    } finally { setIsUpdating(false); }
  };

  useEffect(() => {
    const receiveExtensionStatus = async (event: Event) => {
      const detail = (event as CustomEvent<{ updates?: Array<{ draftId: number; status: 'prefilled' | 'needs_attention' }>; draftId?: number; status?: 'prefilled' | 'needs_attention' }>).detail;
      const updates = detail?.updates ?? (detail?.draftId && detail.status ? [{ draftId: detail.draftId, status: detail.status }] : []);
      if (!updates.length) return;
      await Promise.all(updates.map(async (update) => {
        const response = await apiFetch(`/api/workflow/marketplace-drafts/${update.draftId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: update.status }) });
        if (!response.ok) throw new Error('Could not record extension fill status');
      }));
      await queryClient.invalidateQueries({ queryKey: ['workflow', 'draft-board'] });
      toast({ title: 'Extension status recorded', description: updates.some((update) => update.status === 'prefilled') ? 'The marketplace form was filled for your review. It is not saved or published yet.' : 'The extension reported a form issue for your review.' });
    };
    window.addEventListener('crosslinkos:extension-fill-status', receiveExtensionStatus as EventListener);
    return () => window.removeEventListener('crosslinkos:extension-fill-status', receiveExtensionStatus as EventListener);
  }, [queryClient, toast]);

  const prepareExtensionHandoff = () => {
    if (!extensionHandoffDrafts.length) { toast({ title: 'No ready drafts selected', description: 'Select items that have at least one “Needs posted” P/D/M draft.' }); return; }
    let acknowledged = false;
    const receiveHandoff = (event: Event) => {
      const detail = (event as CustomEvent<{ ok?: boolean; error?: string }>).detail;
      acknowledged = true;
      window.removeEventListener('crosslinkos:extension-handoff-status', receiveHandoff as EventListener);
      if (detail?.ok) toast({ title: 'Extension handoff prepared', description: `${extensionHandoffDrafts.length} ready platform draft(s) are available in the local extension. Open the marketplace listing form and choose Fill. Review and save or publish manually.` });
      else toast({ title: 'Extension handoff failed', description: detail?.error || 'Install or enable the CrossLinkOS Chrome extension, then try again.', variant: 'destructive' });
    };
    window.addEventListener('crosslinkos:extension-handoff-status', receiveHandoff as EventListener);
    window.dispatchEvent(new CustomEvent('crosslinkos:extension-handoff', { detail: { version: 1, preparedAt: new Date().toISOString(), drafts: extensionHandoffDrafts } }));
    window.setTimeout(() => {
      if (acknowledged) return;
      window.removeEventListener('crosslinkos:extension-handoff-status', receiveHandoff as EventListener);
      toast({ title: 'Extension not detected', description: 'Install or enable the CrossLinkOS Chrome extension, then prepare this handoff again.', variant: 'destructive' });
    }, 1100);
  };
  const confirmLive = async () => {
    if (!selectedDraft?.draft) return;
    const body: { status: 'published'; externalUrl?: string } = { status: 'published' };
    if (liveUrl.trim()) body.externalUrl = liveUrl.trim();
    const updated = await updateDraft(selectedDraft.draft.id, body);
    if (updated) setLiveUrl('');
  };

  const activeDraft = selectedDraft?.draft;
  const activeMeta = activeDraft ? statusMeta[activeDraft.status] : null;
  if (boardQuery.isLoading) return <div className="h-64 animate-pulse rounded-2xl border border-border bg-white/5" />;
  if (boardQuery.isError) return <div className="rounded-2xl border border-destructive/35 bg-destructive/10 p-6 text-sm text-destructive">{boardQuery.error instanceof Error ? boardQuery.error.message : 'Could not load the Draft Board.'}</div>;

  return <div className="space-y-6">
    <section className="cx-panel rounded-2xl p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><p className="cx-eyebrow">Listings / item-level Draft Board</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">One item. Three clear marketplace states.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Each row is one physical item, not three duplicate listing cards. Click the compact P, D, or M chip to review that platform’s draft and confirm only actions you have actually completed.</p></div><Link href="/listing-studio" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:brightness-110">Create a listing <ChevronRight size={16} /></Link></div></section>
    <section className="cx-panel rounded-2xl p-4 sm:p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="relative w-full lg:max-w-md"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, brand, category, or SKU…" className="bg-background/45 pl-9" /></div><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="rounded-full border border-border bg-background/40 px-3 py-2">{rows.length} active item{rows.length === 1 ? '' : 's'}</span><span className="rounded-full border border-primary/25 bg-primary/5 px-3 py-2">P = Poshmark · D = Depop · M = Mercari</span></div></div>{selectedItemIds.size > 0 && <div className="mt-4 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-foreground"><span className="font-bold">{selectedItemIds.size}</span> item{selectedItemIds.size === 1 ? '' : 's'} selected · <span className="font-bold text-primary">{readySelections.length}</span> ready platform draft{readySelections.length === 1 ? '' : 's'}</p><button type="button" onClick={prepareExtensionHandoff} className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20"><Send size={14} />Prepare extension handoff</button></div>}</section>
    <section className="overflow-hidden rounded-2xl border border-border bg-card/45">{rows.length === 0 ? <div className="p-12 text-center"><p className="font-semibold text-foreground">No active items match this view.</p><p className="mt-2 text-sm text-muted-foreground">Create a canonical listing, then generate P/D/M drafts to see it here.</p></div> : <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-left"><thead className="border-b border-border bg-background/55 font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground"><tr><th className="w-12 px-4 py-4"><span className="sr-only">Select</span></th><th className="px-4 py-4">Item</th><th className="px-4 py-4">Price / condition</th><th className="px-4 py-4">Overall stage</th><th className="px-4 py-4 text-center">P</th><th className="px-4 py-4 text-center">D</th><th className="px-4 py-4 text-center">M</th></tr></thead><tbody className="divide-y divide-border/70">{rows.map((row) => <tr key={row.item.id} className="transition hover:bg-white/[0.025]"><td className="px-4 py-4"><input aria-label={`Select ${row.item.title}`} type="checkbox" checked={selectedItemIds.has(row.item.id)} onChange={() => toggleRow(row.item.id)} className="h-4 w-4 accent-primary" /></td><td className="px-4 py-4"><div className="flex items-center gap-3"><ItemImage src={photoFor(row)} alt={row.item.title} className="h-11 w-11 rounded-lg border border-border object-cover" iconSize={16} /><div className="min-w-0"><p className="max-w-[280px] truncate text-sm font-bold text-foreground">{row.item.title}</p><p className="mt-1 text-xs text-muted-foreground">{[row.item.brand, row.item.category, row.item.size].filter(Boolean).join(' · ') || 'No item details yet'}</p></div></div></td><td className="px-4 py-4"><p className="font-mono text-xs text-primary">${Number(row.item.price || 0).toFixed(2)}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{row.item.condition.replace('_', ' ')}</p></td><td className="px-4 py-4"><span className="rounded-full border border-border bg-background/50 px-2.5 py-1 text-xs font-semibold text-foreground">{itemStage(row)}</span></td>{MARKETPLACES.map((marketplace) => { const draft = draftFor(row, marketplace); const meta = draft ? statusMeta[draft.status] : null; return <td key={marketplace} className="px-4 py-4 text-center"><button type="button" onClick={() => { setSelectedDraft({ row, draft, marketplace }); setLiveUrl(draft?.externalUrl ?? ''); }} className={`min-w-24 rounded-lg border px-2 py-2 text-center transition hover:brightness-110 ${meta ? meta.className : 'border-border bg-background/35 text-muted-foreground hover:border-primary/35'}`}><span className="block font-mono text-[0.58rem] uppercase tracking-wider">{marketplace[0]}</span><span className="mt-1 block text-[0.62rem] font-semibold">{meta?.label ?? 'No draft'}</span></button></td>; })}</tr>)}</tbody></table></div>}</section>
    <section className="grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-primary/30 bg-primary/5 p-4"><p className="font-mono text-[0.6rem] uppercase tracking-wider text-primary">Needs posted</p><p className="mt-2 text-sm leading-5 text-muted-foreground">The CrossLinkOS copy is complete. It is ready to fill in the marketplace form, but is not yet saved or live there.</p></div><div className="rounded-xl border border-secondary/30 bg-secondary/5 p-4"><p className="font-mono text-[0.6rem] uppercase tracking-wider text-secondary">Prefilled — review</p><p className="mt-2 text-sm leading-5 text-muted-foreground">The extension filled an open marketplace form. You still review and save or publish manually.</p></div><div className="rounded-xl border border-accent/30 bg-accent/5 p-4"><p className="font-mono text-[0.6rem] uppercase tracking-wider text-accent">Live</p><p className="mt-2 text-sm leading-5 text-muted-foreground">You confirmed publication; record the marketplace URL if you have it for easier later delisting.</p></div></section>
    <Sheet open={Boolean(selectedDraft)} onOpenChange={(open) => { if (!open) setSelectedDraft(null); }}><SheetContent side="right" className="w-full overflow-y-auto border-border bg-background sm:max-w-xl"><SheetHeader><p className="cx-eyebrow">Platform draft review</p><SheetTitle>{selectedDraft?.row.item.title}</SheetTitle><SheetDescription>{selectedDraft ? `${selectedDraft.marketplace[0].toUpperCase()}${selectedDraft.marketplace.slice(1)} · ${activeMeta?.label ?? 'No draft yet'}` : ''}</SheetDescription></SheetHeader>{selectedDraft && !activeDraft ? <div className="mt-8 rounded-xl border border-dashed border-border bg-background/40 p-5"><p className="font-semibold">No {selectedDraft.marketplace} draft exists yet.</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Generate the three platform drafts from Listing Studio. This does not create a marketplace listing.</p><Link href="/listing-studio" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">Open Listing Studio <ChevronRight size={14} /></Link></div> : activeDraft && activeMeta ? <div className="mt-7 space-y-5"><div className={`rounded-xl border p-4 ${activeMeta.className}`}><div className="flex items-start gap-3"><ShieldCheck size={18} className="mt-0.5 shrink-0" /><div><p className="font-bold">{activeMeta.label}</p><p className="mt-1 text-xs leading-5 opacity-90">{activeMeta.summary}</p></div></div></div><div><Label>Draft title</Label><Input value={activeDraft.title ?? ''} readOnly className="mt-2 bg-background/45" /></div><div><Label>Draft description</Label><Textarea value={activeDraft.description ?? ''} readOnly className="mt-2 min-h-44 bg-background/45" /></div><div><Label>Tags</Label><Input value={activeDraft.tags.join(', ')} readOnly className="mt-2 bg-background/45" /></div><div className="grid grid-cols-2 gap-3"><div><Label>List price</Label><Input value={`$${Number(activeDraft.price ?? 0).toFixed(2)}`} readOnly className="mt-2 bg-background/45" /></div><div><Label>Marketplace URL</Label><Input value={liveUrl} onChange={(event) => setLiveUrl(event.target.value)} placeholder="Optional after publish" className="mt-2 bg-background/45" /></div></div>{activeDraft.missingFields.length > 0 && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4"><p className="text-xs font-bold text-amber-200">Still needs: {activeDraft.missingFields.join(', ')}</p></div>}<div className="grid gap-2"><button type="button" disabled={isUpdating} onClick={() => updateDraft(activeDraft.id, { status: 'draft_saved' })} className="rounded-lg border border-accent/35 bg-accent/10 px-3 py-2.5 text-sm font-bold text-accent hover:bg-accent/15 disabled:opacity-50"><Check size={15} className="mr-2 inline" />I saved the marketplace draft</button><button type="button" disabled={isUpdating} onClick={confirmLive} className="rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-50">{isUpdating ? <Loader2 size={15} className="mr-2 inline animate-spin" /> : <ExternalLink size={15} className="mr-2 inline" />}I reviewed and published it</button><button type="button" disabled={isUpdating} onClick={() => updateDraft(activeDraft.id, { status: 'needs_attention' })} className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2.5 text-sm font-bold text-destructive hover:bg-destructive/15 disabled:opacity-50">Mark needs attention</button></div><p className="text-[0.68rem] leading-5 text-muted-foreground">CrossLinkOS records only your confirmation here. It does not publish, inspect your marketplace session, or claim a marketplace draft exists without your review.</p></div> : null}</SheetContent></Sheet>
  </div>;
}
