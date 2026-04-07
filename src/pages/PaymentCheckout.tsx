/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  CreditCard,
  Loader2,
  AlertCircle,
  Truck,
  Home,
  Image as ImageIcon
} from 'lucide-react';

// Stripe Imports
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { StripeCheckoutForm } from '@/components/payment/StripeCheckoutForm';

// Initialize Stripe outside component
const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
if (!stripeKey) {
  console.error('Missing VITE_STRIPE_PUBLISHABLE_KEY environment variable');
}
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

interface PendingPayment {
  orderData: any;
  totalAmount: number;
  basePrice: number;
  deliveryFee: number;
  tax: number;
}

const PaymentCheckout = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [error, setError] = useState<string | null>(null);
  const paymentIntentRequested = useRef(false);

  // Load pending payment from sessionStorage or URL params
  useEffect(() => {
    const stored = sessionStorage.getItem('pendingOrder');
    const orderNumber = searchParams.get('orderNumber');

    if (!stored && !orderNumber) {
      toast.error(t('No se encontró orden.', 'No order found.'));
      navigate('/order');
      return;
    }

    try {
      if (stored) {
        const orderData = JSON.parse(stored);
        const deliveryFee = orderData.delivery_option === 'delivery' ? 15 : 0;
        const totalAmount = parseFloat(orderData.total_amount);
        const basePrice = totalAmount - deliveryFee;
        const tax = 0;

        setPendingPayment({
          orderData,
          totalAmount,
          basePrice,
          deliveryFee,
          tax,
        });

        // Initialize Payment Intent once (ref prevents duplicate calls from StrictMode)
        if (!paymentIntentRequested.current) {
          paymentIntentRequested.current = true;
          api.createPaymentIntent(totalAmount, {
            order_number: orderData.order_number,
            customer_name: orderData.customer_name
          })
            .then(data => setClientSecret(data.clientSecret))
            .catch(err => {
              console.error("Payment Init Error:", err);
              paymentIntentRequested.current = false; // Allow retry on error
              const msg = err.message || JSON.stringify(err) || 'Failed to initialize payment';
              setError(`Payment System Error: ${msg}`);
              toast.error('Payment initialization failed: ' + msg);
            });
        }
      }
    } catch (error) {
      console.error('Failed to parse pending payment', error);
      navigate('/order');
    }
  }, [navigate, t, searchParams]);

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    if (!pendingPayment) return;

    try {
      // Create the actual order in Supabase now that payment is confirmed
      const orderPayload = {
        ...pendingPayment.orderData,
        payment_status: 'paid',
        stripe_payment_id: paymentIntentId,
        status: 'pending' // New orders start as pending
      };

      const result = await api.createOrder(orderPayload);

      if (result.success) {
        // Fire confirmation email non-blocking with 3-attempt retry
        const fireConfirmationEmail = async (attempt = 1) => {
          try {
            await api.sendOrderConfirmation(result.order);
          } catch (err) {
            if (attempt < 3) setTimeout(() => fireConfirmationEmail(attempt + 1), 2000 * attempt);
          }
        };
        fireConfirmationEmail();
        sessionStorage.removeItem('pendingOrder');
        navigate(`/order-confirmation?paymentId=${paymentIntentId}&orderNumber=${result.order.order_number}`);
      } else {
        toast.error('Payment succeeded but order creation failed. Please contact support.');
      }
    } catch (err) {
      console.error("Post-payment error", err);
      toast.error('Critical error creating order record.');
    }
  };


if (!pendingPayment) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <Loader2 className="h-12 w-12 animate-spin text-[#C6A649]" />
    </div>
  );
}

const { orderData, totalAmount, basePrice, deliveryFee } = pendingPayment;

