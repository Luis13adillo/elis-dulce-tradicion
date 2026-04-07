import { useLanguage } from '@/contexts/LanguageContext';
import { Order } from '@/types/order';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MapPin,
  Clock,
  Calendar,
  Truck,
  Loader2,
  Eye,
  CheckCircle2,
  Send,
} from 'lucide-react';

interface DeliveryCardProps {
  order: Order;
  onDispatch: (id: number) => void;
  onMarkDelivered: (id: number) => void;
  onShowDetails: (order: Order) => void;
  isLoading: boolean;
  darkMode: boolean;
}

const getOrderStatusColor = (status: string) => {
  switch (status) {
    case 'ready':
      return 'bg-amber-500 text-white';
    case 'out_for_delivery':
      return 'bg-purple-600 text-white';
    case 'delivered':
    case 'completed':
      return 'bg-green-600 text-white';
    default:
      return 'bg-gray-500 text-white';
  }
};

export function DeliveryCard({
  order,
  onDispatch,
  onMarkDelivered,
  onShowDetails,
  isLoading,
  darkMode,
}: DeliveryCardProps) {
  const { t } = useLanguage();

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready': return t('Lista para Despachar', 'Ready to Dispatch');
      case 'out_for_delivery': return t('En Camino', 'Out for Delivery');
      case 'delivered': return t('Entregado', 'Delivered');
      case 'completed': return t('Completado', 'Completed');
      default: return status;
    }
  };

  const renderActionButton = () => {
    if (isLoading) {
      return (
        <Button disabled className="flex-1 rounded-xl h-10">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          {t('Procesando...', 'Processing...')}
        </Button>
      );
    }

    if (order.status === 'ready') {
      return (
        <Button
          onClick={() => onDispatch(order.id)}
          className="flex-1 bg-purple-600 text-white hover:bg-purple-700 rounded-xl h-10"
        >
          <Send className="h-4 w-4 mr-2" />
          {t('Despachar', 'Dispatch')}
        </Button>
      );
    }

    if (order.status === 'out_for_delivery') {
      return (
        <Button
          onClick={() => onMarkDelivered(order.id)}
          className="flex-1 bg-green-600 text-white hover:bg-green-700 rounded-xl h-10"
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {t('Marcar Entregado', 'Mark Delivered')}
        </Button>
      );
    }

    if (order.status === 'delivered' || order.status === 'completed') {
      return (
        <div className={cn(
          "flex-1 flex items-center justify-center gap-2 rounded-xl h-10 text-sm font-medium",
          darkMode ? "bg-green-900/20 text-green-400" : "bg-green-50 text-green-700"
        )}>
          <CheckCircle2 className="h-4 w-4" />
          {t('Completado', 'Completed')}
        </div>
      );
    }

    return null;
  };

  const hasAction = order.status === 'ready' || order.status === 'out_for_delivery';

  return (
    <div
      className={cn(
        "rounded-2xl p-5 shadow-sm border flex flex-col gap-4 transition-all",
        darkMode
          ? "bg-[#1f2937] border-slate-700/50 hover:shadow-lg hover:shadow-slate-900/20"
          : "bg-white border-gray-100 hover:shadow-md",
      )}
    >
      {/* Header: Customer + Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
              darkMode ? "bg-slate-700 text-white" : "bg-gray-100 text-gray-700"
            )}
          >
            {(order.customer_name || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className={cn("font-semibold text-sm truncate", darkMode ? "text-white" : "text-gray-900")}>
              {order.customer_name || t('Sin nombre', 'No name')}
            </p>
            <p className={cn("text-xs", darkMode ? "text-slate-400" : "text-gray-500")}>
              #{order.order_number}
            </p>
          </div>
        </div>
        <Badge
          className={cn(
            "px-3 py-1 rounded-full text-xs font-bold border-none flex-shrink-0",
            getOrderStatusColor(order.status)
          )}
        >
          {getStatusLabel(order.status)}
        </Badge>
      </div>

      {/* Address */}
      <div className={cn("flex items-start gap-2 text-sm", darkMode ? "text-slate-300" : "text-gray-700")}>
        <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-400" />
        <div className="min-w-0">
          <p className="truncate">{order.delivery_address || t('Sin dirección', 'No address')}</p>
          {order.delivery_apartment && (
            <p className={cn("text-xs", darkMode ? "text-slate-400" : "text-gray-500")}>
              {order.delivery_apartment}
            </p>
          )}
          {order.delivery_zone && (
            <Badge
              variant="outline"
              className={cn(
                "mt-1 text-[10px] px-2 py-0 rounded-full",
                darkMode ? "border-slate-600 text-slate-400" : "border-gray-200 text-gray-500"
              )}
            >
              {order.delivery_zone}
            </Badge>
          )}
        </div>
      </div>

      {/* Time Info */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {order.date_needed && (
          <div className={cn("flex items-center gap-1.5 text-xs", darkMode ? "text-slate-400" : "text-gray-500")}>
            <Calendar className="h-3.5 w-3.5" />
            {order.date_needed}
          </div>
        )}
        {order.time_needed && (
          <div className={cn("flex items-center gap-1.5 text-xs", darkMode ? "text-slate-400" : "text-gray-500")}>
            <Clock className="h-3.5 w-3.5" />
            {order.time_needed}
          </div>
        )}
        {order.estimated_delivery_time && (
          <div className={cn("flex items-center gap-1.5 text-xs font-medium", darkMode ? "text-purple-400" : "text-purple-600")}>
            <Truck className="h-3.5 w-3.5" />
            ETA: {order.estimated_delivery_time}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-1">
        <Button
          variant="outline"
          onClick={() => onShowDetails(order)}
          className={cn(
            "rounded-xl h-10",
            !hasAction ? "flex-1" : "",
            darkMode ? "border-slate-600 text-slate-300 hover:bg-slate-700" : ""
          )}
        >
          <Eye className="h-4 w-4 mr-2" />
          {t('Ver Orden', 'View Order')}
        </Button>
        {renderActionButton()}
      </div>
    </div>
  );
}
