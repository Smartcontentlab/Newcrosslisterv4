import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { Bot, Copy, Check, Globe, List, ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/supabase';

const API_BASE = `${import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}/api`.replace('//', '/');

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return { copied, copy };
}

function CopyBlock({ label, value, lang = 'json' }: { label: string; value: string; lang?: string }) {
  const { copied, copy } = useCopy(value);
  return (
    <div className="space-y-2 mt-4 group">
      <div className="flex items-center justify-between">
        <span className="font-pixel text-[10px] text-muted-foreground">{label}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-sans font-bold transition-all border border-transparent hover:bg-muted opacity-0 group-hover:opacity-100"
          style={copied ? { color: '#00FFD1', opacity: 1 } : { color: '#aaa' }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        className="text-xs font-mono rounded-lg p-4 overflow-x-auto"
        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
      >
        {value}
      </pre>
    </div>
  );
}

function Section({ title, icon, children, defaultOpen = false, glowColor = 'primary' }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; glowColor?: 'primary' | 'accent' | 'secondary' }) {
  const [open, setOpen] = useState(defaultOpen);
  
  const colors = {
    primary: 'text-accent-text border-primary/20',
    accent: 'text-success border-success/20',
    secondary: 'text-accent-text border-input/20',
  };

  return (
    <div className={`glass-card rounded-xl overflow-hidden border ${open ? colors[glowColor] : 'border-border/50'} transition-colors duration-300`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-muted/60 transition-all bg-muted/70"
      >
        <div className="flex items-center gap-3">
          <span className={colors[glowColor].split(' ')[0]}>{icon}</span>
          <span className="font-sans font-bold text-sm tracking-wide text-foreground uppercase">{title}</span>
        </div>
        {open ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
      </button>
      {open && <div className="p-5 border-t border-border animate-in slide-in-from-top-2 duration-200">{children}</div>}
    </div>
  );
}

export default function AgentPage() {
  const { toast } = useToast();
  const [apiUrl, setApiUrl] = useState('');

  useEffect(() => {
    const origin = window.location.origin;
    const base = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';
    setApiUrl(`${origin}${base}/api`);
  }, []);

  const { data: status } = useQuery({
    queryKey: ['agent-status'],
    queryFn: () => apiFetch(`${API_BASE}/agent/status`).then(r => r.json()),
    refetchInterval: 10_000,
  });

  const { data: queue } = useQuery({
    queryKey: ['agent-queue'],
    queryFn: () => apiFetch(`${API_BASE}/agent/queue`).then(r => r.json()),
    refetchInterval: 15_000,
  });

  const toolsJson = JSON.stringify(status?.tools ?? [], null, 2);

  const systemPrompt = `You are a marketplace posting assistant for ListFlow, an AI resale platform.

Your job: post inventory items to resale marketplaces (Poshmark, Depop, Mercari, eBay, Grailed, Etsy).

API base: ${apiUrl}

## Workflow
1. Call get_posting_queue to see what needs to be posted.
2. Pick one item + marketplace from the queue.
3. Call get_posting_instructions for that item + marketplace to get:
   - The listing content (title, description, price, tags)
   - Step-by-step browser instructions with CSS selectors
   - Platform-specific notes
4. Navigate to the marketplace and fill in the form using the instructions.
5. After posting, call mark_listing_complete with the result.
6. Repeat until the queue is empty.

## React app note
Poshmark, Depop, and Mercari are React apps. To set input values via JS:
  const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  s.call(el, 'value');
  el.dispatchEvent(new Event('input', {bubbles:true}));

Always verify you are logged in to the marketplace before trying to fill the form.`;

  const claudeConfig = JSON.stringify({
    tools: status?.tools ?? [],
    tool_choice: { type: "auto" },
    system: systemPrompt,
  }, null, 2);

  const hermesConfig = `from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:11434/v1",  # or your Hermes endpoint
    api_key="ollama",
)

tools = ${toolsJson}

response = client.chat.completions.create(
    model="nous-hermes-2-mixtral-8x7b-dpo",  # or your model
    messages=[{"role": "user", "content": "Check the posting queue and post the next item."}],
    tools=tools,
    tool_choice="auto",
)

# Handle tool_calls in response.choices[0].message.tool_calls
# Then call: ${apiUrl}/{tool_name_as_path} with the arguments`;

  const copyEndpoint = () => {
    navigator.clipboard.writeText(apiUrl);
    toast({ title: 'Endpoint URL copied' });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader label="Developer" title="Agent hub" description="API access so an outside agent can read your queue and report back. Requests use your signed-in session." />

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Items', value: status?.stats?.totalItems ?? '—', color: 'text-accent-text ' },
          { label: 'Pending Posts', value: status?.stats?.pendingPosts ?? '—', color: 'text-warning' },
          { label: 'Total Listings', value: status?.stats?.totalListings ?? '—', color: 'text-success' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-xl p-5 text-center border border-border/50 shadow-sm bg-muted/70">
            <p className={`font-pixel text-2xl mb-1 ${s.color}`}>{s.value}</p>
            <p className="font-sans text-[10px] text-muted-foreground uppercase tracking-widest">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="glass-card rounded-xl p-6 border-primary/30 relative overflow-hidden group">
        <div className="absolute inset-0 bg-accent-tint/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        <h2 className="cx-eyebrow cx-bracket mb-4">Base Endpoint</h2>
        <div className="flex items-center gap-3 relative z-10">
          <code className="flex-1 font-mono text-sm bg-muted text-foreground px-4 py-3 rounded-lg border border-border select-all">
            {apiUrl || 'loading...'}
          </code>
          <button
            onClick={copyEndpoint}
            className="p-3 rounded-lg border border-primary/30 text-accent-text hover:bg-primary/10 hover:shadow-[0_0_15px_rgba(255,45,120,0.2)] transition-all"
          >
            <Copy size={16} />
          </button>
        </div>
        <p className="text-xs font-sans text-muted-foreground mt-4 leading-relaxed">
          Provide this URL to your external agent. All tools and routes resolve relative to this base path.
        </p>
      </div>

      <div className="space-y-4">
        <Section title="Live Posting Queue" icon={<List size={16} />} defaultOpen={true} glowColor="primary">
          {!queue || queue.count === 0 ? (
            <p className="font-sans text-sm text-muted-foreground text-center py-6 border border-dashed border-border/50 rounded-lg">Queue empty — all items deployed.</p>
          ) : (
            <div className="space-y-3">
              {queue.queue?.slice(0, 8).map((item: any) => (
                <div key={item.itemId} className="flex items-center justify-between p-4 rounded-lg bg-muted/70 border border-border hover:border-primary/20 transition-colors">
                  <div>
                    <p className="font-sans font-bold text-sm text-foreground">{item.title}</p>
                    <p className="font-pixel text-[8px] text-muted-foreground mt-1.5">ID #{item.itemId} · {item.brand || 'No brand'}</p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap justify-end max-w-[200px]">
                    {item.pendingMarketplaces.map((mp: string) => (
                      <span key={mp} className="px-2 py-1 rounded bg-primary/10 border border-primary/20 text-accent-text text-[9px] font-bold uppercase tracking-wider">
                        {mp}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {queue.count > 8 && (
                <p className="font-sans text-xs text-muted-foreground text-center pt-2">+{queue.count - 8} more queued items</p>
              )}
            </div>
          )}
        </Section>

        <Section title="Claude Integration" icon={<Bot size={16} />} glowColor="secondary">
          <p className="font-sans text-sm text-muted-foreground leading-relaxed">
            Supply these tools and system prompt to Claude (via Computer Use or standard Tool Use) to let it automatically pull and post the queue.
          </p>
          <CopyBlock label="tools schema array" value={toolsJson} />
          <CopyBlock label="system prompt" value={systemPrompt} lang="text" />
          <CopyBlock label="full claude request config" value={claudeConfig} />
        </Section>

        <Section title="OpenAI / Hermes Python Setup" icon={<Zap size={16} />} glowColor="accent">
          <p className="font-sans text-sm text-muted-foreground leading-relaxed">
            Standard function-calling snippet for OpenAI-compatible models (GPT-4, OpenHermes, Nous-Hermes-2 via Ollama/LMStudio).
          </p>
          <CopyBlock label="Python Implementation" value={hermesConfig} lang="python" />
        </Section>

        <Section title="Raw API Reference" icon={<Globe size={16} />} glowColor="primary">
          <div className="space-y-4">
            {[
              { m: 'GET', p: '/api/agent/status', d: 'Agent capabilities, live stats, and tool schemas.' },
              { m: 'GET', p: '/api/agent/queue', d: 'All items pending posting with pre-generated data.' },
              { m: 'GET', p: '/api/agent/instructions/:itemId/:marketplace', d: 'CSS selectors, JS snippets, and platform notes.' },
              { m: 'POST', p: '/api/agent/complete', d: 'Mark post complete. Creates Listing record.', body: '{ "itemId": 1, "marketplace": "poshmark", "success": true, "postedUrl": "https://..." }' },
            ].map(ep => (
              <div key={ep.p} className="rounded-lg p-4 bg-muted/70 border border-border">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`font-pixel text-[10px] px-2 py-1 rounded ${ep.m === 'GET' ? 'bg-success/20 text-success border border-success/20' : 'bg-primary/20 text-accent-text border border-primary/20'}`}>
                    {ep.m}
                  </span>
                  <code className="font-mono text-sm text-foreground">{ep.p}</code>
                </div>
                <p className="font-sans text-sm text-muted-foreground">{ep.d}</p>
                {ep.body && <pre className="mt-3 text-xs font-mono text-muted-foreground bg-muted p-3 rounded border border-border">{ep.body}</pre>}
              </div>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-border space-y-4">
            <CopyBlock label="Test Queue (cURL)" value={`curl "${apiUrl}/agent/queue"`} lang="bash" />
            <CopyBlock label="Test Instructions (cURL)" value={`curl "${apiUrl}/agent/instructions/1/poshmark"`} lang="bash" />
          </div>
        </Section>
      </div>
    </div>
  );
}
