/**
 * Order Status Flow Component
 * Visualizes order status progression and available transitions
 */

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { OrderStatus } from '@/types/orderState';
import { formatDate, formatTime } from '@/lib/i18n-utils';
import { cn } from '@/lib/utils';

interface OrderStatusFlowProps {
  orderId: number;
  currentStatus: OrderStatus;
  onStatusChange?: (newStatus: OrderStatus) => void;
  showHistory?: boolean;
  userRole?: 'customer' | 'baker' | 'owner' | 'admin';
}

interface StatusStep {
  status: OrderStatus;
  label: string;
  icon: React.ReactNode;
  color: string;
  completed: boolean;
  current: boolean;
  available: boolean;
}

export const OrderStatusFlow = ({
  orderId,
  currentStatus,
  onStatusChange,
  showHistory = true,
  userRole = 'customer',
}: OrderStatusFlowProps) => {
  const { t, language } = useLanguage();
  const [availableTransitions, setAvailableTransitions] = useState<OrderStatus[]>([]);
  const [transitionHistory, setTransitionHistory] = useState<any[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [loading, setLoading] = useState(true);

  // Status definitions
  const statusSteps: OrderStatus[] = [
    'pending',
    'confirmed',
    'in_progress',
    'ready',
    'completed',
  ];

  const statusLabels: Record<OrderStatus, { es: string; en: string }> = {
    pending: { es: 'Pendiente', en: 'Pending' },
    confirmed: { es: 'Confirmado', en: 'Confirmed' },
    in_progress: { es: 'En Proceso', en: 'In Progress' },
    ready: { es: 'Listo', en: 'Ready' },
    // PLACEHOLDER labels: reword
    out_for_delivery: { es: 'out_for_delivery', en: 'out_for_delivery' },
    delivered: { es: 'delivered', en: 'delivered' },
    completed: { es: 'Completado', en: 'Completed' },
    cancelled: { es: 'Cancelado', en: 'Cancelled' },
  };

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5" />;
      case 'ready':
        return <CheckCircle2 className="h-5 w-5" />;
      default:
        return <Clock className="h-5 w-5" />;
    }
  };

  const getStatusColor = (status: OrderStatus, isActive: boolean) => {
    if (status === 'cancelled') return 'text-red-600 bg-red-50 border-red-200';
    if (status === 'completed') return 'text-green-600 bg-green-50 border-green-200';
    if (isActive) return 'text-primary bg-primary/10 border-primary';
    return 'text-muted-foreground bg-muted border-border';
  };

  useEffect(() => {
    loadAvailableTransitions();
    if (showHistory) {
      loadTransitionHistory();
    }
  }, [orderId, currentStatus]);

  const loadAvailableTransitions = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/v1/orders/${orderId}/available-transitions`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('supabase.auth.token')}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setAvailableTransitions(data.availableTransitions || []);
      }
    } catch (error) {
      console.error('Error loading available transitions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTransitionHistory = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/v1/orders/${orderId}/transition-history`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('supabase.auth.token')}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setTransitionHistory(data || []);
      }
    } catch (error) {
      console.error('Error loading transition history:', error);
    }
  };

  const handleTransition = async (targetStatus: OrderStatus) => {
    if (isTransitioning) return;

    setIsTransitioning(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/v1/orders/${orderId}/transition`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('supabase.auth.token')}`,
          },
          body: JSON.stringify({
            targetStatus,
            reason: targetStatus === 'cancelled' ? 'User requested cancellation' : undefined,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Transition failed');
      }

      const data = await response.json();
      toast.success(
        t(
          `Estado actualizado a ${statusLabels[targetStatus].es}`,
          `Status updated to ${statusLabels[targetStatus].en}`
        )
      );
      
      onStatusChange?.(targetStatus);
      await loadAvailableTransitions();
      if (showHistory) {
        await loadTransitionHistory();
      }
    } catch (error: any) {
      toast.error(
        t(
          'Error al actualizar el estado',
          'Error updating status'
        ) + ': ' + error.message
      );
    } finally {
      setIsTransitioning(false);
    }
  };

  const currentIndex = statusSteps.indexOf(currentStatus);
  const isCancelled = currentStatus === 'cancelled';

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Flow */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t('Estado de la Orden', 'Order Status')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isCancelled ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
              <XCircle className="h-6 w-6 text-red-600" />
              <div>
                <p className="font-semibold text-red-900">
                  {t('Orden Cancelada', 'Order Cancelled')}
                </p>
                <p className="text-sm text-red-700">
                  {t('Esta orden ha sido cancelada', 'This order has been cancelled')}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Progress Steps */}
              <div className="flex items-center justify-between">
                {statusSteps.map((status, index) => {
                  const isCompleted = index < currentIndex;
                  const isCurrent = index === currentIndex;
                  const isAvailable = availableTransitions.includes(status);

                  return (
                    <div key={status} className="flex-1 flex flex-col items-center">
                      <div
                        className={cn(
                          'w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all',
                          getStatusColor(status, isCurrent),
                          isCompleted && 'bg-green-50 border-green-200 text-green-600'
                        )}
                      >
                        {getStatusIcon(status)}
                      </div>
                      <p className="mt-2 text-xs font-medium text-center">
                        {t(statusLabels[status].es, statusLabels[status].en)}
                      </p>
                      {isCurrent && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          {t('Actual', 'Current')}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Available Actions */}
              {availableTransitions.length > 0 && userRole !== 'customer' && (
                <div className="mt-6 pt-6 border-t">
                  <p className="text-sm font-semibold mb-3">
                    {t('Acciones Disponibles', 'Available Actions')}:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableTransitions.map((status) => (
                      <Button
                        key={status}
                        variant={status === 'cancelled' ? 'destructive' : 'default'}
                        size="sm"
                        onClick={() => handleTransition(status)}
                        disabled={isTransitioning}
                        className="min-h-[44px]"
                      >
                        {isTransitioning ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        {t(statusLabels[status].es, statusLabels[status].en)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transition History */}
      {showHistory && transitionHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t('Historial de Estados', 'Status History')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {transitionHistory.map((entry, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          getStatusColor(entry.status as OrderStatus, false)
                        )}
                      >
                        {t(
                          statusLabels[entry.status as OrderStatus].es,
                          statusLabels[entry.status as OrderStatus].en
                        )}
                      </Badge>
                      {entry.previous_status && (
                        <>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-sm text-muted-foreground">
                            {t(
                              statusLabels[entry.previous_status as OrderStatus].es,
                              statusLabels[entry.previous_status as OrderStatus].en
                            )}
                          </span>
                        </>
                      )}
                    </div>
                    {entry.notes && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {entry.notes}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(entry.created_at, undefined, language)}{' '}
                      {formatTime(new Date(entry.created_at).toISOString().split('T')[1], language)}
                      {entry.user_email && ` • ${entry.user_email}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
