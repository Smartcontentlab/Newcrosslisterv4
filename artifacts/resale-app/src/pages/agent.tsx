import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, Copy, Check, ChevronDown, ChevronRight, Zap, Globe, List } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-pixel text-xs text-muted-foreground uppercase">{label}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-sans border transition-all"
          style={copied
            ? { borderColor: 'rgba(0,255,209,0.6)', color: '#00FFD1', boxShadow: '0 0 8px rgba(0,255,209,0.3)' }
            : { borderColor: 'rgba(255,255,255,0.15)', color: '#888' }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre
        className="text-xs font-mono rounded-lg p-4 overflow-x-auto"
        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
      >
        {value}
      </pre>
    </div>
  );
}

function Section({ title, icon, children, defaultOpen = false }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card-glow rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="text-primary">{icon}</span>
          <span className="font-pixel text-sm text-foreground">{title}</span>
        </div>
        {open ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">{children}</div>}
    </div>
  );
}

export default function AgentPage() {
  const { toast } = useToast();
  const [apiUrl, setApiUrl] = useState('');

  useEffect(() => {
    // Derive the full API base URL visible to an external agent
    const origin = window.location.origin;
    const base = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';
    setApiUrl(`${origin}${base}/api`);
  }, []);

  const { data: status } = useQuery({
    queryKey: ['agent-status'],
    queryFn: () => fetch(`${API_BASE}/agent/status`).then(r => r.json()),
    refetchInterval: 10_000,
  });

  const { data: queue } = useQuery({
    queryKey: ['agent-queue'],
    queryFn: () => fetch(`${API_BASE}/agent/queue`).then(r => r.json()),
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

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-pixel text-4xl text-primary text-glow-pink glitch-text mb-2" data-text="Agent Hub">
          Agent Hub
        </h1>
        <p className="text-muted-foreground font-sans">
          Hook up any AI agent with browser control to auto-post your listings ★
        </p>
      </div>

      {/* Status bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Items', value: status?.stats?.totalItems ?? '—', color: 'text-primary', glow: 'text-glow-pink' },
          { label: 'Pending Posts', value: status?.stats?.pendingPosts ?? '—', color: 'text-yellow-400', glow: '' },
          { label: 'Total Listings', value: status?.stats?.totalListings ?? '—', color: 'text-accent', glow: 'text-glow-mint' },
        ].map(s => (
          <div key={s.label} className="glass-card-glow rounded-xl p-4 text-center">
            <p className={`font-pixel text-2xl ${s.color} ${s.glow}`}>{s.value}</p>
            <p className="font-sans text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* API URL */}
      <div className="glass-card-glow rounded-xl p-5 border border-primary/30" style={{ boxShadow: '0 0 20px rgba(255,45,120,0.08)' }}>
        <p className="font-pixel text-xs text-primary text-glow-pink mb-3">Agent API Endpoint</p>
        <div className="flex items-center gap-3">
          <code className="flex-1 font-mono text-sm text-foreground bg-black/30 px-4 py-2.5 rounded-lg border border-white/10">
            {apiUrl || 'loading...'}
          </code>
          <button
            onClick={() => { navigator.clipboard.writeText(apiUrl); toast({ title: 'Copied!' }); }}
            className="px-4 py-2.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-all font-sans text-sm"
          >
            <Copy size={15} />
          </button>
        </div>
        <p className="font-sans text-xs text-muted-foreground mt-3">
          Give this URL to your agent. All agent endpoints live under <code className="text-primary">/api/agent/</code>
        </p>
      </div>

      {/* Live Queue */}
      <Section title="Live Posting Queue" icon={<List size={16} />} defaultOpen={true}>
        {!queue || queue.count === 0 ? (
          <p className="font-sans text-muted-foreground text-sm text-center py-4">Queue is empty — all items posted ♥</p>
        ) : (
          <div className="space-y-3">
            {queue.queue?.slice(0, 8).map((item: any) => (
              <div key={item.itemId} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div>
                  <p className="font-sans font-bold text-sm text-foreground">{item.title}</p>
                  <p className="font-sans text-xs text-muted-foreground mt-0.5">ID #{item.itemId} · {item.brand || 'No brand'}</p>
                </div>
                <div className="flex gap-1.5 flex-wrap justify-end max-w-[200px]">
                  {item.pendingMarketplaces.map((mp: string) => (
                    <span key={mp} className="px-2 py-0.5 rounded-full text-[10px] font-pixel" style={{ background: 'rgba(255,45,120,0.12)', border: '1px solid rgba(255,45,120,0.3)', color: '#FF2D78' }}>
                      {mp}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {queue.count > 8 && (
              <p className="font-sans text-xs text-muted-foreground text-center">+{queue.count - 8} more items</p>
            )}
          </div>
        )}
      </Section>

      {/* Quick-start guides */}
      <Section title="Claude (Computer Use / Tool Use)" icon={<Bot size={16} />} defaultOpen={true}>
        <p className="font-sans text-sm text-muted-foreground">
          Add these tools to your Claude API call, paste the system prompt, and Claude will automatically work through the posting queue using computer use or tool_use.
        </p>
        <CopyBlock label="tools array (paste into your Claude API call)" value={toolsJson} />
        <CopyBlock label="System prompt" value={systemPrompt} />
        <CopyBlock label="Full claude config object" value={claudeConfig} />
      </Section>

      <Section title="Hermes / OpenAI-compatible (function calling)" icon={<Zap size={16} />}>
        <p className="font-sans text-sm text-muted-foreground">
          Works with Nous-Hermes-2, OpenHermes, GPT-4, or any OpenAI-compatible model with function calling. Point the base URL at your local Ollama, LM Studio, or any OpenAI-compatible endpoint.
        </p>
        <CopyBlock label="Python snippet" value={hermesConfig} lang="python" />
      </Section>

      <Section title="Raw API reference" icon={<Globe size={16} />}>
        <div className="space-y-4">
          {[
            {
              method: 'GET', path: '/api/agent/status',
              desc: 'Agent capabilities, live stats, and all tool schemas in one call.',
              body: null,
            },
            {
              method: 'GET', path: '/api/agent/queue',
              desc: 'All items pending posting with pre-generated title/description/price/tags for each platform.',
              body: null,
            },
            {
              method: 'GET', path: '/api/agent/instructions/:itemId/:marketplace',
              desc: 'Step-by-step browser instructions: CSS selectors, React-fill JS snippets, photo notes, and a callback template.',
              body: null,
            },
            {
              method: 'POST', path: '/api/agent/complete',
              desc: 'Mark a post as done. Creates a Listing record in ListFlow.',
              body: '{ "itemId": 1, "marketplace": "poshmark", "success": true, "postedUrl": "https://..." }',
            },
          ].map(ep => (
            <div key={ep.path} className="rounded-lg p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-3 mb-2">
                <span className={`font-pixel text-xs px-2 py-0.5 rounded ${ep.method === 'GET' ? 'bg-accent/20 text-accent' : 'bg-primary/20 text-primary'}`}>
                  {ep.method}
                </span>
                <code className="font-mono text-sm text-foreground">{ep.path}</code>
              </div>
              <p className="font-sans text-xs text-muted-foreground">{ep.desc}</p>
              {ep.body && (
                <pre className="mt-2 text-xs font-mono text-muted-foreground bg-black/30 p-2 rounded">{ep.body}</pre>
              )}
            </div>
          ))}
        </div>
        <CopyBlock label="Try it — get queue (curl)" value={`curl "${apiUrl}/agent/queue"`} />
        <CopyBlock label="Try it — get instructions (curl)" value={`curl "${apiUrl}/agent/instructions/1/poshmark"`} />
      </Section>
    </div>
  );
}
