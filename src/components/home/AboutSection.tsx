import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight, Croissant, Cake, Utensils, Coffee } from 'lucide-react';
import aboutImage from '@/assets/about/bakery-display.png';

const AboutSection = () => {
  const { t } = useLanguage();

  const offerings = [
    { icon: Croissant, labelES: 'Pan Dulce', labelEN: 'Pastries' },
    { icon: Cake, labelES: 'Pasteles', labelEN: 'Cakes' },
    { icon: Utensils, labelES: 'Tamales', labelEN: 'Tamales' },
    { icon: Coffee, labelES: 'Desayunos', labelEN: 'Breakfast' },
  ];

  return (
    <section className="relative overflow-hidden bg-black py-16 md:py-24 lg:py-32">
      <div className="container px-4 md:px-6 relative z-10">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12 items-center">

          {/* Text Content Side */}
          <div className="flex flex-col justify-center space-y-6 md:space-y-10 animate-fade-in">
            <div className="space-y-6">
              <span className="text-sm font-bold tracking-[0.3em] text-[#C6A649] uppercase block">
                {t('Nuestra Herencia', 'Our Heritage')}
              </span>
              <h2 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-white uppercase">
                {t('Sobre', 'About')} <span className="text-[#C6A649] drop-shadow-[0_0_15px_rgba(198,166,73,0.3)]">{t('Nosotros', 'Us')}</span>
              </h2>
              <div className="h-1.5 w-32 rounded-full bg-gradient-to-r from-[#C6A649] to-transparent shadow-[0_0_10px_rgba(198,166,73,0.5)]" />
            </div>

            <div className="space-y-6 text-base md:text-xl text-gray-400 font-light leading-relaxed">
              <p>
                {t(
                  "En Eli's Bakery Cafe somos una pastelería y panadería familiar con raíces mexicanas. Nuestro compromiso es ofrecer productos frescos todos los días, desde nuestro famoso pastel de 3 leches, hasta pan dulce tradicional.",
                  "At Eli's Bakery Cafe, we are a family-owned bakery rooted in Mexican tradition. We take pride in offering freshly baked products daily — from our signature Tres Leches cake, to traditional sweet breads."
                )}
              </p>
              <p className="font-serif text-lg sm:text-xl md:text-2xl italic text-[#C6A649]">
                {t(
                  "\"Porque en Eli's, cada celebración merece ser inolvidable.\"",
                  "\"Because at Eli's, every celebration deserves to be unforgettable.\""
                )}
              </p>
            </div>

            {/* Icons Grid - Simplified Premium */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 pt-4 md:pt-6">
              {offerings.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={index} className="flex flex-col items-center gap-4 text-center group">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-[#C6A649] transition-all duration-500 group-hover:bg-[#C6A649]/10 group-hover:border-[#C6A649]/30 group-hover:-translate-y-2 shadow-xl">
                      <Icon className="h-8 w-8" />
                    </div>
                    <span className="text-sm font-bold text-gray-400 group-hover:text-white uppercase tracking-widest transition-colors">
                      {t(item.labelES, item.labelEN)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="pt-8">
              <Button asChild className="rounded-full px-8 py-4 md:px-12 md:py-8 text-base md:text-xl font-black shadow-[0_0_30px_rgba(198,166,73,0.3)] hover:scale-105 transition-all bg-[#C6A649] text-black hover:bg-white">
                <Link to="/about" className="flex items-center gap-3">
                  {t('Nuestra Historia', 'Read Our Story')} <ArrowRight className="h-6 w-6" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Image Side - Premium Frame */}
          <div className="relative mx-auto w-full max-w-[600px] lg:max-w-none group">
            <div className="absolute -inset-4 bg-gradient-to-tr from-[#C6A649]/20 to-transparent blur-3xl rounded-[3rem] opacity-30 group-hover:opacity-60 transition-opacity duration-700" />
            <div className="relative aspect-square overflow-hidden rounded-[2.5rem] shadow-2xl border border-white/10 -rotate-2 group-hover:rotate-0 transition-transform duration-700">
              <img
                src={aboutImage}
                alt="Eli's Bakery Display Case"
                className="h-full w-full object-cover transition-transform duration-1000 scale-110 group-hover:scale-100"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />

              <div className="absolute bottom-8 left-8 right-8">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-[#C6A649] flex items-center justify-center text-black font-bold text-xl shadow-lg">E</div>
                  <div>
                    <p className="text-white font-bold text-lg">Eli's Tradition</p>
                    <p className="text-[#C6A649] text-sm font-semibold uppercase tracking-widest">Since 1990</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default AboutSection;
