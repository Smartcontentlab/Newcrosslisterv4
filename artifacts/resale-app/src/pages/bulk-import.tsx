import { useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getListItemsQueryKey } from '@workspace/api-client-react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FolderOpen, Loader2, Upload, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/supabase';
import { shrinkPhoto, storePhoto } from '@/lib/listing-photos';
import { batchLabel, groupPhotos, itemBody, rowsFromCsv, type ImportPhotoRecord, type ImportRow } from '@/lib/bulk-import';

/** A photo picked from a folder, from loose files, or read out of a ZIP. */
type PickedPhoto = { path: string; size: number; blob: Blob };
type RowState = { status: 'waiting' | 'working' | 'done' | 'failed'; itemId?: number; message?: string };

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const CONDITION_LABEL: Record<ImportRow['condition'], string> = { new: 'New', like_new: 'Like new', good: 'Good', fair: 'Fair', poor: 'Poor' };

async function photosFromZip(file: File): Promise<PickedPhoto[]> {
  const { unzipSync } = await import('fflate');
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (entry) => /\.(jpe?g|png|webp)$/i.test(entry.name) && !entry.name.includes('__MACOSX') });
  return Object.entries(entries).map(([path, bytes]) => {
    const type = /\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg';
    return { path, size: bytes.byteLength, blob: new Blob([bytes], { type }) };
  });
}

