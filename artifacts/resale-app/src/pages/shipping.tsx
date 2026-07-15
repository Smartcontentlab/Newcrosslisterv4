import { useListShippingTasks, getListShippingTasksQueryKey, useUpdateShippingTask } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MarketplaceBadge } from "@/components/ui/badges";
import { Truck, Printer, Package as PackageIcon, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Shipping() {
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useListShippingTasks({
    query: { queryKey: getListShippingTasksQueryKey() }
  });
  const updateTask = useUpdateShippingTask();

  const handleStepToggle = (taskId: number, stepKey: string, currentCompleted: boolean) => {
    updateTask.mutate({ 
      id: taskId, 
      data: { steps: [{ key: stepKey, completed: !currentCompleted }] } 
    }, {
      onSuccess: () => {
        // In reality, invalidate or update cache locally. We'll invalidate to keep it simple.
        queryClient.invalidateQueries({ queryKey: getListShippingTasksQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shipping Queue</h1>
          <p className="text-muted-foreground">Process orders efficiently. Don't skip steps.</p>
        </div>
        <Button className="gap-2">
          <Printer size={16} /> Print All Labels
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Card key={i} className="h-64 animate-pulse bg-muted/50" />)
        ) : tasks?.length === 0 ? (
          <div className="lg:col-span-2 text-center py-20 bg-card rounded-xl border border-dashed">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500 mb-4" />
            <h3 className="text-lg font-medium">All caught up!</h3>
            <p className="text-muted-foreground mt-1">There are no orders awaiting shipment right now.</p>
          </div>
        ) : (
          tasks?.map(task => {
            const allCompleted = task.steps.every(s => s.completed);
            const progress = (task.steps.filter(s => s.completed).length / task.steps.length) * 100;
            
            return (
              <Card key={task.id} className={`overflow-hidden transition-all duration-300 ${allCompleted ? 'border-emerald-500 bg-emerald-500/5' : ''}`}>
                <div className="h-1 w-full bg-accent">
                  <div className={`h-full transition-all duration-500 ${allCompleted ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
                </div>
                <CardHeader className="pb-4 border-b border-border/50">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg font-bold leading-tight mb-2">{task.itemTitle}</CardTitle>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Order #{task.orderId}</span>
                        <span>•</span>
                        <span>{task.orderBuyerName}</span>
                        {task.orderMarketplace && (
                          <>
                            <span>•</span>
                            <MarketplaceBadge marketplace={task.orderMarketplace} />
                          </>
                        )}
                      </div>
                    </div>
                    {allCompleted && (
                      <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-sm shrink-0">
                        <CheckCircle2 size={18} />
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border/50">
                    {task.steps.map(step => (
                      <label 
                        key={step.key} 
                        className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-accent/30 transition-colors ${step.completed ? 'text-muted-foreground' : 'text-foreground font-medium'}`}
                      >
                        <div className={`flex items-center justify-center w-6 h-6 rounded-md border ${step.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-input bg-background'}`}>
                          {step.completed && <CheckCircle2 size={16} />}
                        </div>
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={step.completed}
                          onChange={() => handleStepToggle(task.id, step.key, step.completed)}
                        />
                        <span className={`flex-1 ${step.completed ? 'line-through' : ''}`}>{step.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="p-4 bg-accent/30 border-t border-border/50 flex justify-between items-center">
                    <div className="text-xs font-mono text-muted-foreground">
                      Tracking: {task.trackingNumber ? <span className="text-foreground">{task.trackingNumber}</span> : 'Pending...'}
                    </div>
                    <Button variant="secondary" size="sm" className="gap-2 text-xs">
                      <Truck size={14} /> Tracking Info
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
