import { useListOrders, useUpdateOrder } from '@workspace/api-client-react';
import { Package, Truck, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { OrderPatchStatus } from '@workspace/api-client-react';

export default function Orders() {
  const { data: orders, isLoading } = useListOrders();
  const updateOrder = useUpdateOrder();
  const { toast } = useToast();

  const handleStatusUpdate = (id: number, status: OrderPatchStatus) => {
    updateOrder.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({ title: '✦ Status updated!', description: `Order marked as ${status}` });
        },
      }
    );
  };

  const marketplaceColors: Record<string, string> = {
    ebay: 'bg-yellow-500/20 text-yellow-400 border border-yellow-400/50',
    poshmark: 'bg-pink-500/20 text-pink-400 border border-pink-400/50',
    depop: 'bg-red-500/20 text-red-400 border border-red-400/50',
    mercari: 'bg-blue-500/20 text-blue-400 border border-blue-400/50',
    grailed: 'bg-purple-500/20 text-purple-400 border border-purple-400/50',
    facebook: 'bg-blue-600/20 text-blue-300 border border-blue-300/50',
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border border-yellow-400/50',
    awaiting_shipment: 'bg-orange-500/20 text-orange-400 border border-orange-400/50',
    shipped: 'bg-blue-500/20 text-blue-400 border border-blue-400/50',
    delivered: 'bg-accent/20 text-accent border border-accent/50',
    returned: 'bg-red-500/20 text-red-400 border border-red-400/50',
    refunded: 'bg-muted/50 text-muted-foreground',
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 bg-muted/20 rounded-lg animate-pulse" />
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 bg-muted/20 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="font-pixel text-4xl text-accent text-glow-mint glitch-text mb-2" data-text="Orders">
          Orders
        </h1>
        <p className="text-muted-foreground font-sans">{orders?.length || 0} total orders ★</p>
      </div>

      <div className="space-y-4">
        {!orders || orders.length === 0 ? (
          <div className="glass-card-glow p-12 rounded-xl text-center">
            <p className="font-pixel text-xl text-muted-foreground mb-4">No orders yet</p>
            <p className="text-muted-foreground font-sans">Your orders will appear here ★</p>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="glass-card-glow p-6 rounded-xl" data-testid={`order-${order.id}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-sans font-bold text-lg text-foreground mb-2">
                    {order.itemTitle || 'Untitled Item'}
                  </h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold font-sans ${marketplaceColors[order.marketplace]}`}>
                      {order.marketplace.toUpperCase()}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold font-sans ${statusColors[order.status]}`}>
                      {order.status.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-sans">
                    <div>
                      <p className="text-muted-foreground">Buyer</p>
                      <p className="font-bold text-foreground">{order.buyerName || 'Anonymous'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Sale Price</p>
                      <p className="font-pixel text-primary text-glow-pink">${order.salePrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Profit</p>
                      <p className="font-pixel text-accent text-glow-mint">${(order.profit || 0).toFixed(2)}</p>
                    </div>
                    {order.trackingNumber && (
                      <div>
                        <p className="text-muted-foreground">Tracking</p>
                        <p className="font-mono text-xs text-foreground">{order.trackingNumber}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 ml-4">
                  {order.status === 'pending' && (
                    <Button
                      size="sm"
                      onClick={() => handleStatusUpdate(order.id, 'awaiting_shipment')}
                      className="neon-glow-pink font-sans text-xs"
                      data-testid={`button-ready-${order.id}`}
                    >
                      <Package size={14} /> Ready
                    </Button>
                  )}
                  {order.status === 'awaiting_shipment' && (
                    <Button
                      size="sm"
                      onClick={() => handleStatusUpdate(order.id, 'shipped')}
                      className="neon-glow-mint bg-accent hover:bg-accent/80 text-background font-sans text-xs"
                      data-testid={`button-ship-${order.id}`}
                    >
                      <Truck size={14} /> Ship
                    </Button>
                  )}
                  {order.status === 'shipped' && (
                    <Button
                      size="sm"
                      onClick={() => handleStatusUpdate(order.id, 'delivered')}
                      className="neon-glow-mint bg-accent hover:bg-accent/80 text-background font-sans text-xs"
                      data-testid={`button-deliver-${order.id}`}
                    >
                      <CheckCircle size={14} /> Deliver
                    </Button>
                  )}
                </div>
              </div>
              {order.notes && (
                <div className="mt-4 pt-4 border-t border-border/30">
                  <p className="text-xs text-muted-foreground font-sans">{order.notes}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
