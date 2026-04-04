import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

// Import cake images
import carCake from '@/assets/products/cakes/CarBirthdayCake.jpg';
import weddingCake from '@/assets/products/cakes/weddingCake.jpg';
import pawPatrolCake from '@/assets/products/cakes/PawPatrolBirthdayCake.jpg';
import quinceCake from '@/assets/products/cakes/quinceanera.png';

const CustomCakeBanner = () => {
    const { t } = useLanguage();

    return (
        <section className="w-full py-16 md:py-24 bg-black">
            <div className="container mx-auto px-4">
                <div className="relative w-full overflow-hidden rounded-[3rem] bg-white/5 backdrop-blur-3xl border border-white/10 shadow-2xl group">
                    {/* Background Glows */}
                    <div className="absolute top-0 right-0 h-96 w-96 bg-[#C6A649]/10 rounded-full blur-[100px] -mr-32 -mt-32 transition-all group-hover:bg-[#C6A649]/20" />
                    <div className="absolute bottom-0 left-0 h-96 w-96 bg-amber-500/5 rounded-full blur-[100px] -ml-32 -mb-32" />

                    <div className="relative z-10 flex flex-col items-center gap-8 p-6 sm:p-8 md:flex-row md:justify-between md:p-10 lg:p-20">

                        {/* Text Content */}
                        <div className="flex max-w-xl flex-col items-center text-center md:items-start md:text-left space-y-8">
                            <span className="inline-block px-4 py-1 rounded-full border border-[#C6A649]/30 bg-[#C6A649]/10 text-[#C6A649] text-xs font-bold tracking-[0.2em] uppercase">
                                {t('Piezas Maestras', 'Masterpieces')}
                            </span>
                            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-black text-white leading-tight uppercase tracking-tight">
                                {t('Diseña tu', 'Customize your')} <br />
                                <span className="text-[#C6A649] drop-shadow-[0_0_15px_rgba(198,166,73,0.3)]">{t('Pastel Soñado', 'Dream Cake')}</span>
                            </h2>
                            <p className="font-sans text-xl text-gray-400 font-light leading-relaxed max-w-md">
                                {t(
                                    'Pide en línea hoy, y déjanos crear algo tan único como tu celebración.',
                                    'Order online today, and let us create something as unique as your celebration.'
                                )}
                            </p>
                            <Link to="/order">
                                <Button
                                    size="lg"
                                    className="bg-[#C6A649] text-black hover:bg-white font-black shadow-[0_0_30px_rgba(198,166,73,0.3)] text-base md:text-xl px-6 md:px-12 h-12 md:h-16 rounded-full transition-all hover:scale-105"
                                >
                                    {t('Comenzar Pedido', 'Start Custom Order')}
                                </Button>
                            </Link>
                        </div>

                        {/* Mobile: 2x2 grid — all 4 cakes visible */}
                        <div className="grid grid-cols-2 gap-3 w-full md:hidden">
                            {[
                                { src: weddingCake, alt: 'Wedding Cake' },
                                { src: quinceCake, alt: 'Quinceañera Cake' },
                                { src: pawPatrolCake, alt: 'Paw Patrol Cake' },
                                { src: carCake, alt: 'Birthday Cake' },
                            ].map((cake) => (
                                <div key={cake.alt} className="relative overflow-hidden rounded-2xl border border-white/10 shadow-xl aspect-square">
                                    <img
                                        src={cake.src}
                                        alt={cake.alt}
                                        className="h-full w-full object-cover brightness-90"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                                </div>
                            ))}
                        </div>

                        {/* Desktop: floating composition */}
                        <div className="relative hidden md:block h-[400px] lg:h-[500px] w-full max-w-lg">
                            {/* Wedding Cake - Center Back */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 transform transition-all duration-700 hover:scale-110 z-10 w-56">
                                <img
                                    src={weddingCake}
                                    alt="Wedding Cake"
                                    className="h-auto w-full rounded-2xl object-cover shadow-2xl border border-white/10 brightness-90 hover:brightness-100"
                                />
                                <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/20 to-transparent" />
                            </div>

                            {/* Quince Cake - Left Middle */}
                            <div className="absolute top-20 left-0 transform -rotate-6 transition-all duration-700 hover:rotate-0 hover:scale-110 z-20 w-60">
                                <img
                                    src={quinceCake}
                                    alt="Quinceañera Cake"
                                    className="h-auto w-full rounded-2xl object-cover shadow-2xl border border-white/10 brightness-90 hover:brightness-100"
                                />
                                <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/40 to-transparent" />
                            </div>

                            {/* Paw Patrol - Right Middle */}
                            <div className="absolute top-24 right-0 transform rotate-6 transition-all duration-700 hover:rotate-0 hover:scale-110 z-20 w-52">
                                <img
                                    src={pawPatrolCake}
                                    alt="Paw Patrol Cake"
                                    className="h-auto w-full rounded-2xl object-cover shadow-2xl border border-white/10 brightness-90 hover:brightness-100"
                                />
                                <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/40 to-transparent" />
                            </div>

                            {/* Car Cake - Bottom Center */}
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 transform translate-y-4 hover:translate-y-0 transition-all duration-700 hover:scale-110 z-30 w-64">
                                <div className="absolute -inset-2 bg-[#C6A649]/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                                <img
                                    src={carCake}
                                    alt="Birthday Cake"
                                    className="h-auto w-full rounded-2xl object-cover shadow-2xl border border-[#C6A649]/30 brightness-100"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default CustomCakeBanner;
