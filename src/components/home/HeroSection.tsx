import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import heroLogo from '@/assets/brand/logo.png';

const HeroSection = () => {
  const { t } = useLanguage();

  return (
    <section className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black">
      {/* Full-width video background */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          // @ts-expect-error fetchpriority is a valid HTML attribute not yet in React types
          fetchpriority="high"
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src="/videos/hero-video.mp4" type="video/mp4" />
        </video>
        {/* Premium gradient overlay */}
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/60" />
      </div>

      <div className="container relative z-10 mx-auto px-4 text-center">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-y-10 md:gap-y-16 animate-fade-in-up">
          <div className="w-full max-w-[480px] md:max-w-[700px] transition-transform duration-700 hover:scale-[1.02] relative group/logo">
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full border border-[#C6A649]/30 bg-[#C6A649]/10 backdrop-blur-md opacity-0 group-hover/logo:opacity-100 transition-all duration-500 transform translate-y-4 group-hover/logo:translate-y-0">
              <span className="text-[10px] font-black text-[#C6A649] uppercase tracking-[0.4em]">Est. 1990 Norristown</span>
            </div>
            <img
              src={heroLogo}
              alt={t('home.logoAlt')}
              className="mx-auto h-auto w-full object-contain drop-shadow-[0_0_35px_rgba(198,166,73,0.3)] filter brightness-110"
            />
          </div>

          {/* Order CTA — gold coin button with breathing halo */}
          <div className="relative">
            {/* Soft pulsing halo behind the button — draws the eye without being loud */}
            <span aria-hidden className="pointer-events-none absolute inset-0 -m-6 rounded-full bg-[#C6A649]/30 blur-2xl animate-pulse" />

            <Button
              asChild
              size="lg"
              className="group relative h-14 md:h-[68px] overflow-hidden rounded-full bg-gradient-to-b from-[#E5C76B] via-[#C6A649] to-[#9D7F2E] px-10 md:px-14 text-black ring-1 ring-[#C6A649]/70 shadow-[0_20px_50px_-10px_rgba(198,166,73,0.55),inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-2px_8px_rgba(0,0,0,0.15)] transition-all duration-500 hover:-translate-y-1 hover:scale-[1.03] hover:shadow-[0_30px_70px_-10px_rgba(198,166,73,0.8),inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-2px_8px_rgba(0,0,0,0.18)] active:scale-[0.98] active:translate-y-0"
            >
              <Link to="/order" className="relative flex items-center gap-3">
                {/* Sweeping shimmer on hover */}
                <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent group-hover:animate-shimmer" />

                <span className="font-display text-base md:text-lg font-black uppercase tracking-[0.3em] drop-shadow-[0_1px_0_rgba(255,255,255,0.25)]">
                  {t('home.orderNow')}
                </span>
                <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1.5" strokeWidth={3} />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
