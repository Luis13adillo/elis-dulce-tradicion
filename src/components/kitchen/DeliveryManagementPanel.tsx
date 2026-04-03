import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Order, DeliveryStatus } from '@/types/order';
import { cn } from '@/lib/utils';
import { Truck, Package, Clock, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
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
  const [staffMembers, setStaffMembers] = useState<{ id: string; full_name: string; role: string }[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [staffError, setStaffError] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});

  const fetchStaff = async () => {
    setLoadingStaff(true);
    setStaffError(false);
    try {
      const members = await api.getStaffMembers();
      setStaffMembers(members);
    } catch (err) {
      setStaffError(true);
      toast.error(t('Error al cargar personal', 'Error loading staff'), {
        action: {
          label: t('Reintentar', 'Retry'),
          onClick: () => fetchStaff(),
        },
      });
    } finally {
      setLoadingStaff(false);
    }
  };

  // Fetch staff members on mount
  useEffect(() => {
    fetchStaff();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter to today's delivery orders
  const todayDeliveries = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    return orders
      .filter((o) => o.delivery_option === 'delivery' && o.date_needed === today)
      .sort((a, b) => {
        // Sort: pending first, then assigned, in_transit, delivered, failed
        const statusOrder: Record<string, number> = {
          pending: 0,
          assigned: 1,
          in_transit: 2,
          failed: 3,
          delivered: 4,
        };
        const sa = statusOrder[(a.delivery_status as string) || 'pending'] ?? 0;
        const sb = statusOrder[(b.delivery_status as string) || 'pending'] ?? 0;
        if (sa !== sb) return sa - sb;
        // Then by time needed
        const timeA = a.time_needed || '23:59';
        const timeB = b.time_needed || '23:59';
        return timeA.localeCompare(timeB);
      });
  }, [orders]);

  // Summary stats
  const stats = useMemo(() => ({
    total: todayDeliveries.length,
    pending: todayDeliveries.filter((o) => !o.delivery_status || o.delivery_status === 'pending').length,
    inTransit: todayDeliveries.filter((o) => o.delivery_status === 'assigned' || o.delivery_status === 'in_transit').length,
    delivered: todayDeliveries.filter((o) => o.delivery_status === 'delivered').length,
    failed: todayDeliveries.filter((o) => o.delivery_status === 'failed').length,
  }), [todayDeliveries]);

  const handleAssignDriver = async (orderId: number, driverId: string) => {
    setActionLoading((prev) => ({ ...prev, [orderId]: true }));
    try {
      const result = await api.assignDelivery(orderId, driverId);
      if (result.success) {
        toast.success(t('Conductor asignado', 'Driver assigned'));
        onRefresh();
      } else {
        toast.error(result.error || t('Error al asignar', 'Error assigning driver'));
      }
    } catch {
      toast.error(t('Error al asignar', 'Error assigning driver'));
    } finally {
      setActionLoading((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const handleStatusUpdate = async (orderId: number, newStatus: DeliveryStatus, notes?: string) => {
    setActionLoading((prev) => ({ ...prev, [orderId]: true }));
    try {
      const result = await api.updateDeliveryStatus(orderId, newStatus, notes);
      if (result.success) {
        const labels: Record<string, string> = {
          pending: t('Pendiente', 'Pending'),
          assigned: t('Asignado', 'Assigned'),
          in_transit: t('En camino', 'In Transit'),
          delivered: t('Entregado', 'Delivered'),
          failed: t('Fallido', 'Failed'),
        };
        toast.success(labels[newStatus] || newStatus);
        onRefresh();
      } else {
        toast.error(result.error || t('Error al actualizar', 'Error updating status'));
      }
    } catch {
      toast.error(t('Error al actualizar', 'Error updating status'));
    } finally {
      setActionLoading((prev) => ({ ...prev, [orderId]: false }));
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
      label: t('Pendientes', 'Pending'),
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

      {/* Staff data error indicator */}
      {staffError && (
        <p className={cn(
          "text-xs flex items-center gap-1 mb-4",
          darkMode ? "text-red-400" : "text-red-500"
        )}>
          <AlertTriangle className="h-3 w-3" />
          {t('Sin datos de personal', 'Staff data unavailable')}
          <button
            className="underline ml-1"
            onClick={() => fetchStaff()}
          >
            {t('Reintentar', 'Retry')}
          </button>
        </p>
      )}

      {/* Failed deliveries alert */}
      {stats.failed > 0 && (
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl border mb-6",
            darkMode
              ? "bg-red-900/20 border-red-500/30 text-red-400"
              : "bg-red-50 border-red-200 text-red-700"
          )}
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span className="font-bold text-sm">
            {stats.failed} {t('entrega(s) fallida(s)', 'failed delivery(ies)')}
          </span>
        </div>
      )}

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
                staffMembers={staffMembers}
                onAssignDriver={handleAssignDriver}
                onStatusUpdate={handleStatusUpdate}
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
