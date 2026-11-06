import { useEffect, useState } from 'react';
import { CheckCircle2, Chrome, Copy, Download, ExternalLink, Loader2, LockKeyhole, PlugZap, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/PageHeader';

type Marketplace = 'poshmark' | 'depop' | 'mercari';
type SessionState = 'unknown' | 'signed_in' | 'signed_out' | 'needs_attention';
type MarketplaceState = { session: SessionState; checkedAt?: string };
type ExtensionState = { detected: boolean; marketplaces: Partial<Record<Marketplace, MarketplaceState>>; updatedAt?: string };

const EXTENSION_ZIP = '/crosslinkos-extension.zip';

const PLATFORMS: Array<{ id: Marketplace; name: string; code: string; url: string; description: string }> = [
  { id: 'poshmark', name: 'Poshmark', code: 'PM', url: 'https://poshmark.com/create-listing', description: 'Open a new listing in your own Poshmark session, then let the extension fill the reviewable draft.' },
  { id: 'depop', name: 'Depop', code: 'DP', url: 'https://www.depop.com/sell/', description: 'Open the Sell flow in your own Depop session. The extension fills fields only; you keep the final save or publish.' },
  { id: 'mercari', name: 'Mercari', code: 'ME', url: 'https://www.mercari.com/sell/', description: 'Open the Mercari listing flow in your own signed-in browser session and review every prefilled value.' },
];

const PLANNED: Array<{ name: string; code: string; method: string }> = [
  { name: 'eBay', code: 'EB', method: 'Official API · one-click connect' },
  { name: 'Etsy', code: 'ET', method: 'Official API · one-click connect' },
  { name: 'Grailed', code: 'GR', method: 'Browser extension prefill' },
  { name: 'Facebook Marketplace', code: 'FB', method: 'Browser extension prefill' },
  { name: 'Whatnot', code: 'WN', method: 'Browser extension prefill' },
  { name: 'Shopify', code: 'SH', method: 'Official API · one-click connect' },
];

const stateMeta: Record<SessionState, { label: string; glyph: string; className: string; description: string }> = {
  unknown: { label: 'Not checked', glyph: '○', className: 'border border-dashed border-input text-muted-foreground', description: 'Open the marketplace with the extension installed so it can check the local browser session.' },
  signed_in: { label: 'Signed in locally', glyph: '●', className: 'bg-success-tint text-foreground', description: 'The extension saw an active local session in this Chrome profile. CrossLinkOS never receives the session credential.' },
  signed_out: { label: 'Sign-in needed', glyph: '◐', className: 'bg-warning-tint text-warning', description: 'Sign in directly in the marketplace tab, then return here and check again.' },
  needs_attention: { label: 'Needs attention', glyph: '▲', className: 'bg-danger-tint text-destructive', description: 'Open the marketplace and verify the listing form is visible before filling.' },
};

const INSTALL_STEPS: Array<{ title: string; body: string }> = [
  { title: 'Download the extension', body: 'Use the download button above. You get a small zip file with the extension inside.' },
  { title: 'Unzip it', body: 'Double-click the zip to extract it. Keep the folder somewhere permanent, such as Documents. Chrome reads it from there each time it starts.' },
  { title: 'Open Chrome extensions', body: 'Copy chrome://extensions, paste it into a new tab, and press Enter. Chrome blocks links to this page, so it has to be pasted.' },
  { title: 'Turn on Developer mode', body: 'Flip the Developer mode switch in the upper-right corner of the extensions page.' },
  { title: 'Load the folder', body: 'Choose Load unpacked and select the crosslinkos-extension folder you unzipped. Pin it from the puzzle-piece menu if you like.' },
  { title: 'Come back and check', body: 'Refresh this page, then press Check extension. The status above turns green when Chrome can see it.' },
];

const initialState: ExtensionState = { detected: false, marketplaces: {} };

export default function Connections() {
  const { toast } = useToast();
  const [extension, setExtension] = useState<ExtensionState>(initialState);
  const [isChecking, setIsChecking] = useState(false);

  const checkExtension = () => {
    setIsChecking(true);
    window.dispatchEvent(new CustomEvent('crosslinkos:connection-request'));
    window.setTimeout(() => setIsChecking(false), 900);
  };

  useEffect(() => {
    const receiveState = (event: Event) => {
      const custom = event as CustomEvent<ExtensionState>;
      if (!custom.detail || typeof custom.detail !== 'object') return;
      setExtension({ detected: Boolean(custom.detail.detected), marketplaces: custom.detail.marketplaces ?? {}, updatedAt: custom.detail.updatedAt ?? new Date().toISOString() });
    };
    window.addEventListener('crosslinkos:connection-status', receiveState as EventListener);
    checkExtension();
    return () => window.removeEventListener('crosslinkos:connection-status', receiveState as EventListener);
  }, []);

  const copyExtensionsUrl = async () => {
    try {
      await navigator.clipboard.writeText('chrome://extensions');
      toast({ title: 'Copied', description: 'Paste chrome://extensions into a new Chrome tab.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Type chrome://extensions into the address bar of a new tab.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        label="Marketplaces / local Chrome sessions"
        title="You stay signed in. You stay in control."
        description="CrossLinkOS never collects or stores your marketplace passwords or cookies. The Chrome extension works only inside your own signed-in browser and stops before save or publish."
        actions={(
          <button type="button" onClick={checkExtension} className="inline-flex h-11 items-center gap-2 rounded-none border border-foreground px-5 text-xs font-extrabold uppercase tracking-[0.05em] transition-colors hover:bg-muted">
            {isChecking ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />} Check extension
          </button>
        )}
      />

      {extension.detected ? (
        <section className="flex flex-col gap-4 border-2 border-border bg-success-tint p-5 sm:flex-row sm:items-center sm:justify-between" role="status">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none bg-success text-success-foreground"><CheckCircle2 size={20} /></span>
            <div>
              <p className="font-semibold text-foreground">Extension detected in this Chrome profile</p>
              <p className="mt-1 text-sm text-ink-2">Last local check {extension.updatedAt ? new Date(extension.updatedAt).toLocaleTimeString() : 'just now'}. Prefilling is ready for Poshmark, Depop and Mercari.</p>
            </div>
          </div>
          <a href={EXTENSION_ZIP} download className="inline-flex h-10 items-center gap-2 self-start rounded-none border border-border px-4 text-sm font-medium text-foreground hover:bg-success-tint sm:self-auto"><Download size={15} /> Re-download</a>
        </section>
      ) : (
        <section className="tile-inverse corner-ticks flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <p className="font-semibold text-[0.6875rem] uppercase tracking-[0.08em] text-label-on-inverse">Extension not detected</p>
            <h2 className="mt-3 font-display text-2xl font-bold leading-tight">Install the CrossLinkOS extension to prefill marketplace forms</h2>
            <p className="mt-2 text-sm leading-6 text-on-inverse-muted">Chrome 114 or newer on desktop. It takes about two minutes and works with your existing marketplace logins.</p>
          </div>
          <a href={EXTENSION_ZIP} download className="inline-flex h-12 shrink-0 items-center gap-2 self-start rounded-none bg-accent-alt px-6 text-sm font-semibold text-inverse sm:self-auto">
            <Download size={16} /> Download extension
          </a>
        </section>
      )}

      <section aria-label="Marketplace connections" className="grid gap-4 lg:grid-cols-3">
        {PLATFORMS.map((platform) => {
          const state = extension.marketplaces[platform.id]?.session ?? 'unknown';
          const meta = stateMeta[state];
          const checkedAt = extension.marketplaces[platform.id]?.checkedAt;
          return (
            <article key={platform.id} className="flex flex-col border-2 border-border bg-muted p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-none bg-accent-tint text-sm font-medium text-foreground">{platform.code}</span>
                <span className={`inline-flex h-[26px] items-center gap-1.5 rounded-none px-2.5 font-semibold text-[0.6875rem] uppercase tracking-[0.06em] ${meta.className}`}><span aria-hidden="true">{meta.glyph}</span>{meta.label}</span>
              </div>
              <h2 className="mt-5 text-[0.9375rem] font-extrabold">{platform.name}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-2">{platform.description}</p>
              <div className="mt-4 rounded-none border border-border p-3">
                <p className="cx-eyebrow">Local session</p>
                <p className="mt-1.5 text-xs leading-5 text-ink-2">{meta.description}</p>
                {checkedAt && <p className="mt-2 font-semibold text-[0.6875rem] text-muted-foreground">Checked {new Date(checkedAt).toLocaleString()}</p>}
              </div>
              <a href={platform.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-none bg-primary border-2 border-foreground hover:bg-accent-hover text-xs font-extrabold uppercase tracking-[0.05em] text-primary-foreground ">Open {platform.name} <ExternalLink size={14} /></a>
            </article>
          );
        })}
      </section>

      <section aria-label="Install steps" className="border-2 border-border bg-muted p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[0.9375rem] font-extrabold">Install in six steps</h2>
          <button type="button" onClick={copyExtensionsUrl} className="inline-flex items-center gap-2 rounded-none border border-border px-3.5 py-1.5 font-semibold text-xs hover:bg-muted"><Copy size={13} /> chrome://extensions</button>
        </div>
        <ol className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {INSTALL_STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3 rounded-none border border-border p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none bg-muted font-semibold text-xs text-ink-2">{index + 1}</span>
              <div><p className="text-sm font-semibold">{step.title}</p><p className="mt-1 text-sm leading-5 text-ink-2">{step.body}</p></div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">Preview deployments and local dev servers are not recognized by the extension. It connects to the production app at crosslinkos.vercel.app only.</p>
      </section>

      <section aria-label="More marketplaces" className="border-2 border-border bg-muted px-7 py-6">
        <div className="flex items-baseline justify-between pb-3">
          <h2 className="text-[0.9375rem] font-extrabold">More marketplaces</h2>
          <span className="sticker">Soon</span>
        </div>
        {PLANNED.map((market) => (
          <div key={market.name} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-4 border-t border-border py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-none border border-dashed border-input font-semibold text-[0.625rem] text-muted-foreground">{market.code}</span>
            <div className="min-w-0"><p className="text-[0.9375rem] font-medium">{market.name}</p><p className="font-semibold text-xs text-muted-foreground">{market.method}</p></div>
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-none border border-dashed border-input px-2.5 font-semibold text-[0.6875rem] uppercase tracking-[0.06em] text-muted-foreground"><span aria-hidden="true">○</span>Planned</span>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3" aria-label="Safety">
        {[
          { icon: <LockKeyhole size={18} />, title: 'No credential storage', body: 'Your marketplace password, MFA prompts and browser cookies stay with the marketplace and your browser.' },
          { icon: <Chrome size={18} />, title: 'Local browser handoff', body: 'Selected drafts go to the extension in this Chrome profile, not to a hosted posting bot.' },
          { icon: <ShieldCheck size={18} />, title: 'Manual final action', body: 'The extension fills a form and stops. You review it and choose whether to save or publish.' },
        ].map((card) => (
          <div key={card.title} className="border-2 border-border bg-muted p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-none bg-accent-tint text-foreground">{card.icon}</span>
            <p className="mt-3 text-sm font-semibold">{card.title}</p>
            <p className="mt-1.5 text-sm leading-5 text-ink-2">{card.body}</p>
          </div>
        ))}
      </section>

    </div>
  );
}
