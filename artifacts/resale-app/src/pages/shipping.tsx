import { useListShippingTasks, useUpdateShippingTask, getListShippingTasksQueryKey, getListOrdersQueryKey, getGetDashboardSummaryQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Circle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

  if (isLoading) return <div className="h-32 bg-white/5 rounded-xl animate-pulse" />;

  const activeTasks = tasks?.filter(t => !t.steps.every(s => s.completed)) || [];
  const doneTasks = tasks?.filter(t => t.steps.every(s => s.completed)) || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-end justify-between border-b border-border/50 pb-4">
        <div>
          <h1 className="font-pixel text-xl tracking-wide uppercase text-foreground mb-2">Fulfillment</h1>
          <p className="text-xs font-sans text-muted-foreground uppercase tracking-widest">{activeTasks.length} PENDING TASKS</p>
        </div>
      </div>

      <div className="space-y-6">
        {!tasks?.length ? (
          <div className="glass-card p-12 rounded-xl text-center border-dashed border-border/50">
            <p className="font-sans font-bold text-muted-foreground">No fulfillment tasks</p>
          </div>
        ) : (
          <>
            {activeTasks.map(task => (
              <div key={task.id} className="glass-card-glow rounded-xl overflow-hidden border border-accent/30 bg-accent/5">
                <div className="p-5 border-b border-white/5 flex items-start justify-between bg-black/20">
                  <div>
                    <h3 className="font-sans font-bold text-lg text-foreground">{task.itemTitle || 'Untitled Order'}</h3>
                    <p className="text-xs font-pixel text-accent mt-1 uppercase">{task.orderMarketplace}</p>
                  </div>
                  <div className="text-right text-xs font-sans text-muted-foreground space-y-2">
                    <p>Buyer: <span className="font-bold text-foreground">{task.orderBuyerName}</span></p>
                    <div className="flex items-center gap-2 justify-end" data-testid={`progress-task-${task.id}`}>
                      <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent transition-all duration-300"
                          style={{ width: `${(task.steps.filter(s => s.completed).length / task.steps.length) * 100}%` }}
                        />
                      </div>
                      <span className="font-pixel text-[10px] text-accent">
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
                      className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors group text-left"
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                        step.completed ? 'bg-accent border-accent text-background' : 'border-muted-foreground/50 group-hover:border-accent/50'
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
                    <div key={task.id} className="px-4 py-3 rounded-lg border border-white/5 bg-white/5 flex items-center justify-between opacity-50">
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
