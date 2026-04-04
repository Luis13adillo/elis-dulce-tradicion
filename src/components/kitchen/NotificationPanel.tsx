import { useMemo } from 'react';
import { Order } from '@/types/order';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { parseISO, format, formatDistanceToNow } from 'date-fns';
import { Bell, CheckCheck, AlertTriangle, Clock, CalendarDays, Inbox, ShoppingBag, CheckCircle, Cog, Star, Truck, XCircle } from 'lucide-react';
import { StatusChangeEvent } from '@/hooks/useOrdersFeed';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { NotificationItem, NotificationCategory } from './NotificationItem';

interface NotificationPanelProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  orders: Order[];
  onSelectOrder: (order: Order) => void;
  darkMode: boolean;
  markAsRead: (orderId: number) => void;
  markAllAsRead: (orderIds: number[]) => void;
  isUnread: (orderId: number) => boolean;
  activityFeed: StatusChangeEvent[];
}

const ACTIVE_STATUSES = ['pending', 'confirmed', 'in_progress', 'ready'];

interface CategorizedOrder {
  order: Order;
  category: NotificationCategory;
}

const STATUS_META: Record<string, { icon: React.ReactNode; label: string; labelEs: string; color: string }> = {
  pending:          { icon: <ShoppingBag className="h-3.5 w-3.5" />, label: 'New order',       labelEs: 'Nueva orden',        color: 'text-green-400' },
  confirmed:        { icon: <CheckCircle className="h-3.5 w-3.5" />, label: 'Confirmed',        labelEs: 'Confirmada',         color: 'text-yellow-400' },
  in_progress:      { icon: <Cog className="h-3.5 w-3.5" />,         label: 'Preparing',        labelEs: 'Preparando',         color: 'text-amber-400' },
  ready:            { icon: <Star className="h-3.5 w-3.5" />,         label: 'Ready',            labelEs: 'Lista',              color: 'text-green-400' },
  out_for_delivery: { icon: <Truck className="h-3.5 w-3.5" />,       label: 'Out for delivery', labelEs: 'En camino',          color: 'text-blue-400' },
  delivered:        { icon: <CheckCircle className="h-3.5 w-3.5" />, label: 'Delivered',        labelEs: 'Entregada',          color: 'text-gray-400' },
  completed:        { icon: <CheckCircle className="h-3.5 w-3.5" />, label: 'Completed',        labelEs: 'Completada',         color: 'text-gray-400' },
  cancelled:        { icon: <XCircle className="h-3.5 w-3.5" />,     label: 'Cancelled',        labelEs: 'Cancelada',          color: 'text-red-400' },
};

