import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { Phone, MapPin, Clock, Mail, AlertCircle, ArrowLeft } from 'lucide-react';

const PHONE_DISPLAY = '(610) 279-6200';
const PHONE_TEL = '+16102796200';
const ADDRESS_LINE1 = '324 W Marshall St';
const ADDRESS_LINE2 = 'Norristown, PA 19401';
const ADDRESS_MAPS = 'https://www.google.com/maps/search/?api=1&query=324+W+Marshall+St+Norristown+PA+19401';
const EMAIL = 'orders@elisbakery.com';
const HOURS_EN = 'Daily 5:00 AM – 10:00 PM';
const HOURS_ES = 'Diario 5:00 AM – 10:00 PM';

const OrderMaintenance = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#C6A649]/30">
      <Navbar />

      <main className="pt-32 sm:pt-40 pb-24 relative overflow-hidden">
        <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-[#C6A649]/10 rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-0 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-2xl">
            <div className="mb-8 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-black tracking-[0.2em] uppercase mb-6">
                <AlertCircle className="h-4 w-4" />
                {t('Pedidos En Línea Pausados', 'Online Orders Paused')}
              </div>
              <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-black text-white uppercase tracking-tighter mb-4 leading-tight">
                {t('Llámanos Para', 'Call Us To')}{' '}
                <span className="text-[#C6A649]">{t('Tu Pastel', 'Place Your Order')}</span>
              </h1>
              <p className="text-base sm:text-lg text-gray-400 leading-relaxed max-w-xl mx-auto">
                {t(
                  'Los pedidos personalizados en línea están temporalmente pausados. Llámanos o visítanos y con gusto tomamos tu orden — el mismo pastel, el mismo precio.',
                  "Custom online orders are temporarily paused. Call us or stop by and we'll happily take your order — same cake, same price."
                )}
              </p>
            </div>

            <div className="space-y-4">
              <a
                href={`tel:${PHONE_TEL}`}
                className="block group rounded-[2rem] border border-[#C6A649]/40 bg-[#C6A649]/10 hover:bg-[#C6A649]/20 backdrop-blur-2xl p-6 sm:p-8 transition-all duration-300 shadow-[0_0_30px_rgba(198,166,73,0.15)] hover:shadow-[0_0_50px_rgba(198,166,73,0.3)] hover:scale-[1.02] active:scale-[0.99]"
              >
                <div className="flex items-center gap-5">
                  <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-[#C6A649] flex items-center justify-center text-black flex-shrink-0 shadow-lg">
                    <Phone className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] sm:text-xs font-black text-[#C6A649] uppercase tracking-[0.25em] mb-1">
                      {t('Llamar Ahora', 'Call Now')}
                    </p>
                    <p className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight group-hover:text-[#C6A649] transition-colors">
                      {PHONE_DISPLAY}
                    </p>
                  </div>
                </div>
              </a>

              <a
                href={ADDRESS_MAPS}
                target="_blank"
                rel="noopener noreferrer"
                className="block group rounded-[2rem] border border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur-2xl p-6 sm:p-8 transition-all duration-300"
              >
                <div className="flex items-start gap-5">
                  <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-[#C6A649] flex-shrink-0">
                    <MapPin className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-[0.25em] mb-1">
                      {t('Visítanos', 'Visit Us')}
                    </p>
                    <p className="text-lg sm:text-xl font-bold text-white tracking-tight">
                      {ADDRESS_LINE1}
                    </p>
                    <p className="text-base text-gray-400">{ADDRESS_LINE2}</p>
                  </div>
                </div>
              </a>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-2xl p-5">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 flex-shrink-0">
                      <Clock className="h-5 w-5" strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.25em] mb-1">
                        {t('Horario', 'Hours')}
                      </p>
                      <p className="text-sm font-bold text-white">
                        {t(HOURS_ES, HOURS_EN)}
                      </p>
                    </div>
                  </div>
                </div>

                <a
                  href={`mailto:${EMAIL}`}
                  className="rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur-2xl p-5 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-[#C6A649] flex-shrink-0">
                      <Mail className="h-5 w-5" strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.25em] mb-1">
                        {t('Correo', 'Email')}
                      </p>
                      <p className="text-sm font-bold text-white truncate">{EMAIL}</p>
                    </div>
                  </div>
                </a>
              </div>
            </div>

            <div className="mt-10 text-center">
              <Button
                onClick={() => navigate('/')}
                variant="outline"
                className="rounded-full border-white/20 hover:bg-white/10 text-white px-6 py-5 h-auto"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('Volver al Inicio', 'Back to Home')}
              </Button>
            </div>

            <p className="mt-8 text-center text-xs text-gray-500 font-medium">
              {t(
                'Lamentamos las molestias. Estaremos de vuelta pronto.',
                "Sorry for the inconvenience. We'll be back online soon."
              )}
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default OrderMaintenance;
