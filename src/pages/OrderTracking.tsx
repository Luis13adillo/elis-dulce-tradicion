/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Truck, MapPin, Clock, CheckCircle2, XCircle, Wifi, WifiOff, MessageCircle, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { formatPrice } from '@/lib/pricing';
import { toast } from 'sonner';
import OrderStatusTracker from '@/components/order/OrderStatusTracker';
import CancelOrderModal from '@/components/order/CancelOrderModal';
import { Badge } from '@/components/ui/badge';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';
import { Confetti, type ConfettiRef } from '@/components/Confetti';
import { Order } from '@/types/order';

const OrderTracking = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const confettiRef = useRef<ConfettiRef>(null);
  const previousStatusRef = useRef<string | null>(null);

  const handleSearch = async (override?: string) => {
    const searchValue = override || orderNumber;
    if (!searchValue.trim()) {
      toast.error(t('Por favor ingrese un número de orden', 'Please enter an order number'));
      return;
    }

    setLoading(true);

    try {
      // Security Fix: Fetch ONLY the specific order by number
      // Do NOT fetch all orders to filter client-side
      const foundOrder = await api.getOrderByNumber(searchValue.trim());

      if (foundOrder) {
        setOrder(foundOrder);
        previousStatusRef.current = foundOrder.status;
      } else {
        toast.error(
          t(
            'No se encontró una orden con ese número',
            'No order found with that number'
          )
        );
        setOrder(null);
      }
    } catch (error) {
      console.error('Error fetching order:', error);
      // Handle 404 specifically
      if ((error as any)?.response?.status === 404) {
        toast.error(
          t(
            'No se encontró una orden con ese número',
            'No order found with that number'
          )
        );
      } else {
        toast.error(
          t(
            'Error al buscar la orden. Por favor intente nuevamente.',
            'Error searching for order. Please try again.'
          )
        );
      }
      setOrder(null);
    } finally {
      setLoading(false);
    }

  };

  useEffect(() => {
    const param = searchParams.get('orderNumber') || searchParams.get('order');
    if (param) {
      setOrderNumber(param);
      handleSearch(param);
    }
  }, []); // mount only

  // Real-time subscription for the current order
  // Only subscribe when we have an order to track
  const { isConnected } = useRealtimeOrders({
    filterByUserId: false, // Subscribe to all orders, filter by order ID in callbacks
    onOrderUpdate: (updatedOrder, oldOrder) => {
      // Only update if it's the order we're tracking
      if (order && updatedOrder.id === order.id) {
        const oldStatus = oldOrder?.status || previousStatusRef.current;
        const newStatus = updatedOrder.status;

        // Update the order
        setOrder(updatedOrder);
        previousStatusRef.current = newStatus;

        // Show toast notification
        if (oldStatus && oldStatus !== newStatus) {
          const statusMessages: Record<string, { es: string; en: string }> = {
            confirmed: { es: 'Orden confirmada', en: 'Order confirmed' },
            in_progress: { es: 'Orden en progreso', en: 'Order in progress' },
            ready: { es: '¡Tu orden está lista!', en: 'Your order is ready!' },
            out_for_delivery: { es: 'Orden en camino', en: 'Order out for delivery' },
            delivered: { es: 'Orden entregada', en: 'Order delivered' },
            completed: { es: 'Orden completada', en: 'Order completed' },
            cancelled: { es: 'Orden cancelada', en: 'Order cancelled' },
          };

          const message = statusMessages[newStatus];
          if (message) {
            toast.success(t(message.es, message.en), {
              description: t(`Estado actualizado a: ${newStatus}`, `Status updated to: ${newStatus}`),
            });
          }

          // Confetti when order is ready
          if (newStatus === 'ready' && oldStatus !== 'ready') {
            confettiRef.current?.fire({
              particleCount: 150,
              spread: 70,
              origin: { y: 0.6 },
            });
          }
        }
      }
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-32 pb-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <div className="mb-12 text-center">
              <h1 className="mb-4 font-display text-4xl font-bold text-gradient-gold md:text-5xl">
                {t('Rastrear Pedido', 'Track Order')}
              </h1>
              <div className="mx-auto mb-6 h-1 w-24 rounded-full bg-gradient-to-r from-primary to-accent" />
              <p className="font-sans text-lg text-muted-foreground">
                {t(
                  'Ingrese su número de orden para ver el estado de su pedido',
                  'Enter your order number to view your order status'
                )}
              </p>
            </div>

            <Card className="mb-8">
              <CardHeader>
                <CardTitle>{t('Buscar Orden', 'Search Order')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label htmlFor="orderNumber">{t('Número de Orden', 'Order Number')}</Label>
                    <Input
                      id="orderNumber"
                      type="text"
                      placeholder={t('Ej: ORD-20241115-000001', 'E.g: ORD-20241115-000001')}
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => handleSearch()}
                      disabled={loading}
                      className="bg-primary text-secondary"
                    >
                      {loading ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
                      ) : (
                        <>
                          <Search className="mr-2 h-4 w-4" />
                          {t('Buscar', 'Search')}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {order && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('Detalles de la Orden', 'Order Details')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-semibold text-muted-foreground">
                          {t('Número de Orden', 'Order Number')}
                        </p>
                        <p className="font-mono font-bold">{order.order_number}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-muted-foreground">
                          {t('Cliente', 'Customer')}
                        </p>
                        <p className="font-semibold">{order.customer_name}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-muted-foreground">
                          {t('Fecha Necesaria', 'Date Needed')}
                        </p>
                        <p>{order.date_needed} {order.time_needed}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-muted-foreground">
                          {t('Total', 'Total')}
                        </p>
                        <p className="font-display text-xl font-bold text-primary">
                          ${Number(order.total_amount)?.toFixed(2) || '0.00'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('Estado del Pedido', 'Order Status')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <OrderStatusTracker
                      status={order.status}
                      deliveryOption={order.delivery_option}
                      estimatedTime={order.estimated_delivery_time}
                      deliveryAddress={order.delivery_address}
                    />
                  </CardContent>
                </Card>

                {/* On the Way Card */}
                {order.status === 'out_for_delivery' && (
                  <Card className="border-blue-200 bg-blue-50">
                    <CardContent className="pt-6 flex items-center gap-3">
                      <Truck className="h-8 w-8 text-blue-600" />
                      <div>
                        <h3 className="font-bold">{t('¡Tu orden va en camino!', 'Your order is on the way!')}</h3>
                        {order.estimated_delivery_time && (
                          <p className="text-sm">{t('Llega alrededor de', 'Arriving around')}: {new Date(order.estimated_delivery_time).toLocaleTimeString()}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Delivery Status Card */}
                {order.delivery_option === 'delivery' && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Truck className="h-5 w-5" />
                        {t('Estado de Entrega', 'Delivery Status')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {t('Estado', 'Status')}:
                        </span>
                        <Badge
                          variant={
                            order.delivery_status === 'delivered' ? 'default' :
                              order.delivery_status === 'in_transit' ? 'default' :
                                order.delivery_status === 'assigned' ? 'secondary' :
                                  'outline'
                          }
                        >
                          {order.delivery_status === 'pending' && t('Pendiente', 'Pending')}
                          {order.delivery_status === 'assigned' && t('Asignado', 'Assigned')}
                          {order.delivery_status === 'in_transit' && t('En Camino', 'In Transit')}
                          {order.delivery_status === 'delivered' && (
                            <>
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              {t('Entregado', 'Delivered')}
                            </>
                          )}
                          {order.delivery_status === 'failed' && t('Fallido', 'Failed')}
                        </Badge>
                      </div>

                      {order.delivery_address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-muted-foreground">
                              {t('Dirección de Entrega', 'Delivery Address')}:
                            </p>
                            <p className="text-sm">{order.delivery_address}</p>
                            {order.delivery_apartment && (
                              <p className="text-sm text-muted-foreground">
                                {t('Apto/Unidad', 'Apt/Unit')}: {order.delivery_apartment}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {order.delivery_zone && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {t('Zona', 'Zone')}:
                          </span>
                          <Badge variant="outline">{order.delivery_zone}</Badge>
                        </div>
                      )}

                      {order.estimated_delivery_time && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-semibold text-muted-foreground">
                              {t('Tiempo Estimado de Entrega', 'Estimated Delivery Time')}:
                            </p>
                            <p className="text-sm">
                              {new Date(order.estimated_delivery_time).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      )}

                      {order.driver_notes && (
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                            {t('Notas del Conductor', 'Driver Notes')}:
                          </p>
                          <p className="text-sm">{order.driver_notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Help with Order Button */}
                {order.status !== 'cancelled' && (
                  <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div>
                          <h3 className="font-semibold mb-1">
                            {t('¿Necesitas ayuda con esta orden?', 'Need help with this order?')}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {t(
                              'Reporta un problema o contáctanos directamente',
                              'Report an issue or contact us directly'
                            )}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => navigate(`/contact?orderNumber=${order.order_number}&subject=Order Issue`)}
                          >
                            <MessageCircle className="mr-2 h-4 w-4" />
                            {t('Obtener Ayuda', 'Get Help')}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => navigate(`/order-issue?orderNumber=${order.order_number}`)}
                          >
                            <AlertCircle className="mr-2 h-4 w-4" />
                            {t('Reportar Problema', 'Report Issue')}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Cancel Order Button */}
                {order.status !== 'cancelled' &&
                  order.status !== 'completed' &&
                  (user?.id === order.user_id || user?.profile?.role === 'owner' || user?.profile?.role === 'baker') && (
                    <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950">
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold mb-1">
                              {t('¿Necesita cancelar esta orden?', 'Need to cancel this order?')}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {t(
                                'Se aplicará la política de reembolso correspondiente',
                                'The applicable refund policy will be applied'
                              )}
                            </p>
                          </div>
                          <Button
                            variant="destructive"
                            onClick={() => setShowCancelModal(true)}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            {t('Cancelar Orden', 'Cancel Order')}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                {/* Cancellation Info */}
                {order.status === 'cancelled' && (
                  <Card className="border-red-200 bg-red-50 dark:bg-red-950">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-red-800 dark:text-red-200">
                        <XCircle className="h-5 w-5" />
                        {t('Orden Cancelada', 'Order Cancelled')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {order.cancelled_at && (
                        <p className="text-sm">
                          <span className="font-semibold">{t('Cancelada el', 'Cancelled on')}:</span>{' '}
                          {new Date(order.cancelled_at).toLocaleString()}
                        </p>
                      )}
                      {order.cancellation_reason && (
                        <p className="text-sm">
                          <span className="font-semibold">{t('Motivo', 'Reason')}:</span>{' '}
                          {order.cancellation_reason}
                        </p>
                      )}
                      {order.refund_amount && order.refund_amount > 0 && (
                        <p className="text-sm">
                          <span className="font-semibold">{t('Reembolso', 'Refund')}:</span>{' '}
                          <span className="font-bold text-green-600">
                            {formatPrice(order.refund_amount)}
                          </span>
                          {order.refund_status && (
                            <Badge className="ml-2" variant={
                              order.refund_status === 'processed' ? 'default' :
                                order.refund_status === 'pending' ? 'secondary' :
                                  'destructive'
                            }>
                              {order.refund_status === 'processed' && t('Procesado', 'Processed')}
                              {order.refund_status === 'pending' && t('Pendiente', 'Pending')}
                              {order.refund_status === 'failed' && t('Fallido', 'Failed')}
                            </Badge>
                          )}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {order && (
        <CancelOrderModal
          order={order}
          open={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          onSuccess={() => {
            handleSearch(); // Refresh order data
            setShowCancelModal(false);
          }}
          isAdmin={user?.profile?.role === 'owner' || user?.profile?.role === 'baker'}
        />
      )}

      <Confetti ref={confettiRef} />
      <Footer />
    </div>
  );
};

export default OrderTracking;

