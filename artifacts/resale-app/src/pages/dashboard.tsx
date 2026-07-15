import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, useListRecentOrders, getListRecentOrdersQueryKey, useGetMarketplaceBreakdown, getGetMarketplaceBreakdownQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, DollarSign, Package, ShoppingCart, Tags, TrendingUp } from "lucide-react";
import { MarketplaceBadge, StatusBadge } from "@/components/ui/badges";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });

  const { data: recentOrders, isLoading: isLoadingOrders } = useListRecentOrders({
    query: { queryKey: getListRecentOrdersQueryKey() }
  });

  const { data: marketplaceBreakdown, isLoading: isLoadingBreakdown } = useGetMarketplaceBreakdown({
    query: { queryKey: getGetMarketplaceBreakdownQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Your business at a glance.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
          title="Total Revenue" 
          value={summary?.totalRevenue} 
          isLoading={isLoadingSummary} 
          isCurrency 
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          trend="+12.5%"
          trendUp={true}
        />
        <KpiCard 
          title="Total Profit" 
          value={summary?.totalProfit} 
          isLoading={isLoadingSummary} 
          isCurrency 
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          trend="+18.2%"
          trendUp={true}
        />
        <KpiCard 
          title="Active Listings" 
          value={summary?.activeListings} 
          isLoading={isLoadingSummary} 
          icon={<Tags className="h-4 w-4 text-blue-500" />}
        />
        <KpiCard 
          title="Pending Orders" 
          value={summary?.pendingOrders} 
          isLoading={isLoadingSummary} 
          icon={<ShoppingCart className="h-4 w-4 text-yellow-500" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50">
            <CardTitle className="text-lg">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto">
            {isLoadingOrders ? (
              <div className="p-6 space-y-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : recentOrders?.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">No recent orders</div>
            ) : (
              <div className="divide-y divide-border/50">
                {recentOrders?.map(order => (
                  <div key={order.id} className="p-4 flex items-center justify-between hover:bg-accent/30 transition-colors">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <MarketplaceBadge marketplace={order.marketplace} />
                        <span className="font-medium truncate">{order.itemTitle || `Order #${order.id}`}</span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>{formatDate(order.createdAt)}</span>
                        <span>•</span>
                        <span>{order.buyerName}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-4">
                      <div className="font-mono font-medium">{formatCurrency(order.salePrice)}</div>
                      <StatusBadge status={order.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Marketplace Breakdown */}
        <Card>
          <CardHeader className="pb-2 border-b border-border/50">
            <CardTitle className="text-lg">Sales by Channel</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {isLoadingBreakdown ? (
              <div className="space-y-4 mt-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="space-y-4 mt-2">
                {marketplaceBreakdown?.map(mb => (
                  <div key={mb.marketplace} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <MarketplaceBadge marketplace={mb.marketplace} className="w-20 text-center" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{mb.totalSales} items</span>
                      </div>
                    </div>
                    <div className="font-mono text-sm">{formatCurrency(mb.totalRevenue)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, isLoading, isCurrency, icon, trend, trendUp }: any) {
  return (
    <Card className="overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardHeader className="flex flex-row items-center justify-between pb-2 p-5">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="p-2 bg-accent rounded-md">{icon}</div>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="flex flex-col gap-1">
            <div className="text-3xl font-bold font-mono tracking-tight">
              {isCurrency ? formatCurrency(value) : value?.toLocaleString() || 0}
            </div>
            {trend && (
              <div className={cn("text-xs flex items-center gap-1", trendUp ? "text-emerald-500" : "text-rose-500")}>
                {trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                <span>{trend} vs last month</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
