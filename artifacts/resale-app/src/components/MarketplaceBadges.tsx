const CODES: Record<string, string> = {
  ebay: 'EB', poshmark: 'PM', mercari: 'ME', depop: 'DP', etsy: 'ET', grailed: 'GR', facebook: 'FB', whatnot: 'WN', shopify: 'SH',
};
const NAMES: Record<string, string> = {
  ebay: 'eBay', poshmark: 'Poshmark', mercari: 'Mercari', depop: 'Depop', etsy: 'Etsy', grailed: 'Grailed', facebook: 'Facebook', whatnot: 'Whatnot', shopify: 'Shopify',
};

export function marketplaceName(id: string): string {
  return NAMES[id] ?? id;
}

/**
 * Square two-letter tiles showing where an item is live.
 * Live = filled lime; not listed = hollow dashed ring. Never color-only: the count and aria-label say it too.
 */
export function MarketplaceBadges({ markets, live, className = '' }: { markets: readonly string[]; live: ReadonlySet<string>; className?: string }) {
  const liveCount = markets.filter((m) => live.has(m)).length;
  return (
    <span
      className={`inline-flex items-center ${className}`}
      role="img"
      aria-label={`Live on ${liveCount} of ${markets.length} marketplaces: ${markets.map((m) => `${marketplaceName(m)} ${live.has(m) ? 'live' : 'not listed'}`).join(', ')}`}
    >
      {markets.map((market, index) => {
        const on = live.has(market);
        return (
          <span
            key={market}
            title={`${marketplaceName(market)}: ${on ? 'live' : 'not listed'}`}
            className={`flex h-[26px] w-[26px] items-center justify-center border text-[0.5625rem] font-extrabold ${index > 0 ? '-ml-px' : ''} ${
              on ? 'border-border bg-success text-success-foreground' : 'border-dashed border-muted-foreground bg-card text-muted-foreground'
            }`}
          >
            {CODES[market] ?? market.slice(0, 2).toUpperCase()}
          </span>
        );
      })}
    </span>
  );
}
