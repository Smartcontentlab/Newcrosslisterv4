import { useState } from 'react';
import { useAiChat, useGetPriceEstimate, useGenerateListing, useListItems } from '@workspace/api-client-react';
import { Sparkles, Send, DollarSign, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { GenerateListingRequestMarketplace } from '@workspace/api-client-react';

export default function AiAssistant() {
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant'; message: string }>>([]);
  
  const [priceForm, setPriceForm] = useState({
    title: '',
    brand: '',
    model: '',
    condition: '',
    category: '',
  });
  const [priceResult, setPriceResult] = useState<any>(null);

  const [listingForm, setListingForm] = useState({
    itemId: '',
    marketplace: 'ebay' as GenerateListingRequestMarketplace,
  });
  const [listingResult, setListingResult] = useState<any>(null);

  const { data: items } = useListItems();
  const aiChat = useAiChat();
  const getPriceEstimate = useGetPriceEstimate();
  const generateListing = useGenerateListing();
  const { toast } = useToast();

  const handleChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    setChatHistory([...chatHistory, { role: 'user', message: chatMessage }]);
    
    aiChat.mutate(
      { data: { message: chatMessage } },
      {
        onSuccess: (data) => {
          setChatHistory(prev => [...prev, { role: 'assistant', message: data.reply }]);
          setChatMessage('');
        },
        onError: () => {
          toast({ title: 'Error', description: 'Failed to get response', variant: 'destructive' });
        },
      }
    );
  };

  const handlePriceEstimate = (e: React.FormEvent) => {
    e.preventDefault();
    getPriceEstimate.mutate(
      { data: priceForm },
      {
        onSuccess: (data) => {
          setPriceResult(data);
          toast({ title: '✦ Estimate ready!', description: 'Price suggestion generated' });
        },
        onError: () => {
          toast({ title: 'Error', description: 'Failed to get estimate', variant: 'destructive' });
        },
      }
    );
  };

  const handleGenerateListing = (e: React.FormEvent) => {
    e.preventDefault();
    generateListing.mutate(
      { data: { itemId: Number(listingForm.itemId), marketplace: listingForm.marketplace } },
      {
        onSuccess: (data) => {
          setListingResult(data);
          toast({ title: '✦ Listing generated!', description: 'AI-powered listing ready' });
        },
        onError: () => {
          toast({ title: 'Error', description: 'Failed to generate listing', variant: 'destructive' });
        },
      }
    );
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="font-pixel text-4xl text-primary text-glow-pink glitch-text mb-2" data-text="AI Assistant">
          AI Assistant
        </h1>
        <p className="text-muted-foreground font-sans">Your resale copilot ★</p>
      </div>

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="glass-card border border-border/50 p-1">
          <TabsTrigger value="chat" className="font-sans font-bold data-[state=active]:bg-primary/20 data-[state=active]:text-primary" data-testid="tab-chat">
            <Sparkles size={16} className="mr-2" /> Chat
          </TabsTrigger>
          <TabsTrigger value="price" className="font-sans font-bold data-[state=active]:bg-accent/20 data-[state=active]:text-accent" data-testid="tab-price">
            <DollarSign size={16} className="mr-2" /> Price Estimator
          </TabsTrigger>
          <TabsTrigger value="listing" className="font-sans font-bold data-[state=active]:bg-secondary/20 data-[state=active]:text-secondary" data-testid="tab-listing">
            <Wand2 size={16} className="mr-2" /> Listing Generator
          </TabsTrigger>
        </TabsList>

        {/* Chat Tab */}
        <TabsContent value="chat" className="space-y-4">
          <div className="glass-card-glow p-6 rounded-xl h-[500px] flex flex-col">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4" data-testid="chat-messages">
              {chatHistory.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <Sparkles size={48} className="mx-auto mb-4 text-primary animate-glow-pulse" />
                    <p className="font-pixel text-lg text-muted-foreground mb-2">AI Ready ★</p>
                    <p className="text-sm text-muted-foreground font-sans">Ask me anything about reselling!</p>
                  </div>
                </div>
              ) : (
                chatHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    data-testid={`message-${idx}`}
                  >
                    <div
                      className={`
                        max-w-[80%] p-4 rounded-xl font-sans
                        ${msg.role === 'user' 
                          ? 'glass-card border border-primary/50 neon-glow-pink text-foreground' 
                          : 'glass-card border border-accent/50 text-foreground'
                        }
                      `}
                    >
                      {msg.message}
                    </div>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handleChat} className="flex gap-2">
              <Input
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Ask me anything..."
                className="glass-card border-border/50 focus:border-primary flex-1"
                disabled={aiChat.isPending}
                data-testid="input-chat"
              />
              <Button type="submit" className="neon-glow-pink font-sans font-bold" disabled={aiChat.isPending} data-testid="button-send">
                <Send size={20} />
              </Button>
            </form>
          </div>
        </TabsContent>

        {/* Price Estimator Tab */}
        <TabsContent value="price" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card-glow p-6 rounded-xl">
              <h2 className="font-pixel text-xl text-accent text-glow-mint mb-6">Enter Details</h2>
              <form onSubmit={handlePriceEstimate} className="space-y-4">
                <div>
                  <Label className="font-sans font-bold">Title</Label>
                  <Input
                    value={priceForm.title}
                    onChange={(e) => setPriceForm({ ...priceForm, title: e.target.value })}
                    required
                    className="glass-card border-border/50 focus:border-accent"
                    data-testid="input-price-title"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="font-sans font-bold">Brand</Label>
                    <Input
                      value={priceForm.brand}
                      onChange={(e) => setPriceForm({ ...priceForm, brand: e.target.value })}
                      className="glass-card border-border/50 focus:border-accent"
                      data-testid="input-price-brand"
                    />
                  </div>
                  <div>
                    <Label className="font-sans font-bold">Model</Label>
                    <Input
                      value={priceForm.model}
                      onChange={(e) => setPriceForm({ ...priceForm, model: e.target.value })}
                      className="glass-card border-border/50 focus:border-accent"
                      data-testid="input-price-model"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="font-sans font-bold">Condition</Label>
                    <Input
                      value={priceForm.condition}
                      onChange={(e) => setPriceForm({ ...priceForm, condition: e.target.value })}
                      className="glass-card border-border/50 focus:border-accent"
                      data-testid="input-price-condition"
                    />
                  </div>
                  <div>
                    <Label className="font-sans font-bold">Category</Label>
                    <Input
                      value={priceForm.category}
                      onChange={(e) => setPriceForm({ ...priceForm, category: e.target.value })}
                      className="glass-card border-border/50 focus:border-accent"
                      data-testid="input-price-category"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full neon-glow-mint bg-accent hover:bg-accent/80 text-background font-sans font-bold" disabled={getPriceEstimate.isPending} data-testid="button-estimate">
                  {getPriceEstimate.isPending ? 'Analyzing...' : 'Get Estimate ✦'}
                </Button>
              </form>
            </div>

            <div className="glass-card-glow p-6 rounded-xl">
              <h2 className="font-pixel text-xl text-primary text-glow-pink mb-6">Estimate</h2>
              {priceResult ? (
                <div className="space-y-6">
                  <div className="text-center p-8 glass-card rounded-xl border border-primary/50 neon-glow-pink">
                    <p className="text-sm text-muted-foreground font-sans mb-2">Suggested Price</p>
                    <p className="font-pixel text-5xl text-primary text-glow-pink">${priceResult.suggestedPrice.toFixed(2)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="glass-card p-4 rounded-lg">
                      <p className="text-xs text-muted-foreground font-sans mb-1">Min Price</p>
                      <p className="font-pixel text-accent text-glow-mint">${priceResult.minPrice.toFixed(2)}</p>
                    </div>
                    <div className="glass-card p-4 rounded-lg">
                      <p className="text-xs text-muted-foreground font-sans mb-1">Max Price</p>
                      <p className="font-pixel text-accent text-glow-mint">${priceResult.maxPrice.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="glass-card p-4 rounded-lg">
                    <p className="text-xs text-muted-foreground font-sans mb-2">Confidence</p>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold font-sans ${
                      priceResult.confidence === 'high' ? 'bg-accent/20 text-accent border border-accent/50' :
                      priceResult.confidence === 'medium' ? 'bg-secondary/20 text-secondary border border-secondary/50' :
                      'bg-muted/50 text-muted-foreground'
                    }`}>
                      {priceResult.confidence.toUpperCase()}
                    </span>
                  </div>
                  {priceResult.reasoning && (
                    <div className="glass-card p-4 rounded-lg">
                      <p className="text-xs text-muted-foreground font-sans mb-2">Reasoning</p>
                      <p className="text-sm font-sans text-foreground">{priceResult.reasoning}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <DollarSign size={48} className="mx-auto mb-4 text-accent opacity-30" />
                    <p className="font-sans text-muted-foreground">Fill the form to get an estimate</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Listing Generator Tab */}
        <TabsContent value="listing" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card-glow p-6 rounded-xl">
              <h2 className="font-pixel text-xl text-secondary text-glow-purple mb-6">Generate Listing</h2>
              <form onSubmit={handleGenerateListing} className="space-y-4">
                <div>
                  <Label className="font-sans font-bold">Select Item</Label>
                  <Select value={listingForm.itemId} onValueChange={(v) => setListingForm({ ...listingForm, itemId: v })}>
                    <SelectTrigger className="glass-card border-border/50" data-testid="select-item">
                      <SelectValue placeholder="Choose an item..." />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-secondary/50">
                      {items?.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-sans font-bold">Target Marketplace</Label>
                  <Select value={listingForm.marketplace} onValueChange={(v) => setListingForm({ ...listingForm, marketplace: v as GenerateListingRequestMarketplace })}>
                    <SelectTrigger className="glass-card border-border/50" data-testid="select-marketplace">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-secondary/50">
                      <SelectItem value="ebay">eBay</SelectItem>
                      <SelectItem value="poshmark">Poshmark</SelectItem>
                      <SelectItem value="depop">Depop</SelectItem>
                      <SelectItem value="mercari">Mercari</SelectItem>
                      <SelectItem value="grailed">Grailed</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="etsy">Etsy</SelectItem>
                      <SelectItem value="whatnot">Whatnot</SelectItem>
                      <SelectItem value="shopify">Shopify</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full neon-glow-purple bg-secondary hover:bg-secondary/80 font-sans font-bold" disabled={generateListing.isPending} data-testid="button-generate">
                  {generateListing.isPending ? 'Generating...' : 'Generate Listing ✦'}
                </Button>
              </form>
            </div>

            <div className="glass-card-glow p-6 rounded-xl">
              <h2 className="font-pixel text-xl text-secondary text-glow-purple mb-6">Result</h2>
              {listingResult ? (
                <div className="space-y-4">
                  <div className="glass-card p-4 rounded-lg">
                    <p className="text-xs text-muted-foreground font-sans mb-2">Title</p>
                    <p className="font-sans font-bold text-foreground">{listingResult.title}</p>
                  </div>
                  <div className="glass-card p-4 rounded-lg">
                    <p className="text-xs text-muted-foreground font-sans mb-2">Description</p>
                    <p className="font-sans text-sm text-foreground">{listingResult.description}</p>
                  </div>
                  {listingResult.suggestedPrice && (
                    <div className="glass-card p-4 rounded-lg">
                      <p className="text-xs text-muted-foreground font-sans mb-2">Suggested Price</p>
                      <p className="font-pixel text-2xl text-primary text-glow-pink">${listingResult.suggestedPrice.toFixed(2)}</p>
                    </div>
                  )}
                  {listingResult.tags && listingResult.tags.length > 0 && (
                    <div className="glass-card p-4 rounded-lg">
                      <p className="text-xs text-muted-foreground font-sans mb-2">Tags</p>
                      <div className="flex flex-wrap gap-2">
                        {listingResult.tags.map((tag: string, idx: number) => (
                          <span key={idx} className="px-3 py-1 rounded-full text-xs font-bold font-sans bg-accent/20 text-accent border border-accent/50">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <Wand2 size={48} className="mx-auto mb-4 text-secondary opacity-30" />
                    <p className="font-sans text-muted-foreground">Select an item to generate listing</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