export default function BulkImportPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sheetName, setSheetName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [readingPhotos, setReadingPhotos] = useState(false);
  const [makeDrafts, setMakeDrafts] = useState(true);
  const [useOriginals, setUseOriginals] = useState(true);
  const [state, setState] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);

  const groups = useMemo(() => groupPhotos(photos, useOriginals), [photos, useOriginals]);
  const done = rows.filter((row) => state[row.number]?.status === 'done').length;
  const toCreate = rows.filter((row) => state[row.number]?.status !== 'done');

  const pickSheet = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const parsed = rowsFromCsv(await file.text());
    setSheetName(file.name);
    setRows(parsed.rows);
    setProblems(parsed.problems);
    setState({});
  };

  const pickPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setReadingPhotos(true);
    try {
      const picked: PickedPhoto[] = [];
      for (const file of files) {
        if (/\.zip$/i.test(file.name)) picked.push(...(await photosFromZip(file)));
        else if (/^image\//.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name)) picked.push({ path: file.webkitRelativePath || file.name, size: file.size, blob: file });
      }
      const usable = picked.filter((photo) => photo.size <= MAX_PHOTO_BYTES);
      if (usable.length < picked.length) toast({ title: 'Some photos were skipped', description: 'Photos over 15 MB are left out.' });
      // Adding more photos keeps the ones already picked; the same path is only kept once.
      setPhotos((current) => [...new Map([...current, ...usable].map((photo) => [photo.path, photo])).values()]);
    } catch (error) {
      toast({ title: 'Could not read those photos', description: error instanceof Error ? error.message : 'Try unzipping the folder and choosing it instead.', variant: 'destructive' });
    } finally {
      setReadingPhotos(false);
    }
  };

  const importAll = async () => {
    setRunning(true);
    const batch = batchLabel();
    for (const row of toCreate) {
      setState((current) => ({ ...current, [row.number]: { status: 'working', message: 'Preparing photos' } }));
      try {
        const records: ImportPhotoRecord[] = [];
        for (const photo of groups.get(row.number) ?? []) {
          // Same size and quality the Listing studio uses, then saved to photo storage.
          const original = await storePhoto(await shrinkPhoto(photo.blob, 1080, 0.78));
          records.push({ id: crypto.randomUUID(), original, active: 'original', processingStatus: 'original', name: photo.path.split('/').pop() ?? photo.path, createdAt: new Date().toISOString() });
        }
        setState((current) => ({ ...current, [row.number]: { status: 'working', message: 'Saving draft' } }));
        const response = await apiFetch('/api/workflow/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itemBody(row, records, batch)) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(response.status === 413 ? 'The photos were too large to save together.' : typeof data.error === 'string' ? data.error : 'The item could not be saved.');
        if (makeDrafts) {
          setState((current) => ({ ...current, [row.number]: { status: 'working', itemId: data.id, message: 'Preparing marketplace drafts' } }));
          const drafts = await apiFetch(`/api/workflow/items/${data.id}/marketplace-drafts`, { method: 'POST' });
          if (!drafts.ok) { setState((current) => ({ ...current, [row.number]: { status: 'done', itemId: data.id, message: 'Saved. Marketplace drafts can be made from the Listings page.' } })); continue; }
        }
        setState((current) => ({ ...current, [row.number]: { status: 'done', itemId: data.id, message: `Saved with ${records.length} ${records.length === 1 ? 'photo' : 'photos'}` } }));
      } catch (error) {
        setState((current) => ({ ...current, [row.number]: { status: 'failed', message: error instanceof Error ? error.message : 'Something went wrong.' } }));
      }
    }
    setRunning(false);
    await queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
    toast({ title: 'Import finished', description: 'Every item is saved as a draft. Nothing was posted to any marketplace.' });
  };

  const panel = 'border-2 border-border bg-muted p-5 sm:p-6';
  const button = 'inline-flex h-11 cursor-pointer items-center gap-2 rounded-none border border-foreground px-5 text-xs font-extrabold uppercase tracking-[0.05em] hover:bg-card';

  return (
    <div className="space-y-6">
      <PageHeader
        label="Inventory"
        title="Bulk import"
        description="Load a price sheet and a folder of photos, and every row becomes a draft item. Nothing is posted: you review each draft and fill Poshmark or Depop with the extension as usual."
        actions={<Link href="/listings" className={button}>Open listings</Link>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={panel} aria-label="Price sheet">
          <p className="cx-eyebrow cx-bracket">01 / price sheet</p>
          <h2 className="mt-2 text-[0.9375rem] font-extrabold">Choose the sheet as a CSV file</h2>
          <p className="mt-1 text-sm text-ink-2">In Google Sheets: File, Download, Comma-separated values. Columns used: #, Title, Description, Brand, Category, Subcategory, Department, Size, Color, Condition, Suggested price, Original price, Checks before posting.</p>
          <label className={`${button} mt-4`}><FileSpreadsheet size={15} /> {sheetName ? 'Choose another sheet' : 'Choose CSV'}<input type="file" accept=".csv,text/csv" className="sr-only" onChange={pickSheet} /></label>
          {sheetName && <p className="mt-3 text-sm"><span className="font-semibold">{sheetName}</span>: {rows.length} {rows.length === 1 ? 'item' : 'items'}</p>}
        </section>

        <section className={panel} aria-label="Photos">
          <p className="cx-eyebrow cx-bracket">02 / photos</p>
          <h2 className="mt-2 text-[0.9375rem] font-extrabold">Choose the photo folder or its ZIP</h2>
          <p className="mt-1 text-sm text-ink-2">Each item's photos sit in a folder that starts with its number, like "01 Navy Cargo Pants". The cover is the first file by name. Up to 8 photos per item.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <label className={button}><FolderOpen size={15} /> Choose folder<input type="file" multiple className="sr-only" onChange={pickPhotos} {...{ webkitdirectory: '', directory: '' }} /></label>
            <label className={button}><Upload size={15} /> Choose ZIP or photos<input type="file" multiple accept=".zip,application/zip,image/jpeg,image/png,image/webp" className="sr-only" onChange={pickPhotos} /></label>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={useOriginals} onChange={(event) => setUseOriginals(event.target.checked)} disabled={running} /><span>Use the original camera photos from each item's Originals folder when it has one. They keep every label, tag, flaw and backdrop that edits can remove.</span></label>
          {readingPhotos ? <p className="mt-3 flex items-center gap-2 text-sm"><Loader2 size={14} className="animate-spin" /> Reading photos…</p> : photos.length > 0 && <p className="mt-3 text-sm">{photos.length} photos found for {groups.size} items</p>}
        </section>
      </div>

      {problems.length > 0 && (
        <section className="border-2 border-border bg-accent-tint p-5" aria-label="Sheet problems">
          <p className="flex items-center gap-2 text-sm font-extrabold"><AlertTriangle size={15} /> Check these in the sheet</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
        </section>
      )}

      {rows.length > 0 && (
        <section className={panel} aria-label="Preview">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="cx-eyebrow cx-bracket">03 / review and import</p>
              <h2 className="mt-2 text-[0.9375rem] font-extrabold">Items / {rows.length}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={makeDrafts} onChange={(event) => setMakeDrafts(event.target.checked)} disabled={running} /> Also prepare Poshmark, Depop and Mercari drafts</label>
              <button type="button" onClick={importAll} disabled={running || toCreate.length === 0} className="inline-flex h-11 items-center gap-2 rounded-none bg-primary border-2 border-foreground hover:bg-accent-hover px-6 text-xs font-extrabold uppercase tracking-[0.05em] text-primary-foreground disabled:opacity-50">
                {running && <Loader2 size={15} className="animate-spin" />}
                {done > 0 && toCreate.length > 0 ? `Retry ${toCreate.length} remaining` : `Create ${toCreate.length} drafts`}
              </button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead><tr className="border-b-2 border-border text-[0.6875rem] uppercase tracking-[0.06em]"><th className="py-2 pr-3">#</th><th className="py-2 pr-3">Title</th><th className="py-2 pr-3">Size</th><th className="py-2 pr-3">Condition</th><th className="py-2 pr-3">Price</th><th className="py-2 pr-3">Photos</th><th className="py-2">Status</th></tr></thead>
              <tbody>
                {rows.map((row) => {
                  const count = groups.get(row.number)?.length ?? 0;
                  const rowState = state[row.number];
                  return (
                    <tr key={row.number} className="border-b border-border align-top">
                      <td className="py-2 pr-3 font-semibold">{row.number}</td>
                      <td className="py-2 pr-3"><span className="font-medium">{row.title}</span>{row.checks && <span className="mt-1 block text-xs text-ink-2">Check: {row.checks}</span>}</td>
                      <td className="py-2 pr-3">{row.size || '—'}</td>
                      <td className="py-2 pr-3">{CONDITION_LABEL[row.condition]}</td>
                      <td className="py-2 pr-3">{row.price ? `$${row.price}` : <span className="text-ink-2">none</span>}</td>
                      <td className="py-2 pr-3">{count ? count : <span className="font-semibold">none</span>}</td>
                      <td className="py-2">
                        {!rowState && <span className="text-ink-2">Ready</span>}
                        {rowState?.status === 'working' && <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" />{rowState.message}</span>}
                        {rowState?.status === 'done' && <span className="flex items-center gap-1.5"><CheckCircle2 size={13} />{rowState.message}</span>}
                        {rowState?.status === 'failed' && <span className="flex items-center gap-1.5"><XCircle size={13} />{rowState.message}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {done > 0 && !running && <p className="mt-4 text-sm">{done} of {rows.length} saved as drafts. Review them on <Link href="/listings" className="cx-link">Listings</Link>, then use the extension to fill each marketplace form.</p>}
        </section>
      )}
    </div>
  );
}
