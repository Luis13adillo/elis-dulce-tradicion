/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock, MapPin, Phone, Mail, Calendar, Package, UserPlus, Share2, CalendarPlus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useShare } from '@/hooks/useShare';
import { useAddToCalendar } from '@/hooks/useAddToCalendar';
import { useIsMobile } from '@/hooks/use-mobile';

const OrderConfirmation = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { shareOrder } = useShare();
  const { addOrderToCalendar } = useAddToCalendar();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Tier A: pendingId from URL is the primary identifier. Legacy params
  // (paymentId, orderNumber) are still accepted so in-flight sessions from
  // the old bundle continue to work.
  const pendingId = searchParams.get('pendingId');
  const paymentId = searchParams.get('paymentId') || searchParams.get('payment_intent');
  const orderNumberParam = searchParams.get('orderNumber');

  const [verifyState, setVerifyState] = useState<'verifying' | 'verified' | 'failed' | 'timeout'>('verifying');
  const [failureMessage, setFailureMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    const loadOrder = async () => {
      // --- Tier A flow: poll verify-payment until the webhook promotes ---
      if (pendingId) {
        const deadline = Date.now() + 15000; // 15s covers typical webhook latency
        try {
          while (!cancelled && Date.now() < deadline) {
            const result = await api.verifyPaymentByPending(pendingId);
            if (cancelled) return;

            if (result.verified && result.order) {
              setOrder(result.order);
              setVerifyState('verified');
              sessionStorage.removeItem('pendingOrderRef');
              setLoading(false);
              return;
            }
            if (result.status === 'payment_failed') {
              setFailureMessage(result.error_message || null);
              setVerifyState('failed');
              setLoading(false);
              return;
            }
            // 'awaiting_payment' | 'webhook_pending' | 'succeeded' (no row yet)
            await delay(1500);
          }
          if (!cancelled) {
            // Payment may have succeeded but the webhook hasn't landed in
            // time. Tell the truth — never show a fake success.
            setVerifyState('timeout');
            setLoading(false);
          }
        } catch (err) {
          console.error('verify-payment error:', err);
          if (!cancelled) {
            setVerifyState('timeout');
            setLoading(false);
          }
        }
        return;
      }

      // --- Legacy paths (pre-Tier-A links still in flight) ---
      try {
        if (paymentId) {
          const verifyResponse = await api.verifyPayment(paymentId);
          if (verifyResponse.verified && verifyResponse.orderNumber) {
            const fullOrder = await api.getOrderByNumber(verifyResponse.orderNumber);
            if (fullOrder) {
              setOrder(fullOrder);
              setVerifyState('verified');
              setLoading(false);
              return;
            }
          }
        }
        if (orderNumberParam) {
          const fullOrder = await api.getOrderByNumber(orderNumberParam);
          if (fullOrder) {
            setOrder(fullOrder);
            setVerifyState('verified');
            setLoading(false);
            return;
          }
        }
        toast.error(t('No se encontró información de la orden.', 'Order information not found.'));
        navigate('/order');
      } catch (err) {
        console.error('Legacy order load error:', err);
        setVerifyState('timeout');
        setLoading(false);
      }
    };

    loadOrder();
    return () => { cancelled = true; };
  }, [pendingId, paymentId, orderNumberParam, navigate, t]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white selection:bg-[#C6A649]/30">
        <Navbar />
        <main className="pt-40 pb-24 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#C6A649]/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="container mx-auto px-4 relative z-10">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[#C6A649] border-t-transparent mx-auto" />
              <p className="text-gray-400">
                {t('Cargando confirmación...', 'Loading confirmation...')}
              </p>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Payment failed path — clear, actionable, bilingual. Customer can retry
  // without re-entering the wizard (pending_order persists for 24h).
  if (verifyState === 'failed') {
    return (
      <div className="min-h-screen bg-black text-white selection:bg-[#C6A649]/30">
        <Navbar />
        <main className="pt-40 pb-24 relative overflow-hidden">
          <div className="container mx-auto px-4 relative z-10">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mb-6 flex justify-center">
                <div className="rounded-full bg-red-500/10 p-4 border border-red-500/30">
                  <Clock className="h-12 w-12 text-red-400" />
                </div>
              </div>
              <h1 className="mb-4 font-display text-4xl font-bold text-white">
                {t('Pago no completado', 'Payment not completed')}
              </h1>
              <p className="text-gray-400 mb-6">
                {t(
                  'Tu tarjeta fue rechazada por el banco. Tu orden aún está guardada — intenta con otra tarjeta.',
                  'Your card was declined by your bank. Your order is still saved — try again with another card.'
                )}
              </p>
              {failureMessage && (
                <p className="text-sm text-red-300 mb-6 italic">{failureMessage}</p>
              )}
              <div className="flex gap-3 justify-center">
                {pendingId && (
                  <Button
                    onClick={() => navigate(`/payment-checkout?pendingId=${pendingId}`)}
                    className="bg-[#C6A649] hover:bg-[#B59539] text-black font-semibold"
                  >
                    {t('Reintentar Pago', 'Retry Payment')}
                  </Button>
                )}
                <Button onClick={() => navigate('/')} variant="outline" className="border-white/20 text-white">
                  {t('Volver al Inicio', 'Back to Home')}
                </Button>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Timeout path — payment may have gone through; the webhook is slow.
  // Never fake a green checkmark. Tell the truth.
  if (verifyState === 'timeout' || !order) {
    return (
      <div className="min-h-screen bg-black text-white selection:bg-[#C6A649]/30">
        <Navbar />
        <main className="pt-40 pb-24 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#C6A649]/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="container mx-auto px-4 relative z-10">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-gray-200 text-lg mb-3">
                {t(
                  'Estamos confirmando tu pago...',
                  'We\'re still confirming your payment...'
                )}
              </p>
              <p className="text-gray-400 text-sm mb-6">
                {t(
                  'Si tu tarjeta fue cobrada, recibirás un correo de confirmación en unos minutos. Puedes cerrar esta pestaña; tu orden está a salvo.',
                  'If your card was charged, you\'ll receive a confirmation email in a few minutes. You can close this tab — your order is safe.'
                )}
              </p>
              <p className="text-gray-500 text-xs mb-6">
                {t(
                  '¿No recibiste tu confirmación? Contáctanos:',
                  'Didn\'t receive your confirmation? Contact us:'
                )}{' '}
                orders@elisbakery.com · (610) 279-6200
              </p>
              <Button
                onClick={() => navigate('/')}
                className="bg-[#C6A649] hover:bg-[#B59539] text-black font-semibold"
              >
                {t('Volver al Inicio', 'Back to Home')}
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#C6A649]/30">
      <Navbar />

      <main className="pt-40 pb-24 relative overflow-hidden">
        {/* Background Glows */}
        <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-[#C6A649]/10 rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-0 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-2xl">
            {/* Success Header */}
            <div className="mb-12 text-center">
              <div className="mb-6 flex justify-center">
                <div className="rounded-full bg-[#C6A649]/20 p-4 border border-[#C6A649]/30 backdrop-blur-xl animate-pulse">
                  <CheckCircle2 className="h-12 w-12 text-[#C6A649]" />
                </div>
              </div>
              <h1 className="mb-4 font-display text-5xl font-bold text-gradient-gold">
                {t('¡Orden Confirmada!', 'Order Confirmed!')}
              </h1>
              <p className="text-lg text-gray-400">
                {t(
                  'Gracias por tu pedido. Te hemos enviado un email de confirmación.',
                  "Thank you for your order. We've sent you a confirmation email."
                )}
              </p>
            </div>

            {/* Order Details Card */}
            <div className="mb-8 rounded-[2.5rem] border border-white/10 bg-white/5 p-8 backdrop-blur-3xl shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#C6A649]/10 blur-3xl rounded-full -mr-16 -mt-16 transition-opacity group-hover:opacity-100 opacity-50" />

              <div className="mb-8 border-b border-white/10 pb-6 relative z-10">
                <h2 className="mb-2 font-display text-3xl font-bold">
                  {t('Detalles de la Orden', 'Order Details')}
                </h2>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#C6A649]" />
                  <p className="font-mono text-sm text-gray-400 uppercase tracking-widest">
                    {t('Número de Orden', 'Order Number')}: {order.order_number || 'Pending...'}
                  </p>
                </div>
              </div>

              <div className="space-y-4 relative z-10">
                {/* Customer Info */}
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 transition-colors hover:bg-white/10">
                    <Package className="mt-1 h-5 w-5 text-[#C6A649]" />
                    <div>
                      <p className="text-sm font-semibold text-gray-300">{t('Cliente', 'Customer')}</p>
                      <p className="text-white">{order.customer_name}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 transition-colors hover:bg-white/10">
                    <Phone className="mt-1 h-5 w-5 text-[#C6A649]" />
                    <div>
                      <p className="text-sm font-semibold text-gray-300">{t('Teléfono', 'Phone')}</p>
                      <p className="text-white">{order.customer_phone}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 transition-colors hover:bg-white/10">
                    <Mail className="mt-1 h-5 w-5 text-[#C6A649]" />
                    <div>
                      <p className="text-sm font-semibold text-gray-300">{t('Email', 'Email')}</p>
                      <p className="text-white">{order.customer_email}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 transition-colors hover:bg-white/10">
                    <Calendar className="mt-1 h-5 w-5 text-[#C6A649]" />
                    <div>
                      <p className="text-sm font-semibold text-gray-300">{t('Fecha y Hora', 'Date & Time')}</p>
                      <p className="text-white">
                        {order.date_needed} {order.time_needed}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Cake Details */}
                <div className="mt-8 border-t border-white/10 pt-6">
                  <h3 className="mb-6 font-display text-2xl font-bold">
                    {t('Detalles del Pastel', 'Cake Details')}
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                      <p className="text-sm font-semibold text-gray-400 mb-1">{t('Tamaño', 'Size')}</p>
                      <p className="text-white font-medium">{order.cake_size}</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                      <p className="text-sm font-semibold text-gray-400 mb-1">{t('Relleno', 'Filling')}</p>
                      <p className="text-white font-medium">{order.filling}</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                      <p className="text-sm font-semibold text-gray-400 mb-1">{t('Tema', 'Theme')}</p>
                      <p className="text-white font-medium">{order.theme}</p>
                    </div>
                    {order.dedication && (
                      <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                        <p className="text-sm font-semibold text-gray-400 mb-1">{t('Dedicatoria', 'Dedication')}</p>
                        <p className="text-white font-medium italic">"{order.dedication}"</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Delivery Info */}
                <div className="mt-8 border-t border-white/10 pt-6">
                  <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5">
                    <MapPin className="mt-1 h-5 w-5 text-[#C6A649]" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-300">
                        {t('Método de Entrega', 'Delivery Method')}
                      </p>
                      <p className="text-white">
                        {order.delivery_option === 'delivery'
                          ? t('Entrega a Domicilio', 'Delivery')
                          : t('Recoger en Tienda', 'Pickup')}
                      </p>
                      {order.delivery_option === 'delivery' && order.delivery_address && (
                        <p className="mt-1 text-sm text-gray-400">
                          {order.delivery_address}
                          {order.delivery_apartment && `, ${order.delivery_apartment}`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Payment Info */}
                <div className="mt-8 border-t border-white/10 pt-6">
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold text-gray-300">{t('Total Pagado', 'Total Paid')}</p>
                    <p className="font-display text-4xl font-bold text-[#C6A649]">
                      ${order.total_amount?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-center gap-2 py-2 px-4 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="font-medium">{t('Pago Confirmado', 'Payment Confirmed')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Status Info */}
            <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl relative z-10">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-[#C6A649]/10 flex items-center justify-center border border-[#C6A649]/20">
                  <Clock className="h-5 w-5 text-[#C6A649]" />
                </div>
                <div>
                  <p className="font-semibold text-white">
                    {t('Estado de la Orden', 'Order Status')}
                  </p>
                  <p className="text-sm text-gray-400">
                    {t(
                      'Tu orden ha sido recibida y está siendo procesada. Recibirás una notificación cuando esté lista.',
                      'Your order has been received and is being processed. You will receive a notification when it\'s ready.'
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-4 sm:flex-row relative z-10">
              <Button
                onClick={() => navigate(`/order-tracking?orderNumber=${order.order_number}`)}
                className="flex-1 min-h-[50px] rounded-full bg-[#C6A649] hover:bg-[#B59539] text-black font-bold"
              >
                <Search className="mr-2 h-4 w-4" />
                {t('Rastrear Orden', 'Track My Order')}
              </Button>
              <Button
                onClick={() => navigate('/')}
                variant="outline"
                className="flex-1 min-h-[50px] rounded-full border-white/20 hover:bg-white/10 text-white transition-all duration-300"
              >
                {t('Volver al Inicio', 'Back to Home')}
              </Button>
              <Button
                onClick={() => navigate('/order')}
                className="flex-1 min-h-[50px] rounded-full bg-[#C6A649] hover:bg-[#B59539] text-black font-bold shadow-lg shadow-[#C6A649]/20 transition-all duration-300 transform hover:scale-[1.02]"
              >
                {t('Hacer Otro Pedido', 'Place Another Order')}
              </Button>
            </div>

            {/* Mobile Actions: Share & Calendar */}
            {isMobile && order && (
              <div className="mt-6 flex gap-4 relative z-10">
                <Button
                  onClick={async () => {
                    const trackingUrl = `${window.location.origin}/order-tracking?orderNumber=${order.order_number}`;
                    const result = await shareOrder(order.order_number, trackingUrl);
                    if (result.success) {
                      toast.success(t('Orden compartida', 'Order shared'));
                    }
                  }}
                  variant="outline"
                  className="flex-1 min-h-[50px] rounded-full border-white/20 hover:bg-white/10 text-white transition-all"
                >
                  <Share2 className="mr-2 h-4 w-4 text-[#C6A649]" />
                  {t('Compartir', 'Share')}
                </Button>
                <Button
                  onClick={() => {
                    if (order.date_needed && order.time_needed) {
                      addOrderToCalendar(
                        order.order_number,
                        new Date(order.date_needed),
                        order.time_needed,
                        order.delivery_option === 'pickup'
                          ? "324 W Marshall St, Norristown, PA 19401"
                          : order.delivery_address
                      );
                      toast.success(t('Añadido al calendario', 'Added to calendar'));
                    }
                  }}
                  variant="outline"
                  className="flex-1 min-h-[50px] rounded-full border-white/20 hover:bg-white/10 text-white transition-all"
                >
                  <CalendarPlus className="mr-2 h-4 w-4 text-[#C6A649]" />
                  {t('Calendario', 'Calendar')}
                </Button>
              </div>
            )}

            {/* Guest Checkout - Offer Account Creation */}
            {!user && order && (
              <Card className="mt-12 border-white/10 bg-[#C6A649]/5 backdrop-blur-2xl rounded-[2rem] overflow-hidden relative z-10 transition-all hover:bg-[#C6A649]/10">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <UserPlus className="h-6 w-6 text-[#C6A649]" />
                    {t('Crea una Cuenta', 'Create an Account')}
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    {t(
                      'Crea una cuenta para ver tu historial de pedidos, guardar direcciones y más',
                      'Create an account to view your order history, save addresses, and more'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <p className="text-sm text-gray-300">
                      {t('Email de la orden', 'Order email')}: <span className="text-white font-medium">{order.customer_email}</span>
                    </p>
                    <div className="flex gap-4">
                      <Button asChild className="flex-1 min-h-[50px] rounded-full bg-[#C6A649] hover:bg-[#B59539] text-black font-bold">
                        <Link to={`/signup?email=${encodeURIComponent(order.customer_email)}`}>
                          {t('Crear Cuenta', 'Create Account')}
                        </Link>
                      </Button>
                      <Button variant="outline" onClick={() => navigate('/')} className="flex-1 min-h-[50px] rounded-full border-white/20 hover:bg-white/10 text-white">
                        {t('Más Tarde', 'Later')}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default OrderConfirmation;

