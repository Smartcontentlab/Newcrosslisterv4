import { PageHeader } from '@/components/PageHeader';
import { useState, useCallback } from 'react';
import { useAiChat, useGetPriceEstimate, useGenerateListing, useListItems } from '@workspace/api-client-react';
import { Sparkles, Send, DollarSign, Wand2, Copy, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { GenerateListingRequestMarketplace, PriceEstimate } from '@workspace/api-client-react';

function CopyField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <div className="space-y-1.5 group">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-pixel text-muted-foreground">{label}</span>
        <button
          onClick={copy}
          type="button"
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-sans font-bold transition-all border border-transparent hover:bg-muted opacity-0 group-hover:opacity-100"
          style={copied ? { color: '#00FFD1', opacity: 1 } : { color: '#aaa' }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div
        className="w-full rounded-none px-4 py-3 text-sm font-sans text-foreground cursor-text select-all transition-all hover:bg-muted border border-border"
        style={{
          background: 'rgba(0,0,0,0.2)',
          fontFamily: mono ? '"Spline Sans Mono", monospace' : undefined,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: '1.5',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function AiAssistant() {
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState<{role: 'u'|'a', text: string}[]>([]);
  
  const [priceForm, setPriceForm] = useState({ title: '', brand: '', model: '', condition: '', category: '' });
  const [priceResult, setPriceResult] = useState<PriceEstimate | null>(null);

  const [listingForm, setListingForm] = useState({ itemId: '', marketplace: 'ebay' as GenerateListingRequestMarketplace });
  const [listingResult, setListingResult] = useState<any>(null);

  const { data: items } = useListItems();
  const chat = useAiChat();
  const getPriceEstimate = useGetPriceEstimate();
  const generateListing = useGenerateListing();
  const { toast } = useToast();

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msg.trim()) return;
    setHistory(p => [...p, {role: 'u', text: msg}]);
    chat.mutate({ data: { message: msg } }, {
      onSuccess: d => setHistory(p => [...p, {role: 'a', text: d.reply}]),
      onError: () => toast({ title: 'Error', description: 'Failed to get response', variant: 'destructive' })
    });
    setMsg('');
  };

  const handlePriceEstimate = (e: React.FormEvent) => {
    e.preventDefault();
    getPriceEstimate.mutate({ data: priceForm }, {
      onSuccess: (data) => {
        setPriceResult(data);
        toast({ title: 'Estimate ready' });
      },
      onError: () => toast({ title: 'Error', description: 'Failed to get estimate', variant: 'destructive' })
    });
  };

  const handleGenerateListing = (e: React.FormEvent) => {
    e.preventDefault();
    generateListing.mutate({ data: { itemId: Number(listingForm.itemId), marketplace: listingForm.marketplace } }, {
      onSuccess: (data) => {
        setListingResult(data);
        toast({ title: 'Listing generated' });
      },
      onError: () => toast({ title: 'Error', description: 'Failed to generate listing', variant: 'destructive' })
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader label="Copilot" title="AI assistant" description="Pricing ideas, listing copy and answers about your business. You review everything before it is used." />

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="glass-card border border-border p-1 bg-muted mb-6 flex space-x-1 rounded-none h-auto">
          <TabsTrigger value="chat" className="flex-1 font-sans font-bold py-3 data-[state=active]:bg-card data-[state=active]:text-foreground rounded-none transition-all text-muted-foreground" data-testid="tab-chat">
            <Sparkles size={16} className="mr-2" /> Chat
          </TabsTrigger>
          <TabsTrigger value="price" className="flex-1 font-sans font-bold py-3 data-[state=active]:bg-card data-[state=active]:text-foreground rounded-none transition-all text-muted-foreground" data-testid="tab-price">
            <DollarSign size={16} className="mr-2" /> Estimator
          </TabsTrigger>
          <TabsTrigger value="listing" className="flex-1 font-sans font-bold py-3 data-[state=active]:bg-card data-[state=active]:text-foreground rounded-none transition-all text-muted-foreground" data-testid="tab-listing">
            <Wand2 size={16} className="mr-2" /> Generator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="h-[600px] flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
            {history.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                <Sparkles size={40} className="text-foreground mb-4 animate-glow-pulse-purple" />
                <p className="font-pixel text-xs text-muted-foreground">SYSTEM READY</p>
              </div>
            )}
            {history.map((h, i) => (
              <div key={i} className={`flex ${h.role === 'u' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 rounded-none font-sans text-sm leading-relaxed ${
                  h.role === 'u' ? 'bg-accent-tint border border-border text-foreground ml-12' : 'glass-card border-border mr-12 text-foreground'
                }`}>
                  {h.text}
                </div>
              </div>
            ))}
            {chat.isPending && (
              <div className="flex justify-start">
                <div className="glass-card p-4 rounded-none border-border flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
          </div>

          <form onSubmit={send} className="shrink-0 relative">
            <Input 
              value={msg} 
              onChange={e => setMsg(e.target.value)} 
              placeholder="Ask about items, trends, or sales..." 
              className="bg-muted border-border h-14 pl-5 pr-14 font-sans text-base focus-visible:ring-secondary focus-visible:border-input " 
              disabled={chat.isPending}
            />
            <button 
              type="submit" 
              disabled={chat.isPending || !msg.trim()}
              className="absolute right-2 top-2 bottom-2 w-10 flex items-center justify-center rounded-none bg-accent-tint text-foreground hover:bg-accent-tint transition-colors disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </form>
        </TabsContent>

        <TabsContent value="price" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card rounded-none p-6 border-border border-t-accent/30">
            <h2 className="font-pixel text-xs text-muted-foreground mb-6 flex items-center gap-2">
              <DollarSign size={14} className="text-foreground" /> Item Details
            </h2>
            <form onSubmit={handlePriceEstimate} className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={priceForm.title} onChange={e => setPriceForm({ ...priceForm, title: e.target.value })} required className="bg-muted focus:border-border" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Brand</Label>
                  <Input value={priceForm.brand} onChange={e => setPriceForm({ ...priceForm, brand: e.target.value })} className="bg-muted focus:border-border" />
                </div>
                <div>
                  <Label>Model</Label>
                  <Input value={priceForm.model} onChange={e => setPriceForm({ ...priceForm, model: e.target.value })} className="bg-muted focus:border-border" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Condition</Label>
                  <Input value={priceForm.condition} onChange={e => setPriceForm({ ...priceForm, condition: e.target.value })} className="bg-muted focus:border-border" />
                </div>
                <div>
                  <Label>Category</Label>
                  <Input value={priceForm.category} onChange={e => setPriceForm({ ...priceForm, category: e.target.value })} className="bg-muted focus:border-border" />
                </div>
              </div>
              <button type="submit" disabled={getPriceEstimate.isPending} className="w-full py-3 bg-success text-success-foreground font-sans font-bold rounded-none disabled:opacity-50 hover:bg-success-tint transition-colors mt-4">
                {getPriceEstimate.isPending ? 'Analyzing...' : 'Calculate Estimate'}
              </button>
            </form>
          </div>

          <div className="glass-card rounded-none p-6 border-border flex flex-col">
            <h2 className="font-pixel text-xs text-muted-foreground mb-6">Prediction</h2>
            {priceResult ? (
              <div className="space-y-6 flex-1">
                <div className="text-center p-8 bg-muted rounded-none border border-border">
                  <p className="text-xs font-sans text-muted-foreground uppercase tracking-widest mb-3">Optimal Target</p>
                  <p className="font-pixel text-5xl text-foreground ">${priceResult.suggestedPrice.toFixed(2)}</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-muted p-4 rounded-none border border-border text-center">
                    <p className="text-[10px] font-pixel text-muted-foreground mb-2">Min</p>
                    <p className="font-sans font-bold text-foreground text-lg">${priceResult.minPrice.toFixed(2)}</p>
                  </div>
                  <div className="bg-muted p-4 rounded-none border border-border text-center">
                    <p className="text-[10px] font-pixel text-muted-foreground mb-2">Max</p>
                    <p className="font-sans font-bold text-foreground text-lg">${priceResult.maxPrice.toFixed(2)}</p>
                  </div>
                  <div className="bg-muted p-4 rounded-none border border-border text-center">
                    <p className="text-[10px] font-pixel text-muted-foreground mb-2">Confidence</p>
                    <p className={`font-sans font-bold text-sm mt-1 uppercase ${
                      priceResult.confidence === 'high' ? 'text-foreground' : 
                      priceResult.confidence === 'medium' ? 'text-foreground' : 'text-muted-foreground'
                    }`}>
                      {priceResult.confidence}
                    </p>
                  </div>
                </div>
                {priceResult.reasoning && (
                  <div className="bg-muted p-4 rounded-none border border-border mt-auto">
                    <p className="text-[10px] font-pixel text-muted-foreground mb-2">Analysis</p>
                    <p className="font-sans text-sm text-foreground/80 leading-relaxed">{priceResult.reasoning}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center">
                <DollarSign size={48} className="text-foreground mb-4" />
                <p className="font-sans text-sm">Awaiting input parameters</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="listing" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card rounded-none p-6 border-border border-t-secondary/30">
            <h2 className="font-pixel text-xs text-muted-foreground mb-6 flex items-center gap-2">
              <Wand2 size={14} className="text-foreground" /> Generate Copy
            </h2>
            <form onSubmit={handleGenerateListing} className="space-y-4">
              <div>
                <Label>Inventory Item</Label>
                <Select value={listingForm.itemId} onValueChange={v => setListingForm({ ...listingForm, itemId: v })}>
                  <SelectTrigger className="bg-muted focus:border-input"><SelectValue placeholder="Select item..." /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {items?.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target Marketplace</Label>
                <Select value={listingForm.marketplace} onValueChange={v => setListingForm({ ...listingForm, marketplace: v as GenerateListingRequestMarketplace })}>
                  <SelectTrigger className="bg-muted focus:border-input"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {['ebay', 'poshmark', 'depop', 'mercari', 'grailed', 'etsy', 'facebook', 'whatnot', 'shopify'].map(mp => (
                      <SelectItem key={mp} value={mp} className="capitalize">{mp}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <button type="submit" disabled={generateListing.isPending || !listingForm.itemId} className="w-full py-3 bg-secondary text-secondary-foreground font-sans font-bold rounded-none disabled:opacity-50 hover:bg-accent-tint transition-colors mt-4">
                {generateListing.isPending ? 'Generating...' : 'Create Draft'}
              </button>
            </form>
          </div>

          <div className="glass-card rounded-none p-6 border-border flex flex-col">
            <h2 className="font-pixel text-xs text-muted-foreground mb-6">Generated Content</h2>
            {listingResult ? (
              <div className="space-y-5 flex-1 overflow-y-auto">
                <CopyField label="Optimized Title" value={listingResult.title} />
                <CopyField label="Description" value={listingResult.description} />
                <div className="grid grid-cols-2 gap-4">
                  {listingResult.suggestedPrice && (
                    <CopyField label="Suggested Price" value={`$${listingResult.suggestedPrice.toFixed(2)}`} mono />
                  )}
                  {listingResult.condition && (
                    <CopyField label="Condition" value={listingResult.condition} />
                  )}
                </div>
                {listingResult.tags?.length > 0 && (
                  <CopyField label="Keywords / Tags" value={listingResult.tags.join(', ')} />
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center">
                <Wand2 size={48} className="text-foreground mb-4" />
                <p className="font-sans text-sm">Awaiting item selection</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
