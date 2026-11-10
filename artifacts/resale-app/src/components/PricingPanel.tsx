import { useMemo, useState } from 'react';
import { Check, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/supabase';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_SHIPPING, listPriceFor, poshmarkUpgrade, shippingAmount, takeHome, WEIGHT_USUALS, type ShipAssumptions } from '@/lib/pricing';

type PriceSuggestion = {
  suggestedPrice: number;
  minPrice: number;
  maxPrice: number;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  basis?: string;
  yourSales?: { count: number; average: number; low: number; high: number } | null;
  comps?: { source: 'sold' | 'active' | null; count: number; query: string; searchUrl: string; note: string; median?: number; low?: number; high?: number; samples: Array<{ title: string; price: number; endedAt?: string; url?: string }> };
};

type Props = {
  price: string;
  weight: string;
  cost: string;
  ship: ShipAssumptions;
  item: { title: string; brand: string; model: string; category: string; condition: string };
  onPrice: (value: string) => void;
  onWeight: (value: string) => void;
  onShip: (next: ShipAssumptions) => void;
};

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const asNumber = (value: string) => Math.max(0, Number(value) || 0);

export default function PricingPanel({ price, weight, cost, ship, item, onPrice, onWeight, onShip }: Props) {
  const { toast } = useToast();
  const [suggestion, setSuggestion] = useState<PriceSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState('');
  const [editShip, setEditShip] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lookupUrl, setLookupUrl] = useState<string | null>(null);

  const listPrice = asNumber(price);
  const weightLb = asNumber(weight);
  const rows = useMemo(() => takeHome(listPrice, ship, weightLb, asNumber(cost)), [listPrice, ship, weightLb, cost]);
  const targetValue = asNumber(target);
  const backwards = useMemo(() => (targetValue > 0 ? listPriceFor(targetValue, ship, weightLb) : null), [targetValue, ship, weightLb]);
  const sellerPays = ship.payer === 'seller';

  const askForSuggestion = async () => {
    setNotice(null);
    setLookupUrl(null);
    if (!item.title.trim()) {
      setNotice('Add an item title first. The price check searches eBay using your title, brand and style.');
      return;
    }
    setLoading(true);
    setSuggestion(null);
    try {
      const response = await apiFetch('/api/ai/price-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title.trim(),
          brand: item.brand.trim() || undefined,
          model: item.model.trim() || undefined,
          category: item.category || undefined,
          condition: item.condition || undefined,
        }),
      });
      const data = await response.json();
      if (data?.searchUrl) setLookupUrl(data.searchUrl);
      if (!response.ok) throw new Error(data.error || 'The price check could not finish right now.');
      setSuggestion(data as PriceSuggestion);
    } catch (error) {
      setNotice(`No suggestion this time. ${error instanceof Error ? error.message : 'Please try again in a moment.'}`);
    } finally {
      setLoading(false);
    }
  };

  const acceptSuggestion = () => {
    if (!suggestion) return;
    onPrice(String(suggestion.suggestedPrice));
    setSuggestion(null);
    toast({ title: 'Price added', description: `List price set to ${money(suggestion.suggestedPrice)}. You can still change it.` });
  };

  return (
    <div id="pricing-panel" className="space-y-4 border-2 border-border bg-muted p-4 sm:p-5 md:col-span-2 xl:col-span-3">
      <div>
        <p className="cx-eyebrow">✦ Pricing & shipping</p>
        <h3 className="cx-panel-title mt-2">Set a price / see what you keep</h3>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <Label>List price</Label>
          <div className="mt-2 flex gap-2">
            <Input type="number" min="0" step="0.01" value={price} onChange={(event) => onPrice(event.target.value)} placeholder="0.00" className="bg-card" />
            <Button type="button" variant="outline" onClick={askForSuggestion} disabled={loading} className="shrink-0">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Suggest a price
            </Button>
          </div>
        </div>
        <div>
          <Label>Weight (lb)</Label>
          <Input type="number" min="0" step="0.01" value={weight} onChange={(event) => onWeight(event.target.value)} placeholder="For shipping" className="mt-2 bg-card" />
        </div>
      </div>

      {notice && (
        <div role="alert" className="border-2 border-l-[10px] border-border border-l-destructive bg-warning-tint px-3 py-2 text-sm font-semibold text-foreground">
          <p>{notice}</p>
          {lookupUrl && <a className="mt-1 inline-flex items-center gap-1 underline underline-offset-4" href={lookupUrl} target="_blank" rel="noreferrer">See sold prices on eBay yourself <ExternalLink size={13} /></a>}
        </div>
      )}

      {suggestion && (
        <div className="space-y-3 border-2 border-border bg-accent-tint p-4" role="status">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="cx-eyebrow">✦ {suggestion.comps?.source === 'sold' ? 'Recent eBay sold prices' : suggestion.comps?.source === 'active' ? 'eBay asking prices' : 'AI estimate'} / {suggestion.confidence} confidence</p>
            <p className="text-[0.625rem] font-medium uppercase tracking-[0.04em] text-ink-2">{suggestion.basis ?? 'AI estimate only'}</p>
          </div>
          <p className="cx-metric">{money(suggestion.suggestedPrice)}</p>
          <p className="text-xs font-semibold text-ink-2">Likely range {money(suggestion.minPrice)} to {money(suggestion.maxPrice)}</p>
          {suggestion.yourSales && (
            <p className="text-sm text-ink-2">Your {suggestion.yourSales.count} past {suggestion.yourSales.count === 1 ? 'sale' : 'sales'} of similar items averaged {money(suggestion.yourSales.average)} ({money(suggestion.yourSales.low)} to {money(suggestion.yourSales.high)}).</p>
          )}
          <p className="text-sm text-ink-2">{suggestion.reasoning}</p>
          {suggestion.comps && suggestion.comps.samples.length > 0 && (
            <ul className="space-y-1 border-t border-border pt-2 text-xs text-ink-2">
              {suggestion.comps.samples.map((sample, index) => (
                <li key={`${sample.title}-${index}`} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{sample.url ? <a className="underline underline-offset-4" href={sample.url} target="_blank" rel="noreferrer">{sample.title}</a> : sample.title}{sample.endedAt ? ` · ${sample.endedAt.slice(0, 10)}` : ''}</span>
                  <span className="tabular-nums font-semibold">{money(sample.price)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={acceptSuggestion}><Check size={16} /> Add suggestion</Button>
            <Button type="button" variant="outline" onClick={() => setSuggestion(null)}>No thanks</Button>
            {suggestion.comps?.searchUrl && <a className={buttonVariants({ variant: 'outline' })} href={suggestion.comps.searchUrl} target="_blank" rel="noreferrer">See sold comps on eBay <ExternalLink size={14} /></a>}
          </div>
          <p className="text-[0.625rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">
            {suggestion.comps?.source === 'sold' ? 'Searched eBay for "' + suggestion.comps.query + '". Different condition, size or bundle can move the price, so glance at the samples.' : suggestion.comps?.source === 'active' ? 'Asking prices are not sold prices. Sold prices usually land lower.' : `An estimate, not live marketplace data. ${suggestion.comps?.note ?? ''} Check recent sold listings before you commit.`}
          </p>
        </div>
      )}

      <div className="grid gap-3 border border-border bg-card p-3 md:grid-cols-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold">Offer free shipping</p>
            <p className="mt-1 text-xs leading-5 text-ink-2">{sellerPays ? 'On: you pay for the label, so it comes out of what you keep.' : 'Off: the buyer pays shipping. Nothing to enter.'}</p>
          </div>
          <Switch checked={sellerPays} onCheckedChange={(checked) => onShip({ ...ship, payer: checked ? 'seller' : 'buyer' })} aria-label="Offer free shipping" />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold">Depop boost (12%)</p>
            <p className="mt-1 text-xs leading-5 text-ink-2">Only if you pay to boost the listing. Most listings: off.</p>
          </div>
          <Switch checked={ship.boosted} onCheckedChange={(checked) => onShip({ ...ship, boosted: checked })} aria-label="Depop boost" />
        </div>
        <div className="md:col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-ink-2">
          <span>Poshmark label upgrade: <strong className="text-foreground">{poshmarkUpgrade(weightLb) ? `ON automatically (${money(poshmarkUpgrade(weightLb))}, over ${weightLb > 10 ? 10 : 5} lb)` : 'off (5 lb or under)'}</strong></span>
          <span>Shipping used in the maths: <strong className="text-foreground">{money(shippingAmount(ship))}</strong>{ship.cost ? '' : ' (typical label)'}</span>
          <button type="button" className="cx-link" onClick={() => setEditShip((open) => !open)}>{editShip ? 'Done' : 'Change'}</button>
          {editShip && (
            <span className="flex items-center gap-2">
              <Input type="number" min="0" step="0.01" value={ship.cost} onChange={(event) => onShip({ ...ship, cost: event.target.value })} placeholder={String(DEFAULT_SHIPPING)} aria-label="Shipping amount" className="h-9 w-28 bg-card" />
              <span>Leave blank for the typical label.</span>
            </span>
          )}
        </div>
      </div>

      <div>
        <p className="cx-eyebrow">{listPrice > 0 ? `You keep at ${money(listPrice)}` : 'You keep (enter a list price)'}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {rows.map((row) => (
            <div key={row.platform} className="border border-border bg-card p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-extrabold uppercase tracking-[0.02em]">{row.platform}</p>
                <p className="text-2xl font-extrabold tabular-nums">{money(row.net)}</p>
              </div>
              <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-ink-2">
                {row.lines.length === 0 && <li className="text-muted-foreground">Fees appear once you enter a price.</li>}
                {row.lines.map((line) => (
                  <li key={line.label} className="flex justify-between gap-3"><span>{line.label}</span><span className="tabular-nums">-{money(line.amount)}</span></li>
                ))}
              </ul>
              {row.profit !== null && (
                <p className="mt-2 border-t border-border pt-2 text-xs font-extrabold uppercase tracking-[0.05em]">Profit <span className={row.profit < 0 ? 'text-destructive' : ''}>{money(row.profit)}</span></p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="border border-border bg-card p-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:items-end">
          <div>
            <Label>Working backwards: I want to keep</Label>
            <Input type="number" min="0" step="0.01" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="e.g. 25.00" className="mt-2 bg-card" />
          </div>
          {backwards ? (
            <div className="flex flex-wrap gap-2">
              {(Object.keys(backwards) as (keyof typeof backwards)[]).map((platform) => (
                <Button key={platform} type="button" variant="outline" onClick={() => onPrice(String(backwards[platform]))} title={`Set list price to ${money(backwards[platform])}`}>
                  {platform} list at {money(backwards[platform])}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Enter what you want in your pocket and see the list price needed on each marketplace. Click one to use it.</p>
          )}
        </div>
      </div>

      <div>
        <p className="cx-eyebrow">Weight usuals (lb, packed)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {WEIGHT_USUALS.map((usual) => (
            <button
              key={usual.label}
              type="button"
              onClick={() => onWeight(String(usual.fill))}
              title={`Fill weight with ${usual.fill} lb`}
              className="border border-border bg-card px-2.5 py-1.5 text-left text-xs hover:bg-accent-tint"
            >
              <span className="font-bold">{usual.label}</span> <span className="tabular-nums text-ink-2">{usual.range}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[0.6875rem] leading-5 text-muted-foreground">
          Rough guide from shipping charts: soft goods include a poly mailer, shoes and coats a box. Poshmark charges sellers a $5 label upgrade over 5 lb and $10 over 10 lb. Weigh on a scale when you can.
        </p>
      </div>

      <p className="text-[0.6875rem] leading-5 text-muted-foreground">
        Estimates, not quotes. Fee sources:{' '}
        <a className="font-semibold text-foreground underline underline-offset-4" href="https://blog.poshmark.com/2025/09/08/lower-shipping-starting-september-12th/" target="_blank" rel="noreferrer">Poshmark</a>,{' '}
        <a className="font-semibold text-foreground underline underline-offset-4" href="https://depophelp.zendesk.com/hc/en-gb/articles/360001791127-Seller-fees-and-charges" target="_blank" rel="noreferrer">Depop</a>,{' '}
        <a className="font-semibold text-foreground underline underline-offset-4" href="https://www.mercari.com/us/help_center/article/169/" target="_blank" rel="noreferrer">Mercari</a>. Confirm current fees before you post.
      </p>
    </div>
  );
}
