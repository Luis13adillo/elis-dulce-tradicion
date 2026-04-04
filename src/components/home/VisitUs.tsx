import { MapPin, Clock, Phone, MessageCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import storefrontImage from '@/assets/gallery/2_M3wfgx3WZRpTbrc5cQDbCM_1767033935219_na1fn_L2hvbWUvdWJ1bnR1L2VsaXNfYmFrZXJ5X2ZpbmFsL2ludGVyaW9yL2ludGVyaW9yXzAxX2Jha2VyeV9zdG9yZWZyb250X2V4dGVyaW9yX2VuaGFuY2Vk.png';

export const VisitUs = () => {
    const { t } = useLanguage();
    return (
        <section className="py-16 md:py-24 lg:py-32 bg-black relative overflow-hidden">
            {/* Background Glows */}
            <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[500px] h-[500px] bg-[#C6A649]/5 rounded-full blur-[120px] pointer-events-none" />

            <div className="container mx-auto px-4 max-w-7xl relative z-10">

                {/* Header */}
                <div className="text-center mb-10 md:mb-16 lg:mb-20 animate-fade-in">
                    <span className="text-sm font-bold tracking-[0.3em] text-[#C6A649] uppercase mb-4 block">
                        {t('Ubicación', 'Location')}
                    </span>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-black text-white mb-6 uppercase tracking-tight">
                        {t('Ven a', 'Come')} <span className="text-[#C6A649] drop-shadow-[0_0_15px_rgba(198,166,73,0.3)]">{t('Visitarnos', 'Visit Us')}</span>
                    </h2>
                    <div className="h-1.5 w-32 bg-gradient-to-r from-transparent via-[#C6A649] to-transparent mx-auto rounded-full shadow-[0_0_10px_rgba(198,166,73,0.5)]"></div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 lg:gap-16 xl:gap-20 items-stretch">

                    {/* Left Column: Contact Info & Map */}
                    <div className="space-y-8 flex flex-col h-full animate-fade-in">

                        {/* Address Card */}
                        <div className="flex items-start gap-4 md:gap-6 p-5 sm:p-6 md:p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-[#C6A649]/30 hover:bg-white/[0.08] transition-all duration-500 group shadow-2xl">
                            <div className="bg-[#C6A649]/10 p-4 rounded-2xl group-hover:scale-110 group-hover:bg-[#C6A649]/20 transition-all duration-500 flex-shrink-0 border border-[#C6A649]/20">
                                <MapPin className="w-6 h-6 text-[#C6A649]" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-wide">{t('Dirección', 'Address')}</h3>
                                <p className="text-gray-400 leading-relaxed text-lg font-light">
                                    324 W Marshall St<br />
                                    Norristown, PA 19401
                                </p>
                                <a
                                    href="https://maps.google.com/?q=324+W+Marshall+St,+Norristown,+PA+19401"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 mt-4 text-sm text-[#C6A649] font-black uppercase tracking-widest hover:text-white transition-colors"
                                >
                                    {t('Cómo Llegar', 'Get Directions')} <ChevronRight className="w-4 h-4" />
                                </a>
                            </div>
                        </div>

                        {/* Hours Card */}
                        <div className="flex items-start gap-4 md:gap-6 p-5 sm:p-6 md:p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-[#C6A649]/30 hover:bg-white/[0.08] transition-all duration-500 group shadow-2xl">
                            <div className="bg-[#C6A649]/10 p-4 rounded-2xl group-hover:scale-110 group-hover:bg-[#C6A649]/20 transition-all duration-500 flex-shrink-0 border border-[#C6A649]/20">
                                <Clock className="w-6 h-6 text-[#C6A649]" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-wide">{t('Horario', 'Hours')}</h3>
                                <div className="space-y-2 text-gray-400 text-lg font-light">
                                    <div className="flex justify-between w-full max-w-[200px]">
                                        <span>{t('Lunes – Domingo', 'Monday – Sunday')}</span>
                                    </div>
                                    <div className="font-bold text-[#C6A649]">
                                        5:00 AM – 10:00 PM
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Phone Card */}
                        <div className="flex items-start gap-4 md:gap-6 p-5 sm:p-6 md:p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-[#C6A649]/30 hover:bg-white/[0.08] transition-all duration-500 group shadow-2xl relative overflow-hidden">
                            <div className="absolute -right-10 -bottom-10 h-40 w-40 bg-[#C6A649]/5 rounded-full blur-3xl" />

                            <div className="bg-[#C6A649]/10 p-4 rounded-2xl group-hover:scale-110 group-hover:bg-[#C6A649]/20 transition-all duration-500 flex-shrink-0 border border-[#C6A649]/20 relative z-10">
                                <Phone className="w-6 h-6 text-[#C6A649]" />
                            </div>
                            <div className="relative z-10">
                                <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-wide">{t('Teléfono', 'Phone')}</h3>
                                <p className="text-gray-400 mb-6 text-lg font-light">(610) 279-6200</p>
                                <div className="flex flex-wrap gap-4">
                                    <Button
                                        className="bg-[#C6A649] hover:bg-white text-black font-black rounded-full px-8 h-12 text-sm uppercase tracking-widest transition-all hover:scale-105 shadow-[0_0_20px_rgba(198,166,73,0.3)]"
                                        asChild
                                    >
                                        <a href="tel:+16102796200">
                                            <Phone className="w-4 h-4 mr-2" /> {t('Llamar', 'Call')}
                                        </a>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="border-white/20 text-white hover:bg-white hover:text-black font-black rounded-full px-8 h-12 text-sm uppercase tracking-widest"
                                    >
                                        <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Map Integration */}
                        <div className="w-full flex-grow min-h-[300px] rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10 relative group">
                            <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-all duration-700 pointer-events-none z-10" />
                            <iframe
                                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3053.468785873215!2d-75.34586432431644!3d40.1156847714894!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x89c69637c3855555%3A0x6345634563456345!2s324%20W%20Marshall%20St%2C%20Norristown%2C%20PA%2019401!5e0!3m2!1sen!2sus!4v1709920000000!5m2!1sen!2sus"
                                width="100%"
                                height="100%"
                                style={{ border: 0 }}
                                allowFullScreen
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                                title="Eli's Bakery Location"
                                className="grayscale hover:grayscale-0 transition-all duration-1000 h-full w-full object-cover"
                            ></iframe>
                        </div>

                    </div>

                    {/* Right Column: Storefront Image (Dominant Visual) */}
                    <div className="relative h-full min-h-[300px] sm:min-h-[400px] lg:min-h-[600px] group animate-fade-in">
                        <div className="absolute -inset-4 bg-[#C6A649]/20 blur-3xl rounded-[3rem] opacity-0 group-hover:opacity-30 transition-opacity duration-1000" />
                        <div className="relative w-full h-full rounded-[3rem] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10">
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80 z-10 transition-opacity group-hover:opacity-60"></div>
                            <img
                                src={storefrontImage}
                                alt="Eli's Bakery Storefront"
                                className="w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-110"
                            />

                            {/* Overlay Text */}
                            <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 md:p-12 z-20">
                                <span className="text-[#C6A649] font-black tracking-[0.3em] uppercase text-sm mb-4 block animate-fade-in">
                                    {t('Bienvenido a', 'Welcome To')}
                                </span>
                                <h3 className="text-white text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black uppercase tracking-tighter leading-none mb-4 md:mb-6">Eli's Bakery Cafe</h3>
                                <div className="h-1 w-20 bg-[#C6A649] mb-6" />
                                <p className="text-gray-300 text-base md:text-xl font-light leading-relaxed max-w-md">
                                    {t(
                                        'Busca nuestro edificio de ladrillos en West Marshall Street. Un lugar donde la tradición te invita a entrar.',
                                        'Look for our brick storefront on West Marshall Street. A place where tradition invites you in.'
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
};
