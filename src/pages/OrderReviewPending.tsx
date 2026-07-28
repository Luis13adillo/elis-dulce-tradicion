import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/lib/api';
import { ChefHat, Phone, Clock, ShieldCheck } from 'lucide-react';

/**
 * Holding page for orders whose design photo is under review.
 *
 * The customer lands here (instead of checkout) when the pre-payment photo
 * review holds the order — or when the review call could not return a verdict
 * (fail-closed). No payment has been taken. The page quietly re-checks a few
 * times: if the review resolves to "proceed" (transient failure healed, or
 * staff approved while the customer waited), it forwards to checkout
 * automatically. The AI's reasoning is never shown here.
 */
const RECHECK_INTERVAL_MS = 15_000;
const MAX_RECHECKS = 3;

const OrderReviewPending = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pendingId = searchParams.get('pendingId');
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const recheckCount = useRef(0);

  useEffect(() => {
    try {
      const ref = sessionStorage.getItem('pendingOrderRef');
      if (ref) {
        const parsed = JSON.parse(ref) as { pendingId?: string; orderNumber?: string };
        if (!pendingId || parsed.pendingId === pendingId) {
          setOrderNumber(parsed.orderNumber ?? null);
        }
      }
    } catch { /* cosmetic only */ }
  }, [pendingId]);

  useEffect(() => {
    if (!pendingId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const recheck = async () => {
      try {
        const { held } = await api.reviewOrderImage(pendingId);
        if (cancelled) return;
        if (!held) {
          navigate(`/payment-checkout?pendingId=${encodeURIComponent(pendingId)}`);
          return;
        }
      } catch {
        // Still can't get a verdict — stay held (fail-closed).
      }
      if (!cancelled && recheckCount.current < MAX_RECHECKS) {
        recheckCount.current += 1;
        timer = setTimeout(recheck, RECHECK_INTERVAL_MS);
      }
    };

    recheck();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pendingId, navigate]);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#C6A649]/30">
      <Navbar />
      <main className="pt-40 pb-24 relative overflow-hidden">
        <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-[#C6A649]/10 rounded-full blur-[150px] pointer-events-none" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-block px-4 py-1 rounded-full border border-[#C6A649]/30 bg-[#C6A649]/10 text-[#C6A649] text-xs font-black tracking-[0.2em] uppercase mb-6">
              {t('Pedido Recibido', 'Order Received')}
            </span>
            <h1 className="font-display text-4xl md:text-5xl font-black uppercase tracking-tighter mb-4">
              {t('Estamos revisando', "We're reviewing")}{' '}
              <span className="text-[#C6A649]">{t('tu diseño', 'your design')}</span>
            </h1>
            {orderNumber && (
              <p className="text-gray-400 font-bold mb-10">
                {t('Pedido', 'Order')} <span className="text-white">{orderNumber}</span>
              </p>
            )}

            <Card className="border-white/10 bg-white/5 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl text-left">
              <CardContent className="p-8 md:p-12 space-y-8">
                <div className="flex gap-4">
                  <ChefHat className="h-8 w-8 shrink-0 text-[#C6A649]" />
                  <p className="text-gray-300 leading-relaxed">
                    {t(
                      'Nuestros reposteros están revisando personalmente la foto de tu diseño para asegurarnos de que podamos hacerlo perfecto.',
                      'Our bakers are personally reviewing your design photo to make sure we can make it perfect.'
                    )}
                  </p>
                </div>
                <div className="flex gap-4">
                  <ShieldCheck className="h-8 w-8 shrink-0 text-[#C6A649]" />
                  <p className="text-gray-300 leading-relaxed font-bold">
                    {t(
                      'Aún no se ha realizado ningún cargo a tu tarjeta.',
                      'Your card has not been charged.'
                    )}
                  </p>
                </div>
                <div className="flex gap-4">
                  <Clock className="h-8 w-8 shrink-0 text-[#C6A649]" />
                  <p className="text-gray-300 leading-relaxed">
                    {t(
                      'Te contactaremos muy pronto para confirmar los detalles y enviarte un enlace de pago seguro por correo electrónico.',
                      "We'll contact you shortly to confirm the details and email you a secure payment link."
                    )}
                  </p>
                </div>
                <div className="flex gap-4 pt-6 border-t border-white/10">
                  <Phone className="h-8 w-8 shrink-0 text-[#C6A649]" />
                  <p className="text-gray-300 leading-relaxed">
                    {t('¿Preguntas? Llámanos al', 'Questions? Call us at')}{' '}
                    <a href="tel:+16102796200" className="text-[#C6A649] font-black whitespace-nowrap">
                      (610) 279-6200
                    </a>
                  </p>
                </div>
              </CardContent>
            </Card>

            <Link
              to="/"
              className="inline-block mt-10 text-xs font-black uppercase tracking-[0.2em] text-gray-500 hover:text-[#C6A649] transition-colors"
            >
              {t('Volver al inicio', 'Back to home')}
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default OrderReviewPending;
