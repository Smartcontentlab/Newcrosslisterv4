import { useListOrders, useUpdateOrder, getListOrdersQueryKey, getListRecentOrdersQueryKey, getListShippingTasksQueryKey, getGetDashboardSummaryQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Package, Truck, CheckCircle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { OrderPatchStatus } from '@workspace/api-client-react';

export default function Orders() {
  const { data: orders, isLoading } = useListOrders();
  const updateOrder = useUpdateOrder();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleStatusUpdate = (id: number, status: OrderPatchStatus) => {
    updateOrder.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({ title: 'Status updated', description: `Marked as ${status.replace('_', ' ')}` });
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListRecentOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListShippingTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
      }
    );
  };

  const statusMap = {
    pending: { color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: Clock },
    awaiting_shipment: { color: 'text-orange-400 bg-orange-400/10 border-orange-400/20', icon: Package },
    shipped: { color: 'text-blue-400 bg-blue-400/10 border-blue-400/20', icon: Truck },
    delivered: { color: 'text-accent bg-accent/10 border-accent/20', icon: CheckCircle },
    returned: { color: 'text-red-400 bg-red-400/10 border-red-400/20', icon: Clock },
    refunded: { color: 'text-muted-foreground bg-white/5 border-white/10', icon: Clock },
  };

  if (isLoading) {
    return <div className="h-32 bg-white/5 rounded-xl animate-pulse" />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-end justify-between border-b border-border/50 pb-4">
        <div>
          <h1 className="font-pixel text-xl tracking-wide uppercase text-foreground mb-2">Orders</h1>
          <p className="text-xs font-sans text-muted-foreground uppercase tracking-widest">{orders?.length || 0} SALES RECORDED</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {!orders?.length ? (
          <div className="glass-card p-12 rounded-xl text-center border-dashed border-border/50">
            <p className="font-sans font-bold text-muted-foreground">No orders yet</p>
            <p className="text-xs text-muted-foreground mt-1">Make sales to see them here.</p>
          </div>
        ) : (
          orders.map((order) => {
            const statusConfig = statusMap[order.status] || statusMap.pending;
            const StatusIcon = statusConfig.icon;

            return (
              <div key={order.id} className="glass-card rounded-xl p-5 border border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-5 transition-all hover:bg-white/5 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${statusConfig.color}`}>
                      <StatusIcon size={12} /> {order.status.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] font-pixel text-muted-foreground uppercase">{order.marketplace}</span>
                  </div>
                  <h3 className="font-sans font-bold text-lg text-foreground truncate">{order.itemTitle || 'Untitled Item'}</h3>
                  <div className="flex items-center gap-4 mt-2 text-sm font-sans text-muted-foreground">
                    <span>Buyer: <span className="text-foreground">{order.buyerName || 'Unknown'}</span></span>
                    <span>Tracking: {order.trackingNumber ? <span className="font-mono text-xs text-foreground">{order.trackingNumber}</span> : 'None'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between md:flex-col md:items-end gap-3 shrink-0 md:w-32 md:border-l md:border-white/10 md:pl-5">
                  <div className="text-left md:text-right">
                    <p className="font-pixel text-lg text-accent">${order.salePrice.toFixed(2)}</p>
                    <p className="text-[10px] font-sans uppercase tracking-widest text-muted-foreground mt-1">Sale Price</p>
                  </div>
                  
                  {/* Action Buttons based on status */}
                  {order.status === 'pending' && (
                    <button onClick={() => handleStatusUpdate(order.id, 'awaiting_shipment')} className="text-xs font-bold font-sans px-4 py-2 rounded bg-white/10 hover:bg-white/20 transition-colors">
                      Mark Ready
                    </button>
                  )}
                  {order.status === 'awaiting_shipment' && (
                    <button onClick={() => handleStatusUpdate(order.id, 'shipped')} className="text-xs font-bold font-sans px-4 py-2 rounded bg-accent text-accent-foreground hover:bg-accent/90 transition-colors shadow-[0_0_15px_rgba(0,255,209,0.2)]">
                      Mark Shipped
                    </button>
                  )}
                  {order.status === 'shipped' && (
                    <button onClick={() => handleStatusUpdate(order.id, 'delivered')} className="text-xs font-bold font-sans px-4 py-2 rounded bg-white/10 hover:bg-white/20 transition-colors">
                      Mark Delivered
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
