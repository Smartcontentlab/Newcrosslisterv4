import { useListShippingTasks, useUpdateShippingTask, getListShippingTasksQueryKey, getListOrdersQueryKey, getGetDashboardSummaryQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Check, Circle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/PageHeader';

export default function Shipping() {
  const { data: tasks, isLoading } = useListShippingTasks();
  const updateTask = useUpdateShippingTask();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleStepToggle = (taskId: number, stepKey: string, completed: boolean) => {
    const task = tasks?.find(t => t.id === taskId);
    if (!task) return;

    const updatedSteps = task.steps.map(step => 
      step.key === stepKey ? { ...step, completed } : step
    );

    updateTask.mutate(
      { id: taskId, data: { steps: updatedSteps } },
      {
        onSuccess: () => {
          toast({ title: 'Saved' });
          queryClient.invalidateQueries({ queryKey: getListShippingTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
      }
    );
  };

  if (isLoading) return <div className="h-32 bg-muted/60 rounded-xl animate-pulse" />;

  const activeTasks = tasks?.filter(t => !t.steps.every(s => s.completed)) || [];
  const doneTasks = tasks?.filter(t => t.steps.every(s => s.completed)) || [];

  return (
    <div className="space-y-6">
      <PageHeader
        label="Sales / pull · print · pack · ship"
        title="Shipping"
        description={`${activeTasks.length} sale${activeTasks.length === 1 ? '' : 's'} waiting for a shipping action.`}
        actions={<Link href="/orders" className="inline-flex h-11 items-center rounded-full border border-foreground px-5 text-sm font-medium hover:bg-muted">Sold & delisting status</Link>}
      />

      <div className="space-y-6">
        {!tasks?.length ? (
          <div className="glass-card p-12 rounded-xl text-center border-dashed border-border/50">
            <p className="font-sans font-bold text-muted-foreground">No fulfillment tasks</p>
          </div>
        ) : (
          <>
            {activeTasks.map(task => (
              <div key={task.id} className="glass-card-glow rounded-xl overflow-hidden border border-success/30 bg-success/5">
                <div className="p-5 border-b border-border flex items-start justify-between bg-muted/70">
                  <div>
                    <h3 className="font-sans font-bold text-lg text-foreground">{task.itemTitle || 'Untitled Order'}</h3>
                    <p className="text-xs font-pixel text-success mt-1">{task.orderMarketplace}</p>
                  </div>
                  <div className="text-right text-xs font-sans text-muted-foreground space-y-2">
                    <p>Buyer: <span className="font-bold text-foreground">{task.orderBuyerName}</span></p>
                    <div className="flex items-center gap-2 justify-end" data-testid={`progress-task-${task.id}`}>
                      <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-success transition-all duration-300"
                          style={{ width: `${(task.steps.filter(s => s.completed).length / task.steps.length) * 100}%` }}
                        />
                      </div>
                      <span className="font-pixel text-[10px] text-success">
                        {task.steps.filter(s => s.completed).length}/{task.steps.length}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="p-2 space-y-1">
                  {task.steps.map((step, idx) => (
                    <button
                      key={step.key}
                      onClick={() => handleStepToggle(task.id, step.key, !step.completed)}
                      className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-muted/60 transition-colors group text-left"
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                        step.completed ? 'bg-success border-success text-background' : 'border-muted-foreground/50 group-hover:border-success/50'
                      }`}>
                        {step.completed && <Check size={12} strokeWidth={3} />}
                      </div>
                      <div className="flex-1">
                        <p className={`font-sans text-sm font-semibold transition-colors ${step.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                          {step.label}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {doneTasks.length > 0 && (
              <div className="pt-8">
                <h3 className="text-xs font-sans font-bold text-muted-foreground uppercase tracking-widest mb-4">Completed ({doneTasks.length})</h3>
                <div className="space-y-2">
                  {doneTasks.map(task => (
                    <div key={task.id} className="px-4 py-3 rounded-lg border border-border bg-muted/60 flex items-center justify-between opacity-50">
                      <span className="font-sans text-sm line-through text-muted-foreground">{task.itemTitle}</span>
                      <Check size={14} className="text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
