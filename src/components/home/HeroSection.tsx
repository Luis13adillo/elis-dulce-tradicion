import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import heroVideo from "@/assets/Eli'sHero.mp4";
import heroLogo from '@/assets/brand/logo.png';

const HeroSection = () => {
  const { t } = useLanguage();

  return (
    <section className="relative flex min-h-screen w-full items-center justify-center overflow-hidden">
      {/* Full-width video background */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={heroVideo} type="video/mp4" />
        </video>
        {/* Premium gradient overlay */}
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/60" />
      </div>

      <div className="container relative z-10 mx-auto px-4 text-center">
        <div className="mx-auto flex max-w-4xl flex-col items-center space-y-6 animate-fade-in-up">
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

          <Button
            asChild
            size="lg"
            className="group relative h-12 md:h-16 overflow-hidden rounded-full border border-[#C6A649]/50 bg-[#C6A649]/20 px-8 md:px-12 text-white backdrop-blur-md transition-all duration-500 hover:border-[#C6A649] hover:bg-[#C6A649]/30 hover:shadow-[0_0_50px_rgba(198,166,73,0.5)] hover:-translate-y-1"
          >
            <Link to="/order" className="flex items-center gap-3">
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-[#C6A649]/20 to-transparent -translate-x-full group-hover:animate-shimmer" />

              <span className="font-display text-lg font-medium tracking-[0.2em] text-[#C6A649] group-hover:text-white transition-colors duration-300">
                {t('home.orderNow')}
              </span>
              <ArrowRight className="h-5 w-5 text-[#C6A649] transition-all duration-300 group-hover:translate-x-1 group-hover:text-white" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
