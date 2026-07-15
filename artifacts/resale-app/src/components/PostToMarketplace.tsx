import { useState, useCallback } from 'react';
import { useGenerateListing, useCreateListing, getListListingsQueryKey, getListItemsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, ExternalLink, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import type { GenerateListingRequestMarketplace } from '@workspace/api-client-react';

interface Item {
  id: number;
  title: string;
  brand?: string | null;
  price: number;
  condition: string;
  category?: string | null;
}

interface Platform {
  id: GenerateListingRequestMarketplace;
  label: string;
  color: string;
  borderColor: string;
  glowColor: string;
  url: string;
  icon: string;
  tips: string[];
}

const PLATFORMS: Platform[] = [
  {
    id: 'poshmark',
    label: 'Poshmark',
    color: 'text-pink-400',
    borderColor: 'border-pink-400/60',
    glowColor: '255,45,120',
    url: 'https://poshmark.com/create-listing',
    icon: '♥',
    tips: ['Share your closet after posting for visibility', 'Send offers to likers within 24hrs', 'Accept bundle offers — bundles ship free for buyers'],
  },
  {
    id: 'depop',
    label: 'Depop',
    color: 'text-red-400',
    borderColor: 'border-red-400/60',
    glowColor: '248,113,113',
    url: 'https://www.depop.com/sell/',
    icon: '★',
    tips: ['Use all 5 photo slots', 'Hashtags in bio rank better than in description', 'Price slightly lower than eBay — buyers expect deals'],
  },
  {
    id: 'mercari',
    label: 'Mercari',
    color: 'text-blue-400',
    borderColor: 'border-blue-400/60',
    glowColor: '96,165,250',
    url: 'https://www.mercari.com/sell/',
    icon: '✦',
    tips: ['Enable Smart Offers — auto-accepts offers within your range', 'Promote listing after 24hrs for free boost', 'Ship within 3 days to keep your rating high'],
  },
  {
    id: 'ebay',
    label: 'eBay',
    color: 'text-yellow-400',
    borderColor: 'border-yellow-400/60',
    glowColor: '250,204,21',
    url: 'https://www.ebay.com/sell',
    icon: '◆',
    tips: ['Fill all item specifics — eBay buries listings that skip them', 'Free shipping converts better for items under $50', '80-char titles with keywords first'],
  },
  {
    id: 'grailed',
    label: 'Grailed',
    color: 'text-purple-400',
    borderColor: 'border-purple-400/60',
    glowColor: '192,132,252',
    url: 'https://www.grailed.com/sell',
    icon: '✧',
    tips: ['Grailed buyers are detail-oriented — measurements matter', 'Tag the designer and era (e.g. AW22)', 'Price firm — lowballers are common, hold your value'],
  },
  {
    id: 'etsy',
    label: 'Etsy',
    color: 'text-orange-400',
    borderColor: 'border-orange-400/60',
    glowColor: '251,146,60',
    url: 'https://www.etsy.com/sell',
    icon: '◇',
    tips: ['Focus on vintage and handmade language', 'Use all 13 tag slots with specific search terms', 'Add decade/era to title for vintage items'],
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-pixel text-muted-foreground uppercase tracking-wider">{label}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-sans border transition-all"
          style={
            copied
              ? { borderColor: 'rgba(0,255,209,0.6)', color: '#00FFD1', boxShadow: '0 0 8px rgba(0,255,209,0.3)' }
              : { borderColor: 'rgba(255,255,255,0.2)', color: '#aaa' }
          }
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div
        className="w-full rounded-lg px-3 py-2.5 text-sm font-sans text-foreground cursor-text select-all"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
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
}

export default function PostToMarketplace({ item, open, onClose }: PostToMarketplaceProps) {
  const [activePlatform, setActivePlatform] = useState<Platform>(PLATFORMS[0]);
  const [generated, setGenerated] = useState<Record<string, any>>({});
  const [posted, setPosted] = useState<Set<string>>(new Set());
  const [openedUrl, setOpenedUrl] = useState(false);

  const generateListing = useGenerateListing();
  const createListing = useCreateListing();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const currentData = generated[activePlatform.id];
  const isGenerating = generateListing.isPending;
  const isPosted = posted.has(activePlatform.id);

  const switchPlatform = useCallback(
    (platform: Platform) => {
      setActivePlatform(platform);
      setOpenedUrl(false);
      // Auto-generate if not already done
      if (!generated[platform.id]) {
        generateListing.mutate(
          { data: { itemId: item.id, marketplace: platform.id } },
          {
            onSuccess: (data) => {
              setGenerated((prev) => ({ ...prev, [platform.id]: data }));
            },
            onError: () => {
              toast({ title: 'Generation failed', description: 'Could not generate listing', variant: 'destructive' });
            },
          }
        );
      }
    },
    [generated, generateListing, item.id, toast]
  );

  // Auto-generate for first platform when modal opens
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen && !generated[PLATFORMS[0].id]) {
        switchPlatform(PLATFORMS[0]);
      }
      if (!isOpen) {
        onClose();
        setOpenedUrl(false);
      }
    },
    [generated, switchPlatform, onClose]
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
          setPosted((prev) => new Set([...prev, activePlatform.id]));
          queryClient.invalidateQueries({ queryKey: getListListingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
          toast({
            title: `${activePlatform.icon} Posted to ${activePlatform.label}!`,
            description: `${item.title} is now tracked as listed`,
          });
        },
        onError: () => {
          toast({ title: 'Error', description: 'Could not save listing record', variant: 'destructive' });
        },
      }
    );
  };

  const postedCount = posted.size;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0"
        style={{
          background: 'rgba(10,0,16,0.97)',
          border: '1px solid rgba(255,45,120,0.4)',
          boxShadow: '0 0 40px rgba(255,45,120,0.15), 0 0 80px rgba(191,95,255,0.08)',
        }}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/5">
          <DialogTitle className="font-pixel text-primary text-glow-pink text-lg flex items-center gap-3">
            <Sparkles size={18} />
            Post to Marketplaces
          </DialogTitle>
          <p className="font-sans text-sm text-muted-foreground mt-1">
            {item.title}
            {postedCount > 0 && (
              <span className="ml-2 text-accent text-glow-mint">
                — {postedCount} platform{postedCount !== 1 ? 's' : ''} posted ♥
              </span>
            )}
          </p>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Platform sidebar */}
          <div className="w-36 border-r border-white/5 flex flex-col py-3 gap-1 shrink-0">
            {PLATFORMS.map((platform) => {
              const isActive = activePlatform.id === platform.id;
              const isDone = posted.has(platform.id);
              return (
                <button
                  key={platform.id}
                  onClick={() => switchPlatform(platform)}
                  className="flex items-center gap-2 px-3 py-2.5 mx-2 rounded-lg text-left transition-all font-sans text-sm"
                  style={
                    isActive
                      ? {
                          background: `rgba(${activePlatform.glowColor},0.12)`,
                          border: `1px solid rgba(${activePlatform.glowColor},0.4)`,
                          boxShadow: `0 0 12px rgba(${activePlatform.glowColor},0.15)`,
                          color: 'white',
                        }
                      : { border: '1px solid transparent', color: '#888' }
                  }
                >
                  <span className={`text-xs ${isDone ? 'text-accent' : platform.color}`}>
                    {isDone ? '♥' : platform.icon}
                  </span>
                  <span className="truncate font-sans font-medium">{platform.label}</span>
                </button>
              );
            })}
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {isGenerating && !currentData ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <Loader2
                  className="animate-spin text-primary"
                  size={32}
                  style={{ filter: 'drop-shadow(0 0 8px rgba(255,45,120,0.6))' }}
                />
                <p className="font-pixel text-sm text-primary text-glow-pink">
                  Writing your {activePlatform.label} listing...
                </p>
                <p className="font-sans text-xs text-muted-foreground">Optimizing for {activePlatform.label}'s algorithm</p>
              </div>
            ) : isPosted ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <CheckCircle2
                  size={48}
                  className="text-accent"
                  style={{ filter: 'drop-shadow(0 0 12px rgba(0,255,209,0.6))' }}
                />
                <p className="font-pixel text-accent text-glow-mint text-lg">Posted!</p>
                <p className="font-sans text-sm text-muted-foreground">Listing tracked in your database</p>
                <button
                  onClick={() => switchPlatform(PLATFORMS.find(p => !posted.has(p.id)) ?? PLATFORMS[0])}
                  className="mt-2 px-4 py-2 rounded-full font-sans text-sm border border-primary/40 text-primary hover:bg-primary/10 transition-all"
                >
                  Post to another platform
                </button>
              </div>
            ) : currentData ? (
              <>
                {/* Generated content */}
                <CopyField label="Title" value={currentData.title} />
                <CopyField label="Description" value={currentData.description} />

                <div className="grid grid-cols-2 gap-4">
                  <CopyField
                    label="Price"
                    value={`$${(currentData.suggestedPrice ?? item.price).toFixed(2)}`}
                    mono
                  />
                  <CopyField label="Condition" value={currentData.condition ?? item.condition} />
                </div>

                {currentData.tags?.length > 0 && (
                  <CopyField label="Tags / Keywords" value={currentData.tags.join(', ')} />
                )}

                {/* Platform tips */}
                <div
                  className="rounded-lg p-4 space-y-2"
                  style={{
                    background: `rgba(${activePlatform.glowColor},0.06)`,
                    border: `1px solid rgba(${activePlatform.glowColor},0.2)`,
                  }}
                >
                  <p className="font-pixel text-xs text-muted-foreground mb-3">
                    {activePlatform.icon} {activePlatform.label} tips
                  </p>
                  {activePlatform.tips.map((tip, i) => (
                    <p key={i} className="font-sans text-xs text-muted-foreground flex items-start gap-2">
                      <span className={`mt-0.5 ${activePlatform.color}`}>▸</span>
                      {tip}
                    </p>
                  ))}
                </div>

                {/* Action row */}
                <div className="flex items-center gap-3 pt-2 pb-1">
                  <button
                    onClick={openPlatform}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-sans font-bold text-sm border transition-all hover:scale-[1.02]"
                    style={{
                      background: `rgba(${activePlatform.glowColor},0.1)`,
                      borderColor: `rgba(${activePlatform.glowColor},0.5)`,
                      color: 'white',
                      boxShadow: `0 0 16px rgba(${activePlatform.glowColor},0.15)`,
                    }}
                  >
                    <ExternalLink size={16} />
                    Open {activePlatform.label}
                  </button>

                  <button
                    onClick={markAsPosted}
                    disabled={!openedUrl || createListing.isPending}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-pixel text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02]"
                    style={{
                      background: openedUrl ? 'rgba(255,45,120,0.15)' : 'rgba(255,45,120,0.05)',
                      border: '1px solid rgba(255,45,120,0.5)',
                      color: '#FF2D78',
                      boxShadow: openedUrl ? '0 0 16px rgba(255,45,120,0.25)' : undefined,
                    }}
                    title={!openedUrl ? 'Open the platform first, then mark as posted' : undefined}
                  >
                    {createListing.isPending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Check size={14} />
                    )}
                    {openedUrl ? "Mark as Posted ♥" : "Open Platform First"}
                  </button>
                </div>

                <p className="font-sans text-xs text-muted-foreground text-center pb-2">
                  Copy each field above, paste into {activePlatform.label}, then click Mark as Posted to track it here.
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <p className="font-sans text-muted-foreground text-sm">Select a platform to generate your listing</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
