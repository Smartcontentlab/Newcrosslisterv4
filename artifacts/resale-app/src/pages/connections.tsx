import { useEffect, useState } from 'react';
import { CheckCircle2, Chrome, ExternalLink, Loader2, LockKeyhole, PlugZap, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Marketplace = 'poshmark' | 'depop' | 'mercari';
type SessionState = 'unknown' | 'signed_in' | 'signed_out' | 'needs_attention';
type MarketplaceState = { session: SessionState; checkedAt?: string };
type ExtensionState = { detected: boolean; marketplaces: Partial<Record<Marketplace, MarketplaceState>>; updatedAt?: string };

const PLATFORMS: Array<{ id: Marketplace; name: string; url: string; initial: string; description: string }> = [
  { id: 'poshmark', name: 'Poshmark', url: 'https://poshmark.com/', initial: 'P', description: 'Open a new listing in your own Poshmark session, then let the extension fill the reviewable draft.' },
  { id: 'depop', name: 'Depop', url: 'https://www.depop.com/', initial: 'D', description: 'Open the Sell flow in your own Depop session. The extension fills fields only; you keep the final save or publish action.' },
  { id: 'mercari', name: 'Mercari', url: 'https://www.mercari.com/', initial: 'M', description: 'Open the Mercari listing flow in your own signed-in browser session and review every prefilled value.' },
];

const initialState: ExtensionState = { detected: false, marketplaces: {} };
const stateMeta: Record<SessionState, { label: string; className: string; description: string }> = {
  unknown: { label: 'Unknown', className: 'border-border bg-background/45 text-muted-foreground', description: 'Open the marketplace with the extension installed so it can check the local browser session.' },
  signed_in: { label: 'Signed in locally', className: 'border-accent/35 bg-accent/10 text-accent', description: 'The extension observed an active local session in this Chrome profile. CrossLinkOS never receives the session credential.' },
  signed_out: { label: 'Sign-in needed', className: 'border-amber-400/35 bg-amber-400/10 text-amber-200', description: 'Sign in directly in the marketplace tab, then return to this page and refresh the local extension status.' },
  needs_attention: { label: 'Needs attention', className: 'border-destructive/35 bg-destructive/10 text-destructive', description: 'The extension needs you to open the marketplace and verify the listing form before filling.' },
};

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

  const copyWorkflow = () => toast({ title: 'Your control remains required', description: 'Open the marketplace yourself, review the filled form, then manually save or publish. The extension never stores passwords or cookies.' });

  return <div className="space-y-6">
    <section className="cx-panel rounded-2xl p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><p className="cx-eyebrow">Marketplace Connections / local Chrome sessions</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">You stay signed in. You stay in control.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">CrossLinkOS does not collect, store, or use marketplace passwords or cookies. The optional Chrome extension works only in your locally signed-in browser profile and stops before save or publish.</p></div><button type="button" onClick={checkExtension} className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-4 py-3 text-sm font-bold text-primary hover:bg-primary/20">{isChecking ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />}Check local extension</button></div></section>
    <section className={`rounded-2xl border p-5 ${extension.detected ? 'border-accent/35 bg-accent/5' : 'border-border bg-background/30'}`}><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${extension.detected ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border bg-background/45 text-muted-foreground'}`}>{extension.detected ? <CheckCircle2 size={20} /> : <Chrome size={20} />}</span><div><p className="font-semibold text-foreground">{extension.detected ? 'CrossLinkOS extension detected in this Chrome profile' : 'CrossLinkOS extension not detected in this Chrome profile'}</p><p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{extension.detected ? `Last local status update: ${extension.updatedAt ? new Date(extension.updatedAt).toLocaleString() : 'just now'}.` : 'Install the unpacked extension in Chrome, then choose Check local extension. The connection state is local to this browser—not a stored marketplace credential.'}</p></div></div><button type="button" onClick={copyWorkflow} className="rounded-lg border border-border bg-background/45 px-3 py-2 text-xs font-bold text-foreground hover:border-primary/35">Review safety promise</button></div></section>
    <section className="grid gap-5 lg:grid-cols-3">{PLATFORMS.map((platform) => { const state = extension.marketplaces[platform.id]?.session ?? 'unknown'; const meta = stateMeta[state]; return <article key={platform.id} className="cx-panel rounded-2xl p-5"><div className="flex items-start justify-between gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/35 bg-primary/10 font-mono text-sm font-bold text-primary">{platform.initial}</span><span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-bold ${meta.className}`}>{meta.label}</span></div><h2 className="mt-5 text-xl font-semibold text-foreground">{platform.name}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{platform.description}</p><div className="mt-5 rounded-xl border border-border bg-background/30 p-3"><p className="text-xs font-semibold text-foreground">Local session status</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{meta.description}</p>{extension.marketplaces[platform.id]?.checkedAt && <p className="mt-2 font-mono text-[0.6rem] text-muted-foreground">CHECKED {new Date(extension.marketplaces[platform.id]?.checkedAt ?? '').toLocaleString()}</p>}</div><a href={platform.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-3 py-2.5 text-sm font-bold text-primary hover:bg-primary/20">Open {platform.name} <ExternalLink size={15} /></a></article>; })}</section>
    <section className="grid gap-4 lg:grid-cols-3"><div className="rounded-xl border border-border bg-background/30 p-4"><LockKeyhole size={18} className="text-primary" /><p className="mt-3 text-sm font-semibold text-foreground">No credential storage</p><p className="mt-2 text-sm leading-5 text-muted-foreground">Your marketplace password, MFA prompts, and browser cookies remain with the marketplace and your browser.</p></div><div className="rounded-xl border border-border bg-background/30 p-4"><Chrome size={18} className="text-primary" /><p className="mt-3 text-sm font-semibold text-foreground">Local browser handoff</p><p className="mt-2 text-sm leading-5 text-muted-foreground">Selected “Needs posted” drafts are sent to the extension running in this Chrome profile, not to a hosted posting bot.</p></div><div className="rounded-xl border border-border bg-background/30 p-4"><ShieldCheck size={18} className="text-primary" /><p className="mt-3 text-sm font-semibold text-foreground">Manual final action</p><p className="mt-2 text-sm leading-5 text-muted-foreground">The extension fills a form and stops. You review details and manually choose whether to save a marketplace draft or publish.</p></div></section>
  </div>;
}
