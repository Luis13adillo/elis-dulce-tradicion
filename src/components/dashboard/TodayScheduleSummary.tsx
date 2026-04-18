import { useMemo, useState, useEffect } from 'react';
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
  compact?: boolean;
}

const TodayScheduleSummary = ({ orders, maxDailyCapacity = 10, darkMode = false, compact = false }: TodayScheduleSummaryProps) => {
  const { t } = useLanguage();
  const [tick, setTick] = useState(() => new Date());
  const [urgentExpanded, setUrgentExpanded] = useState(false);

  useEffect(() => {
    if (!compact) return;
    const id = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(id);
  }, [compact]);

  const now = compact ? tick : new Date();
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
  const capacityColor =
    capacityPercent > 80 ? 'bg-red-500' : capacityPercent > 50 ? 'bg-yellow-500' : 'bg-green-500';

  if (compact) {
    const statChips = [
      {
        key: 'total',
        label: t('Total', 'Total'),
        value: todayOrders.length,
        icon: null as React.ReactNode,
        valueClass: darkMode ? 'text-white' : 'text-gray-900',
        chipClass: darkMode
          ? 'bg-slate-800/60 border-slate-700/60'
          : 'bg-gray-50 border-gray-100',
      },
      {
        key: 'delivery',
        label: t('Envíos', 'Delivery'),
        value: deliveryOrders.length,
        icon: <Truck className="h-3.5 w-3.5" />,
        valueClass: darkMode ? 'text-orange-400' : 'text-orange-500',
        chipClass: darkMode
          ? 'bg-orange-500/10 border-orange-500/20'
          : 'bg-orange-50 border-orange-100',
      },
      {
        key: 'pickup',
        label: t('Recoger', 'Pickup'),
        value: pickupOrders.length,
        icon: <ShoppingBag className="h-3.5 w-3.5" />,
        valueClass: darkMode ? 'text-blue-400' : 'text-blue-500',
        chipClass: darkMode
          ? 'bg-blue-500/10 border-blue-500/20'
          : 'bg-blue-50 border-blue-100',
      },
      {
        key: 'done',
        label: t('Listos', 'Done'),
        value: completedToday.length,
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        valueClass: darkMode ? 'text-green-400' : 'text-green-500',
        chipClass: darkMode
          ? 'bg-green-500/10 border-green-500/20'
          : 'bg-green-50 border-green-100',
      },
    ];

    return (
      <section
        aria-label={t('Resumen de hoy', 'Today summary')}
        className={cn(
          'rounded-2xl border px-4 py-2.5 flex items-center gap-3 flex-wrap transition-colors duration-300',
          darkMode
            ? 'bg-gradient-to-r from-[#1A1A2E] to-[#1f2937] border-[#C6A649]/15'
            : 'bg-white/70 backdrop-blur-xl border-transparent shadow-[0_8px_30px_rgb(0,0,0,0.04)]'
        )}
      >
        {/* Title */}
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="h-4 w-4 text-[#C6A649] flex-shrink-0" />
          <h3 className={cn('font-display text-base font-semibold tracking-tight whitespace-nowrap', darkMode ? 'text-white' : 'text-gray-900')}>
            {t("Resumen de Hoy", "Today's Schedule")}
          </h3>
          <span className={cn(
            'hidden md:inline-block text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap',
            darkMode ? 'bg-slate-800/60 text-slate-300' : 'bg-gray-100 text-gray-600'
          )}>
            {format(now, 'EEE, MMM d')}
          </span>
        </div>

        {/* Divider */}
        <span className={cn('hidden lg:block h-6 w-px', darkMode ? 'bg-slate-700' : 'bg-gray-200')} aria-hidden />

        {/* Stat Chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {statChips.map((chip) => (
            <div
              key={chip.key}
              aria-label={`${chip.value} ${chip.label}`}
              className={cn(
                'flex items-center gap-2 px-2.5 py-1 rounded-xl border',
                chip.chipClass
              )}
            >
              {chip.icon && <span className={chip.valueClass}>{chip.icon}</span>}
              <span className={cn('tabular-nums font-semibold text-base leading-none', chip.valueClass)}>
                {chip.value}
              </span>
              <span className={cn('text-[10px] uppercase tracking-wider font-medium', darkMode ? 'text-slate-400' : 'text-gray-500')}>
                {chip.label}
              </span>
            </div>
          ))}
        </div>

        {/* Urgent Chip */}
        {urgentOrders.length > 0 && (
          <button
            type="button"
            onClick={() => setUrgentExpanded((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
              'bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/15',
              darkMode && 'text-red-400 border-red-500/30'
            )}
            aria-expanded={urgentExpanded}
            aria-label={t(`${urgentOrders.length} urgentes`, `${urgentOrders.length} urgent`)}
          >
            <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />
            <span className="tabular-nums">{urgentOrders.length}</span>
            <span>{t('urgentes', 'urgent')}</span>
          </button>
        )}

        {/* Capacity */}
        <div className="flex items-center gap-2 ml-auto">
          <span className={cn('text-[10px] uppercase tracking-wider font-medium hidden sm:inline', darkMode ? 'text-slate-400' : 'text-gray-500')}>
            {t('Capacidad', 'Capacity')}
          </span>
          <div className={cn('h-1.5 w-20 rounded-full overflow-hidden', darkMode ? 'bg-slate-800' : 'bg-gray-200')}>
            <div
              className={cn('h-full rounded-full transition-[width] duration-300', capacityColor)}
              style={{ width: `${capacityPercent}%` }}
            />
          </div>
          <span className={cn('text-xs tabular-nums font-medium whitespace-nowrap', darkMode ? 'text-slate-300' : 'text-gray-700')}>
            {activeOrders}/{maxDailyCapacity}
          </span>
        </div>

        {/* Live Clock */}
        <span className={cn(
          'hidden md:inline text-xs font-sans tabular-nums font-medium pl-2 border-l',
          darkMode ? 'text-slate-300 border-slate-700' : 'text-gray-700 border-gray-200'
        )}>
          {format(now, 'hh:mm:ss a')}
        </span>

        {/* Urgent expanded list */}
        {urgentExpanded && urgentOrders.length > 0 && (
          <div className={cn(
            'w-full mt-2 rounded-xl border p-2.5 space-y-1',
            darkMode ? 'bg-red-900/15 border-red-500/30' : 'bg-red-50 border-red-200'
          )}>
            {urgentOrders.slice(0, 5).map((order) => (
              <div key={order.id} className="flex items-center justify-between text-xs">
                <span className={cn('font-mono', darkMode ? 'text-slate-300' : 'text-gray-700')}>
                  #{order.order_number}
                </span>
                <span className={cn(darkMode ? 'text-slate-400' : 'text-gray-500')}>
                  {order.cake_size}
                </span>
                <Badge variant="destructive" className="text-[10px] py-0">
                  <Timer className="h-2.5 w-2.5 mr-1" />
                  {order.time_needed}
                </Badge>
              </div>
            ))}
            {urgentOrders.length > 5 && (
              <p className={cn('text-[11px]', darkMode ? 'text-red-400' : 'text-red-600')}>
                +{urgentOrders.length - 5} {t('más', 'more')}...
              </p>
            )}
          </div>
        )}
      </section>
    );
  }

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