export function NotificationPanel({
  isOpen,
  onOpenChange,
  orders,
  onSelectOrder,
  darkMode,
  markAsRead,
  markAllAsRead,
  isUnread,
  activityFeed,
}: NotificationPanelProps) {
  const { t, language } = useLanguage();

  const { overdue, dueToday, upcoming, activeOrderIds, unreadCount } = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');

    const activeOrders = orders.filter(o => ACTIVE_STATUSES.includes(o.status));

    const categorized: Record<NotificationCategory, CategorizedOrder[]> = {
      overdue: [],
      'due-today': [],
      upcoming: [],
    };

    for (const order of activeOrders) {
      let category: NotificationCategory = 'upcoming';
      try {
        if (order.date_needed && order.time_needed) {
          const dueDateTime = parseISO(`${order.date_needed}T${order.time_needed}`);
          if (dueDateTime < now) {
            category = 'overdue';
          } else if (order.date_needed === todayStr) {
            category = 'due-today';
          }
        } else if (order.date_needed === todayStr) {
          category = 'due-today';
        }
      } catch {
        // If date parsing fails, treat as upcoming
      }
      categorized[category].push({ order, category });
    }

    // Sort each category by time_needed ascending
    const sortByTime = (a: CategorizedOrder, b: CategorizedOrder) => {
      try {
        const dtA = new Date(`${a.order.date_needed}T${a.order.time_needed}`);
        const dtB = new Date(`${b.order.date_needed}T${b.order.time_needed}`);
        return dtA.getTime() - dtB.getTime();
      } catch {
        return 0;
      }
    };

    categorized.overdue.sort(sortByTime);
    categorized['due-today'].sort(sortByTime);
    categorized.upcoming.sort(sortByTime);

    const ids = activeOrders.map(o => o.id);
    const unread = activeOrders.filter(o => isUnread(o.id)).length;

    return {
      overdue: categorized.overdue,
      dueToday: categorized['due-today'],
      upcoming: categorized.upcoming,
      activeOrderIds: ids,
      unreadCount: unread,
    };
  }, [orders, isUnread]);

  const handleMarkAllRead = () => {
    markAllAsRead(activeOrderIds);
  };

  const handleSelectOrder = (order: Order) => {
    markAsRead(order.id);
    onSelectOrder(order);
  };

  const totalOrders = overdue.length + dueToday.length + upcoming.length;

  const renderSection = (
    title: string,
    icon: React.ReactNode,
    items: CategorizedOrder[],
    colorClass: string
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg mb-2', colorClass)}>
          {icon}
          <span className="font-semibold text-sm">{title}</span>
          <span className="text-xs opacity-70">({items.length})</span>
        </div>
        <div className="space-y-2">
          {items.map(({ order, category }) => (
            <NotificationItem
              key={order.id}
              order={order}
              category={category}
              isUnread={isUnread(order.id)}
              onClick={() => handleSelectOrder(order)}
              darkMode={darkMode}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          'w-[380px] sm:w-[420px] p-0 flex flex-col',
          darkMode ? 'bg-[#1a1b2e] border-slate-700' : 'bg-gray-50 border-gray-200'
        )}
      >
        {/* Header */}
        <SheetHeader className={cn(
          'px-5 py-4 border-b',
          darkMode ? 'border-slate-700' : 'border-gray-200'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className={cn('h-5 w-5', darkMode ? 'text-slate-300' : 'text-gray-700')} />
              <SheetTitle className={cn(darkMode ? 'text-white' : 'text-gray-900')}>
                {t('Notificaciones', 'Notifications')}
              </SheetTitle>
              {unreadCount > 0 && (
                <span className="h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className={cn(
                  'text-xs h-8 gap-1',
                  darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-500 hover:text-gray-900'
                )}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t('Marcar todo leído', 'Mark all read')}
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* Body */}
        <ScrollArea className="flex-1 px-4 py-4">
          {/* Recent Activity Feed */}
          {activityFeed.length > 0 && (
            <div className="mb-5">
              <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg mb-2', darkMode ? 'bg-slate-700/50 text-slate-300' : 'bg-gray-100 text-gray-600')}>
                <Clock className="h-4 w-4" />
                <span className="font-semibold text-sm">{t('Actividad Reciente', 'Recent Activity')}</span>
              </div>
              <div className="space-y-1.5">
                {activityFeed.slice(0, 8).map((event, idx) => {
                  const meta = STATUS_META[event.toStatus];
                  const statusLabel = meta
                    ? (language === 'es' ? meta.labelEs : meta.label)
                    : event.toStatus;
                  return (
                    <div
                      key={`${event.orderId}-${idx}`}
                      className={cn(
                        'flex items-start gap-2.5 px-3 py-2 rounded-lg text-xs',
                        darkMode ? 'bg-slate-800/60 text-slate-300' : 'bg-white border border-gray-100 text-gray-600'
                      )}
                    >
                      <span className={cn('mt-0.5 flex-shrink-0', meta?.color ?? 'text-gray-400')}>
                        {meta?.icon ?? <Clock className="h-3.5 w-3.5" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className={cn('font-medium', darkMode ? 'text-white' : 'text-gray-800')}>
                          {event.customerName}
                        </span>
                        {' '}
                        <span className="opacity-70">#{event.orderNumber}</span>
                        {' — '}
                        <span className={meta?.color ?? ''}>{statusLabel}</span>
                      </div>
                      <span className={cn('flex-shrink-0 opacity-50 whitespace-nowrap', darkMode ? 'text-slate-400' : 'text-gray-400')}>
                        {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {totalOrders === 0 && activityFeed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Inbox className={cn('h-12 w-12 mb-3', darkMode ? 'text-slate-600' : 'text-gray-300')} />
              <p className={cn('text-sm font-medium', darkMode ? 'text-slate-400' : 'text-gray-500')}>
                {t('No hay órdenes activas', 'No active orders')}
              </p>
              <p className={cn('text-xs mt-1', darkMode ? 'text-slate-500' : 'text-gray-400')}>
                {t('Las nuevas órdenes aparecerán aquí', 'New orders will appear here')}
              </p>
            </div>
          ) : totalOrders === 0 ? null : (
            <>
              {renderSection(
                t('Atrasadas', 'Overdue'),
                <AlertTriangle className="h-4 w-4 text-red-400" />,
                overdue,
                darkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'
              )}

              {overdue.length > 0 && (dueToday.length > 0 || upcoming.length > 0) && (
                <Separator className={cn('my-3', darkMode ? 'bg-slate-700' : 'bg-gray-200')} />
              )}

              {renderSection(
                t('Para hoy', 'Due Today'),
                <Clock className="h-4 w-4 text-amber-400" />,
                dueToday,
                darkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-700'
              )}

              {dueToday.length > 0 && upcoming.length > 0 && (
                <Separator className={cn('my-3', darkMode ? 'bg-slate-700' : 'bg-gray-200')} />
              )}

              {renderSection(
                t('Próximas', 'Upcoming'),
                <CalendarDays className="h-4 w-4 text-blue-400" />,
                upcoming,
                darkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-700'
              )}
            </>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
