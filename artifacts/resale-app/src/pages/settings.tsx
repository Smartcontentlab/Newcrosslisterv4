import { useEffect, useState, type FormEvent } from 'react';
import { useListItems } from '@workspace/api-client-react';
import { Download, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/supabase';

type Settings = {
  timezone?: string;
  defaultCurrency?: string;
  defaultShippingOrigin?: string;
  notifications?: { email?: boolean; inApp?: boolean };
};

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const { data: items } = useListItems();

  const [displayName, setDisplayName] = useState('');
  const [settings, setSettings] = useState<Settings>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.displayName ?? '');
    setSettings((profile?.settings as Settings | undefined) ?? {});
  }, [profile]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          settings: {
            timezone: settings.timezone?.trim() || undefined,
            defaultCurrency: settings.defaultCurrency?.trim() || undefined,
            defaultShippingOrigin: settings.defaultShippingOrigin?.trim() || undefined,
            notifications: { email: settings.notifications?.email ?? false, inApp: settings.notifications?.inApp ?? true },
          },
        }),
      });
      if (!response.ok) throw new Error('Your changes could not be saved.');
      await refreshProfile();
      toast({ title: 'Settings saved' });
    } catch (error) {
      toast({ title: 'Could not save', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const exportInventory = () => {
    const rows = items ?? [];
    const header = ['id', 'title', 'brand', 'category', 'condition', 'status', 'price', 'cost', 'weight_oz', 'tags', 'created_at'];
    const lines = [header.join(',')].concat(
      rows.map((item) => [item.id, item.title, item.brand, item.category, item.condition, item.status, item.price, item.cost, item.weight, (item.tags ?? []).join('|'), item.createdAt].map(csvCell).join(',')),
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `crosslinkos-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Inventory exported', description: `${rows.length} ${rows.length === 1 ? 'item' : 'items'} saved to a CSV file.` });
  };

  const panel = 'border-2 border-border bg-muted p-6';

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader label="Account" title="Settings" description="Your seller profile and defaults." />

      <form onSubmit={save} className={`${panel} space-y-5`}>
        <div>
          <p className="cx-eyebrow cx-bracket">Profile</p>
          <h2 className="mt-2 text-[0.9375rem] font-extrabold">Seller profile</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="s-name">Display name</Label><Input id="s-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} className="mt-1.5" /></div>
          <div><Label htmlFor="s-email">Email</Label><Input id="s-email" value={user?.email ?? ''} readOnly className="mt-1.5 bg-muted text-ink-2" /></div>
          <div><Label htmlFor="s-tz">Time zone</Label><Input id="s-tz" placeholder="America/Los_Angeles" value={settings.timezone ?? ''} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} className="mt-1.5 font-semibold" /></div>
          <div><Label htmlFor="s-cur">Currency</Label><Input id="s-cur" placeholder="USD" value={settings.defaultCurrency ?? ''} onChange={(e) => setSettings({ ...settings, defaultCurrency: e.target.value })} className="mt-1.5 font-semibold" /></div>
          <div className="sm:col-span-2"><Label htmlFor="s-zip">Default shipping origin</Label><Input id="s-zip" placeholder="ZIP or city, state" value={settings.defaultShippingOrigin ?? ''} onChange={(e) => setSettings({ ...settings, defaultShippingOrigin: e.target.value })} className="mt-1.5" /></div>
        </div>

        <div className="space-y-3 border-t border-border pt-5">
          <p className="cx-eyebrow">Notifications</p>
          <label className="flex items-center justify-between gap-4">
            <span><span className="block text-sm font-medium">In-app reminders</span><span className="block text-sm text-ink-2">Show items that need posting or shipping on your overview.</span></span>
            <Switch checked={settings.notifications?.inApp ?? true} onCheckedChange={(checked) => setSettings({ ...settings, notifications: { ...settings.notifications, inApp: checked } })} aria-label="In-app reminders" />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span><span className="block text-sm font-medium">Email summaries</span><span className="block text-sm text-ink-2">Your preference is saved now. Sending begins in a later release.</span></span>
            <Switch checked={settings.notifications?.email ?? false} onCheckedChange={(checked) => setSettings({ ...settings, notifications: { ...settings.notifications, email: checked } })} aria-label="Email summaries" />
          </label>
        </div>

        <button type="submit" disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-none bg-primary border-2 border-foreground hover:bg-accent-hover px-6 text-xs font-extrabold uppercase tracking-[0.05em] text-primary-foreground disabled:opacity-50">
          {saving && <Loader2 size={15} className="animate-spin" />} Save changes
        </button>
      </form>

      <section className={panel} aria-label="Plan">
        <p className="cx-eyebrow cx-bracket">Plan</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[0.9375rem] font-extrabold capitalize">{profile?.plan ?? 'free'} plan</h2>
            <p className="mt-1 text-sm text-ink-2">You are on the free plan. Plan options will appear here when they are available.</p>
          </div>
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-none bg-accent-tint px-2.5 font-semibold text-[0.6875rem] uppercase tracking-[0.06em] text-foreground"><span aria-hidden="true">✦</span>Free</span>
        </div>
      </section>

      <section className={panel} aria-label="Your data">
        <p className="cx-eyebrow cx-bracket">Your data</p>
        <h2 className="mt-2 text-[0.9375rem] font-extrabold">Export inventory</h2>
        <p className="mt-1 text-sm text-ink-2">Download every item as a CSV file you can open in Excel or Google Sheets. Your data is always yours to take with you.</p>
        <button type="button" onClick={exportInventory} className="mt-4 inline-flex h-11 items-center gap-2 rounded-none border border-foreground px-5 text-xs font-extrabold uppercase tracking-[0.05em] hover:bg-muted"><Download size={15} /> Download CSV</button>
      </section>
    </div>
  );
}
