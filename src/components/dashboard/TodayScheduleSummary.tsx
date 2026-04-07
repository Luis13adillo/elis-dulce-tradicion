import { useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  AlertTriangle,
  Truck,
  ShoppingBag,
  CheckCircle2,
  Timer
} from 'lucide-react';
import { Order } from '@/types/order';
import { differenceInMinutes, format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface TodayScheduleSummaryProps {
  orders: Order[];
  maxDailyCapacity?: number;
  darkMode?: boolean;
}

const TodayScheduleSummary = ({ orders, maxDailyCapacity = 10, darkMode = false }: TodayScheduleSummaryProps) => {
  const { t } = useLanguage();
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');

  // Filter today's orders
  const todayOrders = useMemo(() => {
    return orders.filter(order => order.date_needed === todayStr);
  }, [orders, todayStr]);

  // Categorize orders
  const { urgentOrders, upcomingOrders, deliveryOrders, pickupOrders, completedToday } = useMemo(() => {
    const urgent: Order[] = [];
    const upcoming: Order[] = [];
    const delivery: Order[] = [];
    const pickup: Order[] = [];
    const completed: Order[] = [];

    todayOrders.forEach(order => {
      if (order.status === 'completed' || order.status === 'delivered') {
        completed.push(order);
        return;
      }
      if (order.status === 'cancelled') return;

      if (order.delivery_option === 'delivery') {
        delivery.push(order);
      } else {
        pickup.push(order);
      }

      if (order.time_needed) {
        const dueTime = parseISO(`${order.date_needed}T${order.time_needed}`);
        const minutesUntilDue = differenceInMinutes(dueTime, now);

        if (minutesUntilDue <= 60 && minutesUntilDue > -30 && order.status !== 'ready') {
          urgent.push(order);
        } else if (minutesUntilDue > 60 && minutesUntilDue <= 180) {
          upcoming.push(order);
        }
      }
    });

    urgent.sort((a, b) => {
      const timeA = a.time_needed || '23:59';
      const timeB = b.time_needed || '23:59';
      return timeA.localeCompare(timeB);
    });

    return {
      urgentOrders: urgent,
      upcomingOrders: upcoming,
      deliveryOrders: delivery,
      pickupOrders: pickup,
      completedToday: completed
    };
  }, [todayOrders, now]);

  // Group orders by hour
  const ordersByHour = useMemo(() => {
    const byHour: Record<string, Order[]> = {};

    todayOrders.forEach(order => {
      if (order.status === 'cancelled') return;
      if (order.time_needed) {
        const hour = order.time_needed.split(':')[0];
        if (!byHour[hour]) byHour[hour] = [];
        byHour[hour].push(order);
      }
    });

    return Object.entries(byHour)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([hour, orders]) => ({
        hour: `${hour}:00`,
        orders,
        count: orders.length
      }));
  }, [todayOrders]);

  // Calculate capacity
  const activeOrders = todayOrders.filter(o =>
    !['cancelled', 'completed', 'delivered'].includes(o.status)
  ).length;
  const capacityPercent = Math.min(100, (activeOrders / maxDailyCapacity) * 100);

  return (
    <div className={cn(
      "rounded-2xl border shadow-sm p-5 transition-colors duration-300",
      darkMode
        ? "bg-[#1f2937] border-slate-700"
        : "bg-white border-gray-100"
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Clock className={cn("h-5 w-5", darkMode ? "text-[#C6A649]" : "text-primary")} />
        <h3 className={cn("text-lg font-bold tracking-tight", darkMode ? "text-white" : "text-gray-900")}>
          {t("Resumen de Hoy", "Today's Schedule")}
        </h3>
        <div className={cn(
          "ml-auto text-xs font-medium px-3 py-1 rounded-full",
          darkMode ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-gray-600"
        )}>
          {format(now, 'EEEE, MMM d')}
        </div>
      </div>

      {/* Urgent Orders Alert */}
      {urgentOrders.length > 0 && (
        <div className={cn(
          "rounded-lg border p-3 mb-4",
          darkMode
            ? "bg-red-900/20 border-red-500/30"
            : "bg-red-50 border-red-200"
        )}>
          <div className={cn(
            "flex items-center gap-2 font-semibold mb-2",
            darkMode ? "text-red-400" : "text-red-700"
          )}>
            <AlertTriangle className="h-4 w-4 animate-pulse" />
            {t('Urgente - Próxima Hora', 'Urgent - Next Hour')} ({urgentOrders.length})
          </div>
          <div className="space-y-1">
            {urgentOrders.slice(0, 3).map(order => (
              <div key={order.id} className="flex justify-between items-center text-sm">
                <span className={cn("font-mono", darkMode ? "text-slate-300" : "text-gray-700")}>
                  #{order.order_number}
                </span>
                <span className={cn(darkMode ? "text-slate-400" : "text-gray-500")}>
                  {order.cake_size}
                </span>
                <Badge variant="destructive" className="text-xs">
                  <Timer className="h-3 w-3 mr-1" />
                  {order.time_needed}
                </Badge>
              </div>
            ))}
            {urgentOrders.length > 3 && (
              <p className={cn("text-xs", darkMode ? "text-red-400" : "text-red-600")}>
                +{urgentOrders.length - 3} {t('más', 'more')}...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-4 gap-2 text-center mb-4">
        <div className={cn(
          "rounded-xl p-3 border",
          darkMode ? "bg-[#13141f] border-slate-700" : "bg-gray-50 border-gray-100"
        )}>
          <p className={cn("text-2xl font-bold", darkMode ? "text-white" : "text-gray-900")}>
            {todayOrders.length}
          </p>
          <p className={cn("text-xs mt-0.5", darkMode ? "text-slate-400" : "text-gray-500")}>
            {t('Total', 'Total')}
          </p>
        </div>
        <div className={cn(
          "rounded-xl p-3 border",
          darkMode ? "bg-[#13141f] border-slate-700" : "bg-gray-50 border-gray-100"
        )}>
          <p className={cn("text-2xl font-bold", darkMode ? "text-orange-400" : "text-orange-500")}>
            {deliveryOrders.length}
          </p>
          <p className={cn("text-xs mt-0.5 flex items-center justify-center gap-1", darkMode ? "text-slate-400" : "text-gray-500")}>
            <Truck className="h-3 w-3" />
            {t('Envíos', 'Delivery')}
          </p>
        </div>
        <div className={cn(
          "rounded-xl p-3 border",
          darkMode ? "bg-[#13141f] border-slate-700" : "bg-gray-50 border-gray-100"
        )}>
          <p className={cn("text-2xl font-bold", darkMode ? "text-blue-400" : "text-blue-500")}>
            {pickupOrders.length}
          </p>
          <p className={cn("text-xs mt-0.5 flex items-center justify-center gap-1", darkMode ? "text-slate-400" : "text-gray-500")}>
            <ShoppingBag className="h-3 w-3" />
            {t('Recoger', 'Pickup')}
          </p>
        </div>
        <div className={cn(
          "rounded-xl p-3 border",
          darkMode ? "bg-[#13141f] border-slate-700" : "bg-gray-50 border-gray-100"
        )}>
          <p className={cn("text-2xl font-bold", darkMode ? "text-green-400" : "text-green-500")}>
            {completedToday.length}
          </p>
          <p className={cn("text-xs mt-0.5 flex items-center justify-center gap-1", darkMode ? "text-slate-400" : "text-gray-500")}>
            <CheckCircle2 className="h-3 w-3" />
            {t('Listos', 'Done')}
          </p>
        </div>
      </div>

      {/* Capacity Bar */}
      <div className="space-y-1.5 mb-4">
        <div className="flex justify-between text-sm">
          <span className={cn(darkMode ? "text-slate-400" : "text-gray-500")}>
            {t('Capacidad', 'Capacity')}
          </span>
          <span className={cn("font-medium tabular-nums", darkMode ? "text-slate-300" : "text-gray-700")}>
            {activeOrders}/{maxDailyCapacity}
          </span>
        </div>
        <div className={cn("h-2 rounded-full overflow-hidden", darkMode ? "bg-slate-800" : "bg-gray-100")}>
          <div
            className={cn(
              "h-full rounded-full transition-all",
              capacityPercent > 80 ? "bg-red-500" : capacityPercent > 50 ? "bg-yellow-500" : "bg-green-500"
            )}
            style={{ width: `${capacityPercent}%` }}
          />
        </div>
      </div>

      {/* Timeline */}
      {ordersByHour.length > 0 && (
        <div className="space-y-2 mb-3">
          <p className={cn("text-xs font-semibold uppercase tracking-wider", darkMode ? "text-slate-500" : "text-gray-400")}>
            {t('Línea de Tiempo', 'Timeline')}
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {ordersByHour.map(({ hour, count }) => {
              const currentHour = format(now, 'HH:00');
              const isPast = hour < currentHour;
              const isCurrent = hour === currentHour;

              return (
                <div
                  key={hour}
                  className={cn(
                    "flex-shrink-0 text-center p-2 rounded-lg min-w-[52px] transition-all",
                    isCurrent
                      ? "bg-[#C6A649] text-white ring-2 ring-[#C6A649]/30 ring-offset-1"
                      : isPast
                        ? darkMode ? "bg-slate-800 text-slate-500" : "bg-gray-100 text-gray-400"
                        : darkMode ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-gray-600",
                    isCurrent && darkMode && "ring-offset-[#1f2937]"
                  )}
                >
                  <p className="text-xs font-medium">{hour}</p>
                  <p className="text-lg font-bold leading-tight">{count}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming orders hint */}
      {upcomingOrders.length > 0 && (
        <div className={cn(
          "text-sm rounded-lg p-2.5",
          darkMode ? "bg-[#13141f] text-slate-400" : "bg-gray-50 text-gray-500"
        )}>
          <span className={cn("font-medium", darkMode ? "text-slate-300" : "text-gray-700")}>
            {t('Próximas 3 horas', 'Next 3 hours')}:
          </span>{' '}
          {upcomingOrders.length} {t('órdenes pendientes', 'orders pending')}
        </div>
      )}

      {/* Empty State */}
      {todayOrders.length === 0 && (
        <div className={cn("text-center py-4", darkMode ? "text-slate-500" : "text-gray-400")}>
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t('No hay órdenes para hoy', 'No orders for today')}</p>
        </div>
      )}
    </div>
  );
};

export default TodayScheduleSummary;
