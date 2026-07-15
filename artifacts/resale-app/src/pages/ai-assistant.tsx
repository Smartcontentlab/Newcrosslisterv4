import { useState, useRef, useEffect } from "react";
import { useAiChat, useGenerateListing, useGetPriceEstimate } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Sparkles, Tags, DollarSign, Loader2 } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

export default function AiAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm your ListFlow assistant. I can help you price items, write optimized listings, or analyze your sales strategy. What do you need help with today?" }
  ]);
  const [input, setInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const chatMutation = useAiChat();
  const generateListingMutation = useGenerateListing();
  const priceEstimateMutation = useGetPriceEstimate();

  const [activeTab, setActiveTab] = useState<"chat" | "listing" | "pricing">("chat");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const userMsg = input;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    
    chatMutation.mutate({ data: { message: userMsg } }, {
      onSuccess: (data) => {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      },
      onError: () => {
        setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I'm having trouble connecting right now." }]);
      }
    });
  };

  // Pricing Form State
  const [priceForm, setPriceForm] = useState({ title: "", brand: "", condition: "" });
  const [priceResult, setPriceResult] = useState<any>(null);

  const handlePriceEstimate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!priceForm.title) return;
    
    priceEstimateMutation.mutate({ data: priceForm }, {
      onSuccess: (data) => {
        setPriceResult(data);
      }
    });
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6">
      {/* Sidebar Tools */}
      <div className="w-full md:w-80 flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight mb-2 hidden md:block">AI Assistant</h1>
        
        <div className="flex bg-muted p-1 rounded-lg">
          <button 
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'chat' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button 
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'pricing' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('pricing')}
          >
            Pricer
          </button>
          <button 
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'listing' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('listing')}
          >
            Lister
          </button>
        </div>

        {activeTab === 'pricing' && (
          <Card className="flex-1 overflow-auto border-primary/20 shadow-md shadow-primary/5">
            <CardHeader className="bg-primary/5 pb-4 border-b border-primary/10">
              <CardTitle className="text-lg flex items-center gap-2 text-primary">
                <DollarSign size={18} /> Smart Pricer
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <form onSubmit={handlePriceEstimate} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Item Title</label>
                  <Input 
                    placeholder="e.g. Vintage Levis 501" 
                    value={priceForm.title}
                    onChange={e => setPriceForm({...priceForm, title: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Brand</label>
                    <Input 
                      placeholder="Levis" 
                      value={priceForm.brand}
                      onChange={e => setPriceForm({...priceForm, brand: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Condition</label>
                    <Input 
                      placeholder="Good" 
                      value={priceForm.condition}
                      onChange={e => setPriceForm({...priceForm, condition: e.target.value})}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full gap-2 mt-2" disabled={priceEstimateMutation.isPending || !priceForm.title}>
                  {priceEstimateMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                  Get Estimate
                </Button>
              </form>

              {priceResult && (
                <div className="mt-6 p-4 bg-accent/50 rounded-lg border border-border space-y-3 animate-in fade-in zoom-in duration-300">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Suggested Price</p>
                    <p className="text-3xl font-mono font-bold text-emerald-500">${priceResult.suggestedPrice}</p>
                    <p className="text-xs text-muted-foreground mt-1">Range: ${priceResult.minPrice} - ${priceResult.maxPrice}</p>
                  </div>
                  <div className="pt-3 border-t border-border/50">
                    <p className="text-xs text-muted-foreground">{priceResult.reasoning}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'listing' && (
          <Card className="flex-1 overflow-auto border-blue-500/20 shadow-md shadow-blue-500/5">
            <CardHeader className="bg-blue-500/5 pb-4 border-b border-blue-500/10">
              <CardTitle className="text-lg flex items-center gap-2 text-blue-500">
                <Tags size={18} /> Auto-Lister
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-4">Select an item from your inventory to instantly generate an SEO-optimized listing for any marketplace.</p>
              <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white gap-2">
                Select Item from Inventory
              </Button>
            </CardContent>
          </Card>
        )}

        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col justify-center text-center p-6 border rounded-xl border-dashed">
            <Bot className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-medium mb-2">How to use Chat</h3>
            <p className="text-sm text-muted-foreground">Ask ListFlow to analyze your sales, find stale inventory, or write a polite response to a buyer.</p>
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <Card className="flex-1 flex flex-col overflow-hidden border shadow-sm">
        <CardHeader className="py-3 border-b border-border/50 bg-card/50 backdrop-blur shrink-0">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <Bot size={18} />
            </div>
            Business Co-Pilot
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user' 
                    ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                    : 'bg-accent/50 text-foreground border border-border rounded-tl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {chatMutation.isPending && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 bg-accent/50 border border-border text-foreground">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </CardContent>
        <div className="p-4 bg-card border-t border-border shrink-0">
          <form onSubmit={handleSendChat} className="flex gap-2">
            <Input 
              placeholder="Ask me anything..." 
              value={input}
              onChange={e => setInput(e.target.value)}
              className="rounded-full bg-accent/50 border-transparent focus-visible:bg-background focus-visible:border-primary"
            />
            <Button type="submit" size="icon" className="rounded-full shrink-0" disabled={!input.trim() || chatMutation.isPending}>
              <Send size={16} />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
