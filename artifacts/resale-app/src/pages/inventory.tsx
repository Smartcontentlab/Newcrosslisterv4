import { useListItems, getListItemsQueryKey, useCreateItem, useDeleteItem } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badges";
import { Search, Plus, Filter, MoreHorizontal, Image as ImageIcon, Tags } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Inventory() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  
  const { data: items, isLoading } = useListItems(
    { search: search || undefined }, 
    { query: { queryKey: getListItemsQueryKey({ search: search || undefined }) } }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground">Manage your physical products and stock.</p>
        </div>
        <Button className="shrink-0 gap-2">
          <Plus size={16} /> Add Item
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by title, brand, or SKU..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter size={16} /> Filter
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="h-64 animate-pulse bg-muted/50" />
          ))}
        </div>
      ) : items?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-dashed">
          <PackageIcon className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No items found</h3>
          <p className="text-muted-foreground max-w-sm mx-auto mt-1">Add your first item to start tracking inventory and generating listings.</p>
          <Button className="mt-6 gap-2"><Plus size={16} /> Add Item</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items?.map(item => (
            <Card key={item.id} className="overflow-hidden flex flex-col group hover:border-primary/50 transition-colors">
              <div className="h-48 bg-accent/50 relative flex items-center justify-center border-b border-border">
                {item.photos && item.photos.length > 0 ? (
                  <img src={item.photos[0]} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
                )}
                <div className="absolute top-3 left-3">
                  <StatusBadge status={item.status} />
                </div>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full shadow-md">
                    <MoreHorizontal size={14} />
                  </Button>
                </div>
              </div>
              <CardContent className="p-4 flex-1 flex flex-col">
                <div className="mb-2">
                  <div className="text-xs font-medium text-primary mb-1">{item.brand || item.category || 'Unbranded'}</div>
                  <h3 className="font-semibold text-base line-clamp-2 leading-tight">{item.title}</h3>
                </div>
                <div className="mt-auto pt-4 flex items-end justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Price / Cost</span>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono font-bold text-lg">{formatCurrency(item.price)}</span>
                      <span className="font-mono text-xs text-muted-foreground line-through">{formatCurrency(item.cost)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground bg-accent px-2 py-1 rounded-md">
                    <Tags size={12} />
                    {item.listingCount || 0} listings
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PackageIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  )
}
