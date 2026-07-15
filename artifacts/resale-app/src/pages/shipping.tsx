import { useListShippingTasks, useUpdateShippingTask } from '@workspace/api-client-react';
import { CheckCircle, Circle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Shipping() {
  const { data: tasks, isLoading } = useListShippingTasks();
  const updateTask = useUpdateShippingTask();
  const { toast } = useToast();

  const handleStepToggle = (taskId: number, stepKey: string, completed: boolean) => {
    const task = tasks?.find(t => t.id === taskId);
    if (!task) return;

    const updatedSteps = task.steps.map(step => 
      step.key === stepKey ? { key: step.key, completed } : { key: step.key, completed: step.completed }
    );

    updateTask.mutate(
      { id: taskId, data: { steps: updatedSteps } },
      {
        onSuccess: () => {
          toast({ title: '✦ Step updated!', description: completed ? 'Step marked complete' : 'Step marked incomplete' });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 bg-muted/20 rounded-lg animate-pulse" />
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-48 bg-muted/20 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const completedCount = tasks?.filter(t => t.steps.every(s => s.completed)).length || 0;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="font-pixel text-4xl text-accent text-glow-mint glitch-text mb-2" data-text="Shipping">
          Shipping
        </h1>
        <p className="text-muted-foreground font-sans">
          {completedCount} of {tasks?.length || 0} tasks complete ★
        </p>
      </div>

      <div className="space-y-4">
        {!tasks || tasks.length === 0 ? (
          <div className="glass-card-glow p-12 rounded-xl text-center">
            <p className="font-pixel text-xl text-muted-foreground mb-4">No shipping tasks</p>
            <p className="text-muted-foreground font-sans">Tasks will appear when orders need shipping ★</p>
          </div>
        ) : (
          tasks.map((task) => {
            const allComplete = task.steps.every(s => s.completed);
            return (
              <div key={task.id} className={`glass-card-glow p-6 rounded-xl ${allComplete ? 'opacity-60' : ''}`} data-testid={`task-${task.id}`}>
                <div className="mb-4">
                  <h3 className="font-sans font-bold text-lg text-foreground mb-2">
                    {task.itemTitle || 'Untitled Item'}
                  </h3>
                  <div className="flex flex-wrap gap-4 text-sm font-sans text-muted-foreground">
                    {task.orderMarketplace && (
                      <span>Marketplace: <span className="text-primary font-bold">{task.orderMarketplace.toUpperCase()}</span></span>
                    )}
                    {task.orderBuyerName && (
                      <span>Buyer: <span className="text-foreground font-bold">{task.orderBuyerName}</span></span>
                    )}
                    {task.trackingNumber && (
                      <span>Tracking: <span className="text-accent font-mono text-xs">{task.trackingNumber}</span></span>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {task.steps.map((step, idx) => (
                    <button
                      key={step.key}
                      onClick={() => handleStepToggle(task.id, step.key, !step.completed)}
                      className={`
                        w-full flex items-center gap-4 p-4 rounded-lg transition-all
                        ${step.completed 
                          ? 'glass-card border border-accent/50 neon-glow-mint' 
                          : 'glass-card border border-border/30 hover:border-primary/50'
                        }
                      `}
                      data-testid={`step-${task.id}-${step.key}`}
                    >
                      {step.completed ? (
                        <CheckCircle className="text-accent animate-glow-pulse-mint" size={24} />
                      ) : (
                        <Circle className="text-muted-foreground" size={24} />
                      )}
                      <div className="flex-1 text-left">
                        <p className={`font-sans font-bold ${step.completed ? 'text-accent line-through' : 'text-foreground'}`}>
                          {step.label}
                        </p>
                        {step.completedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Completed: {new Date(step.completedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <span className="font-pixel text-xs text-muted-foreground">
                        {idx + 1}/{task.steps.length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