return (
  <div className="min-h-screen bg-black text-white selection:bg-[#C6A649]/30">
    <Navbar />

    <main className="pt-40 pb-24 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-[#C6A649]/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-0 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <span className="inline-block px-4 py-1 rounded-full border border-[#C6A649]/30 bg-[#C6A649]/10 text-[#C6A649] text-xs font-black tracking-[0.2em] uppercase mb-6 shadow-[0_0_20px_rgba(198,166,73,0.1)]">
              {t('Seguridad Garantizada', 'Secured Checkout')}
            </span>
            <h1 className="font-display text-5xl md:text-6xl font-black text-white uppercase tracking-tighter mb-4">
              {t('Finalizar', 'Complete')} <span className="text-[#C6A649]">{t('Pedido', 'Order')}</span>
            </h1>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-8 bg-red-500/10 border-red-500/30 text-red-200 rounded-2xl">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <AlertDescription className="font-bold uppercase tracking-wide text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-12 lg:grid-cols-5">
            {/* Payment Section */}
            <div className="lg:col-span-3 space-y-8">
              <Card className="border-white/10 bg-white/5 backdrop-blur-2xl rounded-[2.5rem] overflow-hidden shadow-2xl">
                <CardHeader className="border-b border-white/5 pb-8">
                  <CardTitle className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                    <CreditCard className="text-[#C6A649] h-6 w-6" />
                    {t('Método de Pago', 'Payment Method')}
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    {t('Introduzca los datos de su tarjeta', 'Enter your secure card details')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-8 space-y-8 px-8 md:px-12 pb-12">

                  {/* STRIPE ELEMENTS */}
                  {!stripePromise ? (
                    <div className="p-4 text-sm text-red-400 bg-red-500/10 rounded-lg border border-red-500/20 text-center">
                      {t('Error de configuración de pago. Contacte soporte.', 'Payment configuration error. Please contact support.')}
                    </div>
                  ) : clientSecret ? (
                    <Elements stripe={stripePromise} options={{
                      clientSecret,
                      appearance: {
                        theme: 'night',
                        variables: {
                          colorPrimary: '#C6A649',
                          colorBackground: '#1a1a1a',
                          colorText: '#ffffff',
                          colorDanger: '#ef4444',
                          fontFamily: 'Inter, system-ui, sans-serif',
                          borderRadius: '12px',
                        }
                      }
                    }}>
                      <StripeCheckoutForm
                        amount={totalAmount}
                        onSuccess={handlePaymentSuccess}
                      />
                    </Elements>
                  ) : (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-[#C6A649]" />
                      <span className="ml-3 text-gray-400">{t('Inicializando pago seguro...', 'Initializing secure payment...')}</span>
                    </div>
                  )}

                </CardContent>
              </Card>
            </div>

            {/* Summary Side */}
            <div className="lg:col-span-2 space-y-8">
              <Card className="border-white/10 bg-white/5 backdrop-blur-xl rounded-[2.5rem] overflow-hidden shadow-2xl sticky top-40">
                <CardHeader className="border-b border-white/5 pb-6">
                  <CardTitle className="text-xl font-black text-white uppercase tracking-tight">{t('Tu Orden', 'Your Order')}</CardTitle>
                </CardHeader>
                <CardContent className="pt-8 space-y-8 px-8 pb-10">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-[#C6A649]/10 flex items-center justify-center text-[#C6A649] font-black">
                        {orderData.customer_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-white font-black uppercase text-sm tracking-tight">{orderData.customer_name}</p>
                        <p className="text-gray-500 text-xs font-bold">{orderData.customer_phone}</p>
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-2xl p-6 space-y-4 border border-white/5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 font-black uppercase tracking-widest">{t('Fecha', 'Delivery Date')}</span>
                        <span className="text-white font-bold">{orderData.date_needed} @ {orderData.time_needed}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 font-black uppercase tracking-widest">{t('Tamaño', 'Cake Size')}</span>
                        <span className="text-white font-bold">{orderData.cake_size}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 font-black uppercase tracking-widest">{t('Relleno', 'Filling')}</span>
                        <span className="text-white font-bold">{orderData.filling}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 font-black uppercase tracking-widest">{t('Método', 'Method')}</span>
                        <span className="text-[#C6A649] font-black uppercase flex items-center gap-2">
                          {orderData.delivery_option === 'delivery' ? <Truck size={14} /> : <Home size={14} />}
                          {orderData.delivery_option === 'delivery' ? t('Envío', 'Delivery') : t('Recogida', 'Pickup')}
                        </span>
                      </div>
                    </div>

                    {/* Reference Image */}
                    {orderData.reference_image_path && (
                      <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                        <p className="text-gray-500 font-black uppercase tracking-widest text-xs mb-3 flex items-center gap-2">
                          <ImageIcon size={12} />
                          {t('Imagen de Referencia', 'Reference Image')}
                        </p>
                        <div className="relative rounded-xl overflow-hidden aspect-video bg-black/30">
                          <img
                            src={orderData.reference_image_path}
                            alt="Reference"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 pt-6 border-t border-white/5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 font-bold">{t('Subtotal', 'Items Subtotal')}</span>
                      <span className="text-white font-bold">${basePrice.toFixed(2)}</span>
                    </div>
                    {deliveryFee > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 font-bold">{t('Envío', 'Delivery Fee')}</span>
                        <span className="text-white font-bold">${deliveryFee.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-6 mt-6 border-t border-white/10">
                      <span className="text-xl font-black text-white uppercase tracking-tighter">
                        {t('Total', 'Total Amount')}:
                      </span>
                      <span className="text-4xl font-black text-[#C6A649] drop-shadow-[0_0_15px_rgba(198,166,73,0.3)]">
                        ${totalAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-500 text-center font-bold uppercase tracking-widest leading-relaxed">
                    {t(
                      'Al realizar el pago aceptas nuestras políticas de servicio y privacidad.',
                      'By paying, you agree to our terms of service and refund policies.'
                    )}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </main>

    <Footer />
  </div>
);
};

export default PaymentCheckout;
