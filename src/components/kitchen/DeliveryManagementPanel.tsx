import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Order } from '@/types/order';
import { cn } from '@/lib/utils';
import { Truck, Package, Clock, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeliveryCard } from './DeliveryCard';

interface DeliveryManagementPanelProps {
  orders: Order[];
  darkMode: boolean;
  onRefresh: () => void;
  onShowDetails: (order: Order) => void;
}

export function DeliveryManagementPanel({
  orders,
  darkMode,
  onRefresh,
  onShowDetails,
}: DeliveryManagementPanelProps) {
  const { t } = useLanguage();
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});

  // Filter to today's delivery orders
  const todayDeliveries = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    return orders
      .filter((o) => o.delivery_option === 'delivery' && o.date_needed === today)
      .sort((a, b) => {
        const statusOrder: Record<string, number> = {
          ready: 0,
          out_for_delivery: 1,
          delivered: 2,
          completed: 3,
        };
        const sa = statusOrder[a.status] ?? 0;
        const sb = statusOrder[b.status] ?? 0;
        if (sa !== sb) return sa - sb;
        const timeA = a.time_needed || '23:59';
        const timeB = b.time_needed || '23:59';
        return timeA.localeCompare(timeB);
      });
  }, [orders]);

  // Summary stats — use order.status (not delivery_status)
  const stats = useMemo(() => ({
    total: todayDeliveries.length,
    pending: todayDeliveries.filter(o => o.status === 'ready').length,
    inTransit: todayDeliveries.filter(o => o.status === 'out_for_delivery').length,
    delivered: todayDeliveries.filter(o => o.status === 'delivered').length,
  }), [todayDeliveries]);

  const handleDispatch = async (orderId: number) => {
    setActionLoading(prev => ({ ...prev, [orderId]: true }));
    try {
      await api.updateOrderStatus(orderId, 'out_for_delivery');
      toast.success(t('Enviado a domicilio', 'Dispatched for delivery'));
      onRefresh();
    } catch {
      toast.error(t('Error al despachar', 'Error dispatching'));
    } finally {
      setActionLoading(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const handleMarkDelivered = async (orderId: number) => {
    setActionLoading(prev => ({ ...prev, [orderId]: true }));
    try {
      await api.updateOrderStatus(orderId, 'delivered');
      toast.success(t('Orden entregada', 'Order delivered'));
      onRefresh();
    } catch {
      toast.error(t('Error al marcar', 'Error marking delivered'));
    } finally {
      setActionLoading(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const statCards = [
    {
      label: t('Total', 'Total'),
      value: stats.total,
      icon: Package,
      color: darkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600',
    },
    {
      label: t('Listas', 'Ready'),
      value: stats.pending,
      icon: Clock,
      color: darkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600',
    },
    {
      label: t('En camino', 'In Transit'),
      value: stats.inTransit,
      icon: Truck,
      color: darkMode ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-600',
    },
    {
      label: t('Entregados', 'Delivered'),
      value: stats.delivered,
      icon: CheckCircle2,
      color: darkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600',
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2
            className={cn(
              "text-xl font-bold",
              darkMode ? "text-white" : "text-gray-900"
            )}
          >
            {t("Entregas de Hoy", "Today's Deliveries")}
          </h2>
          <p className={cn("text-sm mt-1", darkMode ? "text-slate-400" : "text-gray-500")}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className={cn(
            "rounded-xl",
            darkMode ? "border-slate-600 text-slate-300 hover:bg-slate-700" : ""
          )}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('Actualizar', 'Refresh')}
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className={cn(
              "rounded-2xl p-4 shadow-sm border",
              darkMode ? "bg-[#1f2937] border-slate-700/50" : "bg-white border-gray-100"
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-xl", stat.color)}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className={cn("text-2xl font-bold", darkMode ? "text-white" : "text-gray-900")}>
                  {stat.value}
                </p>
                <p className={cn("text-xs", darkMode ? "text-slate-400" : "text-gray-500")}>
                  {stat.label}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delivery Cards Grid */}
      <div className="flex-1 overflow-y-auto pb-20">
        {todayDeliveries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Truck className="h-16 w-16 mb-4 opacity-50" />
            <p className={cn("text-lg font-medium", darkMode ? "text-slate-400" : "text-gray-400")}>
              {t('No hay entregas para hoy', 'No deliveries for today')}
            </p>
            <p className={cn("text-sm mt-1", darkMode ? "text-slate-500" : "text-gray-400")}>
              {t(
                'Las ordenes de entrega aparecerán aquí',
                'Delivery orders will appear here'
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {todayDeliveries.map((order) => (
              <DeliveryCard
                key={order.id}
                order={order}
                onDispatch={handleDispatch}
                onMarkDelivered={handleMarkDelivered}
                onShowDetails={onShowDetails}
                isLoading={!!actionLoading[order.id]}
                darkMode={darkMode}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
