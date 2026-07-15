import { useListOrders, getListOrdersQueryKey, useUpdateOrder } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MarketplaceBadge, StatusBadge } from "@/components/ui/badges";
import { Search, Truck, Filter, FileText, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Orders() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const queryClient = useQueryClient();
  const updateOrder = useUpdateOrder();

  const { data: orders, isLoading } = useListOrders(
    { status: statusFilter as any || undefined },
    { query: { queryKey: getListOrdersQueryKey({ status: statusFilter as any || undefined }) } }
  );

  const handleMarkShipped = (id: number) => {
    updateOrder.mutate({ id, data: { status: "shipped" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">Track and fulfill your sold items.</p>
        </div>
        <Button variant="outline" className="gap-2">
          <FileText size={16} /> Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search orders, buyers..." className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          {["All", "Pending", "Awaiting Shipment", "Shipped", "Delivered"].map(status => {
            const val = status === "All" ? "" : status.toLowerCase().replace(" ", "_");
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(val)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  (statusFilter === val || (status === "All" && !statusFilter))
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                }`}
              >
                {status}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Card key={i} className="h-32 animate-pulse bg-muted/50" />)
        ) : orders?.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-xl border border-dashed">
            <h3 className="text-lg font-medium">No orders found</h3>
            <p className="text-muted-foreground mt-1">Get listing to get sales!</p>
          </div>
        ) : (
          orders?.map(order => (
            <Card key={order.id} className="overflow-hidden border-l-4 border-l-transparent hover:border-l-primary transition-colors">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between p-5 gap-6">
                  <div className="flex flex-col gap-2 min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-lg line-clamp-1">{order.itemTitle}</h3>
                      <StatusBadge status={order.status} />
                      <MarketplaceBadge marketplace={order.marketplace} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground mt-2">
                      <div>
                        <span className="block text-xs uppercase tracking-wider mb-1 opacity-70">Order ID</span>
                        <span className="font-mono text-foreground">#{order.id}</span>
                      </div>
                      <div>
                        <span className="block text-xs uppercase tracking-wider mb-1 opacity-70">Date</span>
                        <span className="text-foreground">{formatDate(order.createdAt)}</span>
                      </div>
                      <div>
                        <span className="block text-xs uppercase tracking-wider mb-1 opacity-70">Buyer</span>
                        <span className="text-foreground">{order.buyerName || 'Unknown'}</span>
                      </div>
                      <div>
                        <span className="block text-xs uppercase tracking-wider mb-1 opacity-70">Tracking</span>
                        <span className="font-mono text-primary">{order.trackingNumber || 'Pending'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex md:flex-col items-center md:items-end justify-between gap-4 md:gap-2 shrink-0 md:pl-6 md:border-l border-border/50">
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground mb-1">Sale Price</div>
                      <div className="font-mono font-bold text-xl text-emerald-500">{formatCurrency(order.salePrice)}</div>
                    </div>
                    {order.status === 'awaiting_shipment' && (
                      <Button size="sm" onClick={() => handleMarkShipped(order.id)} className="gap-2">
                        <Truck size={14} /> Mark Shipped
                      </Button>
                    )}
                    {order.status === 'shipped' && (
                      <div className="text-sm font-medium text-emerald-500 flex items-center gap-1">
                        <CheckCircle2 size={16} /> Shipped
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
