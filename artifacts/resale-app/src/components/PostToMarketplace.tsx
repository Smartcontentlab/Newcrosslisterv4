import { useState, useCallback, useEffect } from 'react';
import { useGenerateListing, useCreateListing, getListListingsQueryKey, getListItemsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, ExternalLink, Sparkles, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import type { GenerateListingRequestMarketplace } from '@workspace/api-client-react';

interface Item {
  id: number;
  title: string;
  brand?: string | null;
  price: number;
  condition?: string;
  category?: string | null;
}

interface Platform {
  id: GenerateListingRequestMarketplace;
  label: string;
  color: string;
  glowColor: string;
  url: string;
  icon: string;
  tips: string[];
}

const PLATFORMS: Platform[] = [
  {
    id: 'poshmark',
    label: 'Poshmark',
    color: 'text-accent-text',
    glowColor: '255,45,120',
    url: 'https://poshmark.com/create-listing',
    icon: '♥',
    tips: ['Share your closet after posting', 'Accept bundles for free shipping'],
  },
  {
    id: 'depop',
    label: 'Depop',
    color: 'text-destructive',
    glowColor: '248,113,113',
    url: 'https://www.depop.com/sell/',
    icon: '★',
    tips: ['Use all 5 photo slots', 'Hashtags in bio rank better'],
  },
  {
    id: 'mercari',
    label: 'Mercari',
    color: 'text-accent-text',
    glowColor: '96,165,250',
    url: 'https://www.mercari.com/sell/',
    icon: '✦',
    tips: ['Enable Smart Offers', 'Promote listing after 24hrs'],
  },
  {
    id: 'ebay',
    label: 'eBay',
    color: 'text-warning',
    glowColor: '250,204,21',
    url: 'https://www.ebay.com/sell',
    icon: '◆',
    tips: ['Fill all item specifics', '80-char titles with keywords first'],
  },
  {
    id: 'grailed',
    label: 'Grailed',
    color: 'text-accent-text',
    glowColor: '192,132,252',
    url: 'https://www.grailed.com/sell',
    icon: '✧',
    tips: ['Include measurements', 'Tag designer and era'],
  },
  {
    id: 'etsy',
    label: 'Etsy',
    color: 'text-warning',
    glowColor: '251,146,60',
    url: 'https://www.etsy.com/sell',
    icon: '◇',
    tips: ['Focus on vintage language', 'Use all 13 tag slots'],
  },
];

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
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-sans font-bold transition-all border border-transparent hover:bg-muted opacity-0 group-hover:opacity-100"
          style={copied ? { color: '#00FFD1', opacity: 1 } : { color: '#aaa' }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div
        className="w-full rounded-lg px-4 py-3 text-sm font-sans text-foreground cursor-text select-all transition-all hover:bg-muted/60 border border-border"
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

interface PostToMarketplaceProps {
  item: Item;
  open: boolean;
  onClose: () => void;
  // Pre-filled posted set if coming from Inventory
  initialPosted?: Set<string>;
}

export default function PostToMarketplace({ item, open, onClose, initialPosted }: PostToMarketplaceProps) {
  const [activePlatform, setActivePlatform] = useState<Platform>(PLATFORMS[0]);
  const [generated, setGenerated] = useState<Record<string, any>>({});
  const [posted, setPosted] = useState<Set<string>>(initialPosted || new Set());
  const [openedUrl, setOpenedUrl] = useState(false);

  const generateListing = useGenerateListing();
  const createListing = useCreateListing();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const currentData = generated[activePlatform.id];
  const isGenerating = generateListing.isPending;
  const isPosted = posted.has(activePlatform.id);

  // Sync initialPosted if it changes while open
  useEffect(() => {
    if (initialPosted) setPosted(initialPosted);
  }, [initialPosted]);

  const switchPlatform = useCallback(
    (platform: Platform) => {
      setActivePlatform(platform);
      setOpenedUrl(false);
      if (!generated[platform.id] && !posted.has(platform.id)) {
        generateListing.mutate(
          { data: { itemId: item.id, marketplace: platform.id } },
          {
            onSuccess: (data) => {
              setGenerated((prev) => ({ ...prev, [platform.id]: data }));
            },
          }
        );
      }
    },
    [generated, posted, generateListing, item.id]
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        // Find first unposted platform
        const startPlatform = PLATFORMS.find(p => !(initialPosted || posted).has(p.id)) || PLATFORMS[0];
        switchPlatform(startPlatform);
      }
      if (!isOpen) {
        onClose();
        setOpenedUrl(false);
      }
    },
    [initialPosted, posted, switchPlatform, onClose]
  );

  const openPlatform = () => {
    window.open(activePlatform.url, '_blank', 'noopener,noreferrer');
    setOpenedUrl(true);
  };

  const markAsPosted = () => {
    const data = generated[activePlatform.id];
    createListing.mutate(
      {
        data: {
          itemId: item.id,
          marketplace: activePlatform.id,
          status: 'active',
          price: data?.suggestedPrice ?? item.price,
          title: data?.title ?? item.title,
          description: data?.description,
        },
      },
      {
        onSuccess: () => {
          const newPosted = new Set([...posted, activePlatform.id]);
          setPosted(newPosted);
          queryClient.invalidateQueries({ queryKey: getListListingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
          
          toast({
            title: `${activePlatform.icon} Listed on ${activePlatform.label}!`,
            description: 'Moving to next platform...',
          });

          // Auto-advance
          const nextPlatform = PLATFORMS.find(p => !newPosted.has(p.id));
          if (nextPlatform) {
            setTimeout(() => switchPlatform(nextPlatform), 1000);
          }
        },
        onError: () => {
          toast({ title: 'Error', description: 'Could not save listing record', variant: 'destructive' });
        },
      }
    );
  };

  const allDone = PLATFORMS.every(p => posted.has(p.id));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-4xl h-[85vh] p-0 gap-0 overflow-hidden bg-background border-border shadow-2xl flex flex-col sm:flex-row"
      >
        {/* Sidebar */}
        <div className="w-full sm:w-56 border-b sm:border-b-0 sm:border-r border-border bg-muted/70 flex flex-col shrink-0">
          <div className="p-4 border-b border-border/50">
            <h2 className="font-pixel text-xs text-muted-foreground mb-2">Posting Flow</h2>
            <p className="font-sans font-bold text-sm text-foreground truncate" title={item.title}>{item.title}</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {PLATFORMS.map((platform) => {
              const isActive = activePlatform.id === platform.id;
              const isDone = posted.has(platform.id);
              
              return (
                <button
                  key={platform.id}
                  onClick={() => switchPlatform(platform)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-left transition-all ${
                    isActive 
                      ? 'bg-muted text-foreground font-bold shadow-sm' 
                      : 'hover:bg-muted/60 text-muted-foreground font-medium'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${isDone ? 'text-success' : platform.color}`}>
                      {isDone ? '♥' : platform.icon}
                    </span>
                    <span className="text-sm font-sans">{platform.label}</span>
                  </div>
                  {isActive && !isDone && <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                </button>
              );
            })}
          </div>

          <div className="p-4 border-t border-border/50 bg-muted/70">
            <div className="flex items-center justify-between text-xs font-sans font-bold">
              <span className="text-muted-foreground">Progress</span>
              <span className="text-success">{posted.size} / {PLATFORMS.length}</span>
            </div>
            <div className="h-1.5 bg-black rounded-full mt-2 overflow-hidden">
              <div 
                className="h-full bg-success transition-all duration-500" 
                style={{ width: `${(posted.size / PLATFORMS.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {allDone ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 rounded-full bg-success/10 flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(0,255,209,0.2)]">
                <CheckCircle2 size={48} className="text-success" />
              </div>
              <h2 className="font-pixel text-xl text-success  mb-2">Omnipresent</h2>
              <p className="font-sans text-muted-foreground text-center mb-8">
                This item is live across all platforms. Wait for the offers to roll in.
              </p>
              <button
                onClick={() => onClose()}
                className="px-6 py-2.5 rounded-lg bg-muted/60 border border-border font-sans font-bold hover:bg-muted transition-colors"
              >
                Close Flow
              </button>
            </div>
          ) : isGenerating && !currentData ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <Loader2 className="animate-spin text-accent-text mb-4" size={32} />
              <p className="font-pixel text-xs text-accent-text animate-pulse">
                Optimizing for {activePlatform.label}...
              </p>
            </div>
          ) : isPosted ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-success/5">
              <CheckCircle2 size={40} className="text-success mb-4" />
              <p className="font-sans font-bold text-lg mb-2">Live on {activePlatform.label}</p>
              <button
                onClick={() => {
                  const nextPlatform = PLATFORMS.find(p => !posted.has(p.id));
                  if (nextPlatform) switchPlatform(nextPlatform);
                }}
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-success text-success-foreground font-sans font-bold hover:bg-success/90 transition-colors"
              >
                Next Platform <ArrowRight size={16} />
              </button>
            </div>
          ) : currentData ? (
            <>
              {/* Header inside content */}
              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between shrink-0 bg-background/95 backdrop-blur z-10">
                <h3 className="font-sans font-bold text-lg flex items-center gap-2" style={{ color: `rgb(${activePlatform.glowColor})` }}>
                  {activePlatform.icon} {activePlatform.label} Listing
                </h3>
                <button
                  onClick={openPlatform}
                  className="flex items-center gap-2 px-4 py-1.5 rounded text-sm font-sans font-bold transition-all shadow-sm"
                  style={{
                    background: `rgba(${activePlatform.glowColor},0.15)`,
                    color: `rgb(${activePlatform.glowColor})`,
                    border: `1px solid rgba(${activePlatform.glowColor},0.4)`
                  }}
                >
                  <ExternalLink size={14} /> Open Form
                </button>
              </div>

              {/* Scrollable Form Data */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <CopyField label="Optimized Title" value={currentData.title} />
                  </div>
                  
                  <div className="md:col-span-2">
                    <CopyField label="Description" value={currentData.description} />
                  </div>

                  <CopyField 
                    label="Price" 
                    value={`$${(currentData.suggestedPrice ?? item.price).toFixed(2)}`} 
                    mono 
                  />
                  <CopyField label="Condition" value={currentData.condition ?? item.condition ?? ''} />

                  {currentData.tags?.length > 0 && (
                    <div className="md:col-span-2">
                      <CopyField label="Tags / Keywords" value={currentData.tags.join(', ')} />
                    </div>
                  )}
                </div>

                <div className="rounded-lg p-4 bg-muted/60 border border-border mt-8">
                  <p className="font-sans font-bold text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    {activePlatform.label} Algorithm Tips
                  </p>
                  <ul className="space-y-1.5">
                    {activePlatform.tips.map((tip, i) => (
                      <li key={i} className="text-sm font-sans text-foreground flex items-start gap-2">
                        <span className="text-accent-text opacity-70">▸</span> {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action Footer */}
              <div className="p-4 border-t border-border/50 bg-muted/70 shrink-0 flex items-center justify-between">
                <p className="text-xs font-sans text-muted-foreground max-w-[200px] sm:max-w-none">
                  Paste the fields into {activePlatform.label}, then verify.
                </p>
                <button
                  onClick={markAsPosted}
                  disabled={!openedUrl || createListing.isPending}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-sans font-bold transition-all disabled:opacity-50 hover:-translate-y-0.5"
                  style={{
                    background: openedUrl ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.05)',
                    color: openedUrl ? 'hsl(var(--primary-foreground))' : '#888',
                  }}
                >
                  {createListing.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {openedUrl ? "Mark as Posted" : "Open Link First"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
