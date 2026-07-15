import { useListListings, getListListingsQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MarketplaceBadge, StatusBadge } from "@/components/ui/badges";
import { Search, Filter, ExternalLink, Tags } from "lucide-react";

export default function Listings() {
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>("");

  const { data: listings, isLoading } = useListListings(
    { marketplace: marketplaceFilter || undefined },
    { query: { queryKey: getListListingsQueryKey({ marketplace: marketplaceFilter || undefined }) } }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Listings</h1>
          <p className="text-muted-foreground">Manage your active posts across all marketplaces.</p>
        </div>
        <Button className="shrink-0 gap-2">
          <Tags size={16} /> Cross-list Item
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search listings..." className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          {["All", "eBay", "Poshmark", "Depop", "Mercari"].map(mp => (
            <button
              key={mp}
              onClick={() => setMarketplaceFilter(mp === "All" ? "" : mp.toLowerCase())}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                (marketplaceFilter === mp.toLowerCase() || (mp === "All" && !marketplaceFilter))
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {mp}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Item & Title</th>
                <th className="px-6 py-4 font-medium">Marketplace</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Price</th>
                <th className="px-6 py-4 font-medium text-right">Listed Date</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-3/4"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-20"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-16"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-16 ml-auto"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-24 ml-auto"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-8 ml-auto"></div></td>
                  </tr>
                ))
              ) : listings?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No listings found for this filter.
                  </td>
                </tr>
              ) : (
                listings?.map(listing => (
                  <tr key={listing.id} className="hover:bg-accent/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground mb-1 line-clamp-1 max-w-md">{listing.title || listing.itemTitle}</div>
                      <div className="text-xs text-muted-foreground font-mono">ID: {listing.itemId}</div>
                    </td>
                    <td className="px-6 py-4">
                      <MarketplaceBadge marketplace={listing.marketplace} />
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={listing.status} />
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-medium">
                      {formatCurrency(listing.price)}
                    </td>
                    <td className="px-6 py-4 text-right text-muted-foreground">
                      {formatDate(listing.listedAt || listing.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ExternalLink size={16} />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
