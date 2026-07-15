import { useGetDashboardSummary, useListRecentOrders, useGetMarketplaceBreakdown } from '@workspace/api-client-react';
import { TrendingUp, Package, List, DollarSign, Clock, Truck, ShoppingBag, Zap } from 'lucide-react';

function StatCard({ title, value, icon, trend, glowColor }: { title: string; value: string | number; icon: React.ReactNode; trend?: string; glowColor?: string }) {
  const glowClass = glowColor === 'pink' ? 'neon-glow-pink' : glowColor === 'purple' ? 'neon-glow-purple' : glowColor === 'mint' ? 'neon-glow-mint' : '';
  
  return (
    <div className={`glass-card p-6 rounded-xl border border-border/50 hover:border-primary/50 transition-all ${glowClass}`} data-testid={`stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-lg bg-primary/10 text-primary ${glowColor === 'pink' ? 'animate-glow-pulse' : ''}`}>
          {icon}
        </div>
        {trend && (
          <span className="text-xs font-pixel text-accent text-glow-mint flex items-center gap-1">
            <TrendingUp size={12} />
            {trend}
          </span>
        )}
      </div>
      <h3 className="font-sans text-sm text-muted-foreground mb-1">{title}</h3>
      <p className="font-pixel text-2xl text-foreground text-glow-pink">{value}</p>
    </div>
  );
}

function MarketplaceBadge({ name, color }: { name: string; color: string }) {
  return (
    <span 
      className={`px-3 py-1 rounded-full text-xs font-bold font-sans ${color}`}
      style={{ boxShadow: '0 0 10px currentColor' }}
    >
      {name}
    </span>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: recentOrders, isLoading: ordersLoading } = useListRecentOrders();
  const { data: marketplaceBreakdown, isLoading: breakdownLoading } = useGetMarketplaceBreakdown();

  if (summaryLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 bg-muted/20 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-40 bg-muted/20 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const marketplaceColors: Record<string, string> = {
    ebay: 'bg-yellow-500/20 text-yellow-400 border border-yellow-400/50',
    poshmark: 'bg-pink-500/20 text-pink-400 border border-pink-400/50',
    depop: 'bg-red-500/20 text-red-400 border border-red-400/50',
    mercari: 'bg-blue-500/20 text-blue-400 border border-blue-400/50',
    grailed: 'bg-purple-500/20 text-purple-400 border border-purple-400/50',
    facebook: 'bg-blue-600/20 text-blue-300 border border-blue-300/50',
    etsy: 'bg-orange-500/20 text-orange-400 border border-orange-400/50',
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-pixel text-4xl text-primary text-glow-pink glitch-text mb-2" data-text="Dashboard">
          Dashboard
        </h1>
        <p className="text-muted-foreground font-sans">Your resale empire at a glance ✦</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Revenue"
          value={`$${summary?.totalRevenue?.toFixed(2) || '0.00'}`}
          icon={<DollarSign size={24} />}
          trend="+12.3%"
          glowColor="pink"
        />
        <StatCard
          title="Total Profit"
          value={`$${summary?.totalProfit?.toFixed(2) || '0.00'}`}
          icon={<TrendingUp size={24} />}
          trend="+8.7%"
          glowColor="purple"
        />
        <StatCard
          title="Active Listings"
          value={summary?.activeListings || 0}
          icon={<List size={24} />}
        />
        <StatCard
          title="Total Inventory"
          value={summary?.totalInventory || 0}
          icon={<Package size={24} />}
        />
        <StatCard
          title="Pending Orders"
          value={summary?.pendingOrders || 0}
          icon={<Clock size={24} />}
          glowColor="mint"
        />
        <StatCard
          title="Awaiting Shipment"
          value={summary?.awaitingShipment || 0}
          icon={<Truck size={24} />}
        />
        <StatCard
          title="Sold This Month"
          value={summary?.soldThisMonth || 0}
          icon={<ShoppingBag size={24} />}
          trend="+24"
        />
        <StatCard
          title="Inventory Value"
          value={`$${summary?.inventoryValue?.toFixed(2) || '0.00'}`}
          icon={<Zap size={24} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="glass-card-glow p-6 rounded-xl">
          <h2 className="font-pixel text-xl text-primary text-glow-pink mb-6 flex items-center gap-2">
            <span>★</span> Recent Orders
          </h2>
          
          {ordersLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-muted/20 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !recentOrders || recentOrders.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 font-sans">No recent orders yet</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.slice(0, 5).map((order) => (
                <div key={order.id} className="glass-card p-4 rounded-lg border border-border/30 hover:border-primary/50 transition-all" data-testid={`order-${order.id}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-sans font-bold text-foreground">{order.itemTitle || 'Untitled Item'}</p>
                    <MarketplaceBadge 
                      name={order.marketplace.toUpperCase()} 
                      color={marketplaceColors[order.marketplace] || 'bg-gray-500/20 text-gray-400'}
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground font-sans">{order.buyerName || 'Anonymous'}</span>
                    <span className="font-pixel text-accent text-glow-mint">${order.salePrice.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Marketplace Breakdown */}
        <div className="glass-card-glow p-6 rounded-xl">
          <h2 className="font-pixel text-xl text-secondary text-glow-purple mb-6 flex items-center gap-2">
            <span>★</span> Marketplace Stats
          </h2>
          
          {breakdownLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-muted/20 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !marketplaceBreakdown || marketplaceBreakdown.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 font-sans">No marketplace data yet</p>
          ) : (
            <div className="space-y-4">
              {marketplaceBreakdown.map((stat) => (
                <div key={stat.marketplace} className="glass-card p-4 rounded-lg border border-border/30" data-testid={`marketplace-${stat.marketplace}`}>
                  <div className="flex items-center justify-between mb-3">
                    <MarketplaceBadge 
                      name={stat.marketplace.toUpperCase()} 
                      color={marketplaceColors[stat.marketplace] || 'bg-gray-500/20 text-gray-400'}
                    />
                    <span className="font-pixel text-sm text-muted-foreground">{stat.activeListings} active</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-sans">
                    <div>
                      <p className="text-muted-foreground">Sales</p>
                      <p className="font-bold text-foreground">{stat.totalSales}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Revenue</p>
                      <p className="font-bold text-accent text-glow-mint">${stat.totalRevenue.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Profit</p>
                      <p className="font-bold text-primary text-glow-pink">${stat.totalProfit.toFixed(0)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
