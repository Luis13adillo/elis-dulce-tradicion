import { useLanguage } from '@/contexts/LanguageContext';
import { Order } from '@/types/order';
import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrderProgressStepperProps {
  order: Order;
  darkMode?: boolean;
}

type StepStatus = 'completed' | 'current' | 'future' | 'cancelled';

// Baker-facing vocabulary — matches the action buttons on Front Desk cards
// (Confirm Order → Start Baking → Ready for Pickup → Mark Picked Up).
// `ready` and `completed` are context-aware on delivery_option below.
const STATUS_LABELS: Record<string, { es: string; en: string }> = {
  pending: { es: 'Pendiente', en: 'Pending' },
  confirmed: { es: 'Confirmada', en: 'Confirmed' },
  in_progress: { es: 'Horneando', en: 'Baking' },
  ready: { es: 'Lista', en: 'Ready' },
  out_for_delivery: { es: 'En Camino', en: 'Out for Delivery' },
  delivered: { es: 'Entregada', en: 'Delivered' },
  completed: { es: 'Completada', en: 'Completed' },
  cancelled: { es: 'Cancelada', en: 'Cancelled' },
};

function getStepLabel(step: string, deliveryOption?: string): { es: string; en: string } {
  if (step === 'ready') {
    return deliveryOption === 'delivery'
      ? { es: 'Lista para Despachar', en: 'Ready to Dispatch' }
      : { es: 'Lista para Recoger', en: 'Ready for Pickup' };
  }
  if (step === 'completed' && deliveryOption !== 'delivery') {
    return { es: 'Recogida', en: 'Picked Up' };
  }
  return STATUS_LABELS[step];
}

function getSteps(deliveryOption?: string): string[] {
  if (deliveryOption === 'delivery') {
    return ['pending', 'confirmed', 'in_progress', 'ready', 'delivered', 'completed'];
  }
  return ['pending', 'confirmed', 'in_progress', 'ready', 'completed'];
}

function getStepStatus(
  stepIndex: number,
  currentIndex: number,
  isCancelled: boolean
): StepStatus {
  if (isCancelled) {
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'cancelled';
    return 'future';
  }
  if (stepIndex < currentIndex) return 'completed';
  if (stepIndex === currentIndex) return 'current';
  return 'future';
}

export function OrderProgressStepper({ order, darkMode = false }: OrderProgressStepperProps) {
  const { t } = useLanguage();
  const isCancelled = order.status === 'cancelled';
  const steps = getSteps(order.delivery_option);

  // Find current step index — for cancelled orders, find last known position
  // (cancelled orders were at their last step before cancellation)
  let currentIndex: number;
  if (isCancelled) {
    // Show cancelled at the end of whatever progress was made
    // We don't know the exact step, so show it at step 0 (pending)
    // unless we can infer from timestamps
    if (order.completed_at) currentIndex = steps.indexOf('completed');
    else if (order.ready_at) currentIndex = steps.indexOf('ready');
    else if (order.confirmed_at) currentIndex = steps.indexOf('confirmed');
    else currentIndex = 0;
  } else {
    currentIndex = steps.indexOf(order.status as string);
    if (currentIndex === -1) currentIndex = 0;
  }

  return (
    <div className="space-y-1">
      <div className={cn(
        "text-xs uppercase tracking-widest mb-3 font-bold",
        darkMode ? "text-slate-400" : "text-gray-500"
      )}>
        {t('Progreso de Orden', 'Order Progress')}
      </div>

      <div className="flex flex-col gap-0">
        {steps.map((step, index) => {
          const stepStatus = getStepStatus(index, currentIndex, isCancelled);
          const label = getStepLabel(step, order.delivery_option);
          const isLast = index === steps.length - 1;

          return (
            <div key={step} className="flex items-stretch gap-3">
              {/* Icon + Connector Column */}
              <div className="flex flex-col items-center w-6">
                {/* Circle/Icon */}
                <div className="flex items-center justify-center h-6 w-6 shrink-0">
                  {stepStatus === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : stepStatus === 'current' ? (
                    <div className={cn(
                      "h-5 w-5 rounded-full border-2 flex items-center justify-center",
                      darkMode
                        ? "border-[#C6A649] bg-[#C6A649]/20"
                        : "border-amber-500 bg-amber-50"
                    )}>
                      <div className={cn(
                        "h-2 w-2 rounded-full animate-pulse",
                        darkMode ? "bg-[#C6A649]" : "bg-amber-500"
                      )} />
                    </div>
                  ) : stepStatus === 'cancelled' ? (
                    <XCircle className="h-5 w-5 text-red-500" />
                  ) : (
                    <Circle className={cn(
                      "h-5 w-5",
                      darkMode ? "text-slate-600" : "text-gray-300"
                    )} />
                  )}
                </div>

                {/* Connector Line */}
                {!isLast && (
                  <div className={cn(
                    "w-0.5 flex-1 min-h-[16px]",
                    stepStatus === 'completed'
                      ? "bg-green-500/50"
                      : stepStatus === 'cancelled'
                        ? "bg-red-500/30"
                        : darkMode
                          ? "bg-slate-700"
                          : "bg-gray-200"
                  )} />
                )}
              </div>

              {/* Label */}
              <div className={cn(
                "flex items-center gap-2 pb-3",
                isLast && "pb-0"
              )}>
                <span className={cn(
                  "text-xs font-medium leading-none",
                  stepStatus === 'completed' && (darkMode ? "text-green-400" : "text-green-600"),
                  stepStatus === 'current' && (darkMode ? "text-[#C6A649] font-bold" : "text-amber-600 font-bold"),
                  stepStatus === 'cancelled' && "text-red-400 font-bold",
                  stepStatus === 'future' && (darkMode ? "text-slate-500" : "text-gray-400"),
                )}>
                  {t(label.es, label.en)}
                </span>

                {stepStatus === 'current' && (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider",
                    darkMode
                      ? "bg-[#C6A649]/20 text-[#C6A649]"
                      : "bg-amber-100 text-amber-700"
                  )}>
                    {t('Actual', 'Current')}
                  </span>
                )}

                {stepStatus === 'cancelled' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-red-500/20 text-red-400">
                    {t('Cancelado', 'Cancelled')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
