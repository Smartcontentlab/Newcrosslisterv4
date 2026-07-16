import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { 
  useGetDashboardSummary, 
  useListRecentOrders, 
  useListItems, 
  useListListings,
  useListShippingTasks,
  Item
} from '@workspace/api-client-react';
import { 
  TrendingUp, 
  Package, 
  List, 
  DollarSign, 
  Clock, 
  Truck, 
  ShoppingBag, 
  Zap,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import QuickAddItem from '@/components/QuickAddItem';
import PostToMarketplace from '@/components/PostToMarketplace';

function StatCard({ title, value, icon, trend, highlight }: { title: string; value: string | number; icon: React.ReactNode; trend?: string; highlight?: 'pink' | 'mint' }) {
  return (
    <div className={`glass-card p-5 rounded-xl border border-border transition-all hover:bg-white/5`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-lg ${highlight === 'pink' ? 'bg-primary/20 text-primary' : highlight === 'mint' ? 'bg-accent/20 text-accent' : 'bg-white/5 text-muted-foreground'}`}>
          {icon}
        </div>
        {trend && (
          <span className={`text-xs font-bold font-sans flex items-center gap-1 ${trend.startsWith('+') ? 'text-accent' : 'text-muted-foreground'}`}>
            {trend.startsWith('+') && <TrendingUp size={12} />}
            {trend}
          </span>
        )}
      </div>
      <h3 className="font-sans text-sm font-semibold text-muted-foreground mb-1">{title}</h3>
      <p className={`font-pixel text-xl ${highlight === 'pink' ? 'text-primary text-glow-pink' : highlight === 'mint' ? 'text-accent' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

const CORE_PLATFORMS = ['poshmark', 'depop', 'mercari', 'ebay', 'grailed', 'etsy'];

export default function Dashboard() {
  const [postItem, setPostItem] = useState<Item | null>(null);

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: recentOrders } = useListRecentOrders();
  const { data: items } = useListItems();
  const { data: listings } = useListListings();
  const { data: tasks } = useListShippingTasks();

  // Action Center calculations
  const itemsNeedingPosting = useMemo(() => {
    if (!items || !listings) return [];
    return items.filter(item => {
      if (item.status !== 'active') return false;
      const itemListings = listings.filter(l => l.itemId === item.id && l.status === 'active');
      const coreListingCount = new Set(itemListings.map(l => l.marketplace)).size;
      return coreListingCount < CORE_PLATFORMS.length;
    });
  }, [items, listings]);

  const ordersToShip = useMemo(() => {
    if (!recentOrders) return [];
    return recentOrders.filter(o => o.status === 'awaiting_shipment');
  }, [recentOrders]);

  if (summaryLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 w-64 bg-white/5 rounded-lg animate-pulse" />
        <div className="h-48 w-full bg-white/5 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-32 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-pixel text-2xl text-foreground tracking-wide mb-2 uppercase flex items-center gap-3">
            <Zap className="text-primary" /> Overview
          </h1>
          <p className="text-sm font-sans text-muted-foreground tracking-wide">YOUR RESALE EMPIRE AT A GLANCE</p>
        </div>
        <div className="text-right">
          <p className="font-pixel text-xl text-accent text-glow-mint">
            ${summary?.totalRevenue?.toFixed(2) || '0.00'}
          </p>
          <p className="text-xs font-sans font-bold text-muted-foreground uppercase tracking-widest mt-1">LIFETIME REVENUE</p>
        </div>
      </div>

      {/* ACTION CENTER */}
      {(itemsNeedingPosting.length > 0 || ordersToShip.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {itemsNeedingPosting.length > 0 && (
            <div className="glass-card-glow rounded-xl p-5 border border-primary/40 bg-primary/5 flex items-center justify-between group cursor-pointer" onClick={() => setPostItem(itemsNeedingPosting[0])}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-primary">Drafts Ready</h3>
                  <p className="text-sm font-sans text-muted-foreground">{itemsNeedingPosting.length} items missing from core marketplaces</p>
                </div>
              </div>
              <ArrowRight className="text-primary opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </div>
          )}

          {ordersToShip.length > 0 && (
            <Link href="/shipping">
              <div className="glass-card-glow rounded-xl p-5 border border-accent/40 bg-accent/5 flex items-center justify-between group cursor-pointer h-full">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                    <Package size={20} />
                  </div>
                  <div>
                    <h3 className="font-sans font-bold text-accent">Shipments Due</h3>
                    <p className="text-sm font-sans text-muted-foreground">{ordersToShip.length} orders awaiting fulfillment</p>
                  </div>
                </div>
                <ArrowRight className="text-accent opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Main Action - Add Item */}
      <QuickAddItem onItemCreated={(item) => setPostItem(item)} />

      {/* Post to Marketplace modal trigger by Action Center or Quick Add */}
      {postItem && (
        <PostToMarketplace
          item={postItem}
          open={!!postItem}
          onClose={() => setPostItem(null)}
        />
      )}

      {/* Stats Grid */}
      <div>
        <h2 className="text-xs font-sans font-bold text-muted-foreground uppercase tracking-widest mb-4">Performance Metrics</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Sold This Month"
            value={summary?.soldThisMonth || 0}
            icon={<DollarSign size={18} />}
            highlight="pink"
            trend="+12%"
          />
          <StatCard
            title="Total Profit"
            value={`$${summary?.totalProfit?.toFixed(0) || 0}`}
            icon={<TrendingUp size={18} />}
            trend="+8.4%"
          />
          <StatCard
            title="Active Listings"
            value={summary?.activeListings || 0}
            icon={<List size={18} />}
          />
          <StatCard
            title="Inventory Value"
            value={`$${summary?.inventoryValue?.toFixed(0) || 0}`}
            icon={<Zap size={18} />}
          />
        </div>
      </div>
    </div>
  );
}
