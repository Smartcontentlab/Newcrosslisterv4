import { useEffect, useState, type FormEvent } from 'react';
import { Copy, KeyRound, Loader2, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/supabase';

type AccessKey = { id: string; name: string; hint: string; createdAt: string; lastUsedAt?: string };

const when = (value?: string) => (value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

/**
 * Access keys for helper programs: Hermes on the seller's laptop and the extension's auto-post mode.
 * The full key is shown once, right after it is created.
 */
export function AccessKeysPanel({ className }: { className: string }) {
  const { toast } = useToast();
  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [max, setMax] = useState(5);
  const [name, setName] = useState('Hermes on my laptop');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const response = await apiFetch('/api/agent-keys');
    if (!response.ok) return;
    const data = await response.json() as { keys: AccessKey[]; max: number };
    setKeys(data.keys); setMax(data.max);
  };
  useEffect(() => { void load(); }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await apiFetch('/api/agent-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The key could not be created.');
      setNewKey(data.key);
      await load();
    } catch (error) {
      toast({ title: 'Could not create the key', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const revoke = async (key: AccessKey) => {
    if (!window.confirm(`Revoke "${key.name}"? Anything using it stops working right away.`)) return;
    const response = await apiFetch(`/api/agent-keys/${key.id}`, { method: 'DELETE' });
    if (response.ok) { toast({ title: 'Key revoked' }); await load(); }
    else toast({ title: 'Could not revoke the key', description: 'Refresh the page and try again.', variant: 'destructive' });
  };

  const copy = async () => {
    if (!newKey) return;
    try { await navigator.clipboard.writeText(newKey); toast({ title: 'Key copied' }); }
    catch { toast({ title: 'Copy it by hand', description: 'Select the key text and copy it.' }); }
  };

  return (
    <section className={className} aria-label="Access keys">
      <p className="cx-eyebrow cx-bracket">Automation</p>
      <h2 className="mt-2 text-[0.9375rem] font-extrabold">Access keys</h2>
      <p className="mt-1 text-sm text-ink-2">Lets Hermes on your laptop and the extension's auto-post mode work with your CrossLinkOS account. Treat a key like a password: anyone with it can add and edit your items.</p>

      {newKey && (
        <div className="mt-4 border-2 border-foreground bg-accent-tint p-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.05em]">Copy this key now. It will not be shown again.</p>
          <code className="mt-2 block break-all bg-card p-2 text-xs">{newKey}</code>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="inline-flex h-9 items-center gap-2 rounded-none bg-primary border-2 border-foreground px-4 text-xs font-extrabold uppercase tracking-[0.05em] text-primary-foreground hover:bg-accent-hover"><Copy size={14} /> Copy key</button>
            <button type="button" onClick={() => setNewKey(null)} className="inline-flex h-9 items-center rounded-none border border-foreground px-4 text-xs font-extrabold uppercase tracking-[0.05em] hover:bg-muted">I saved it</button>
          </div>
        </div>
      )}

      {keys.length > 0 && (
        <ul className="mt-4 divide-y divide-border border border-border bg-card">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <p className="text-sm font-semibold"><KeyRound size={14} className="mr-1.5 inline" />{key.name} <span className="font-normal text-ink-2">…{key.hint}</span></p>
                <p className="text-xs text-ink-2">Created {when(key.createdAt)} · Last used {when(key.lastUsedAt)}</p>
              </div>
              <button type="button" onClick={() => revoke(key)} className="inline-flex h-8 items-center gap-1.5 rounded-none border border-destructive px-3 text-xs font-extrabold uppercase tracking-[0.05em] text-destructive hover:bg-destructive/10"><Trash2 size={13} /> Revoke</button>
            </li>
          ))}
        </ul>
      )}

      {keys.length < max ? (
        <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1"><Label htmlFor="key-name">Key name</Label><Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="mt-1.5" /></div>
          <button type="submit" disabled={busy || !name.trim()} className="inline-flex h-11 items-center gap-2 rounded-none bg-primary border-2 border-foreground hover:bg-accent-hover px-5 text-xs font-extrabold uppercase tracking-[0.05em] text-primary-foreground disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Create key</button>
        </form>
      ) : <p className="mt-4 text-sm text-ink-2">You have the maximum of {max} keys. Revoke one to create another.</p>}
    </section>
  );
}
