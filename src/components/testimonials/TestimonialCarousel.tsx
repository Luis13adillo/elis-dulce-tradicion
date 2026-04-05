import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { Quote, Star } from 'lucide-react';

interface TestimonialCard {
  quoteES: string;
  quoteEN: string;
  author: string;
  roleES: string;
  roleEN: string;
  avatar: string;
  rating: string;
}

const testimonials: TestimonialCard[] = [
  {
    quoteES:
      'Eli\'s Bakery hizo el pastel para nuestra boda y fue increíble!! Fue entregado a tiempo y se veía exactamente como lo imaginamos. El pastel estaba delicioso y nuestros invitados no paraban de hablar de lo bueno que estaba!',
    quoteEN:
      'Eli\'s Bakery made the cake for our wedding and it was amazing!! It was delivered on time and looked exactly how we pictured. The cake was so delicious and our guests couldn\'t stop talking about how good it was!',
    author: 'Elise Harrison',
    roleES: 'Reseña de Google',
    roleEN: 'Google Review',
    avatar:
      'https://ui-avatars.com/api/?name=Elise+Harrison&background=random&color=fff',
    rating: '5.0',
  },
  {
    quoteES:
      '¡Qué agradable sorpresa! Hermoso y delicioso pastel de tres leches, digno de su reputación. La tienda huele a cielo y está llena hasta el borde de productos recién horneados.',
    quoteEN:
      'What a pleasant surprise. Beautiful and delicious tres leches cake, worthy of their reputation. The store smells like heaven and is filled to the brim with freshly baked goods.',
    author: 'Kevin L.',
    roleES: 'Reseña de Google',
    roleEN: 'Google Review',
    avatar:
      'https://ui-avatars.com/api/?name=Kevin+L&background=random&color=fff',
    rating: '5.0',
  },
  {
    quoteES:
      'Compramos el pastel de durazno y fresa recientemente, ¡y fue encantador! El pastel estaba suave, esponjoso e increíblemente sabroso.',
    quoteEN:
      'We recently bought the peach and strawberry cake from this bakery, and it was delightful! The cake was soft, spongy, and incredibly tasty.',
    author: 'Manpreet Kaur',
    roleES: 'Reseña de Google',
    roleEN: 'Google Review',
    avatar:
      'https://ui-avatars.com/api/?name=Manpreet+Kaur&background=random&color=fff',
    rating: '5.0',
  },
];

// Desktop fan layout config
const layers = [
  { gradientOpacity: 0.1, rotation: -10 },
  { gradientOpacity: 0.08, rotation: -6 },
  { gradientOpacity: 0.06, rotation: 0 },
];

// Per-card angles for mobile: entry angle (dramatic), rest angle (subtle), exit direction
const mobileAngles = [
  { entry: -18, rest: -4, exitX: -60 },
  { entry: 14,  rest:  3, exitX:  60 },
  { entry: -12, rest: -5, exitX: -60 },
  { entry: 16,  rest:  4, exitX:  60 },
  { entry: -10, rest: -3, exitX: -60 },
];

const CYCLE_INTERVAL = 5000;

const CardContent = ({ testimonial, t }: { testimonial: TestimonialCard; t: (es: string, en: string) => string }) => (
  <div className="flex h-full flex-col p-8 justify-between">
    <div>
      <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C6A649]/10 border border-[#C6A649]/20 transition-all group-hover:bg-[#C6A649]">
        <Quote className="h-6 w-6 text-[#C6A649] group-hover:text-black" />
      </div>
      <p className="mb-6 text-lg leading-relaxed text-gray-300 font-light italic font-serif">
        "{t(testimonial.quoteES, testimonial.quoteEN)}"
      </p>
    </div>
    <div className="flex items-center justify-between border-t border-white/10 pt-5">
      <div className="flex items-center gap-3">
        <img
          src={testimonial.avatar}
          alt={`${testimonial.author} avatar`}
          className="h-10 w-10 rounded-full object-cover border border-[#C6A649]/30"
        />
        <div>
          <div className="text-sm font-bold text-white uppercase tracking-wider">
            {testimonial.author}
          </div>
          <div className="text-xs text-[#C6A649] font-bold uppercase tracking-widest">
            {t(testimonial.roleES, testimonial.roleEN)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 bg-[#C6A649]/10 px-3 py-1 rounded-full border border-[#C6A649]/20">
        <Star className="h-3 w-3 text-[#C6A649] fill-[#C6A649]" />
        <span className="text-xs font-black text-[#C6A649]">{testimonial.rating}</span>
      </div>
    </div>
  </div>
);

const TestimonialCarousel = () => {
  const { t } = useLanguage();
  const [isHovering, setIsHovering] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-cycle on mobile
  useEffect(() => {
    if (!isMobile || isPaused) return;
    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % testimonials.length);
    }, CYCLE_INTERVAL);
    return () => clearInterval(timer);
  }, [isMobile, isPaused]);

  const angles = mobileAngles[activeIndex % mobileAngles.length];

  return (
    <section className="relative bg-black py-32 overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#C6A649]/5 rounded-full blur-[150px] pointer-events-none" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-20 text-center animate-fade-in">
            <span className="text-sm font-bold tracking-[0.3em] text-[#C6A649] uppercase mb-4 block">
              {t('Testimonios', 'Testimonials')}
            </span>
            <h2 className="text-5xl md:text-7xl font-black text-white mb-6 uppercase tracking-tight">
              {t('Lo Que Dicen', 'What Our')}{' '}
              <span className="text-[#C6A649] drop-shadow-[0_0_15px_rgba(198,166,73,0.3)]">
                {t('Nuestros Clientes', 'Customers Say')}
              </span>
            </h2>
            <div className="h-1.5 w-32 bg-gradient-to-r from-transparent via-[#C6A649] to-transparent mx-auto rounded-full shadow-[0_0_10px_rgba(198,166,73,0.5)]" />
          </div>

          {/* ── Mobile: animated single card ── */}
          {isMobile ? (
            <div className="flex flex-col items-center">
              {/* Card stage — fixed height so dots don't jump */}
              <div className="relative w-full flex items-center justify-center" style={{ minHeight: 420 }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeIndex}
                    initial={{
                      opacity: 0,
                      rotate: angles.entry,
                      x: angles.entry > 0 ? 80 : -80,
                      scale: 0.92,
                    }}
                    animate={{
                      opacity: 1,
                      rotate: angles.rest,
                      x: 0,
                      scale: 1,
                    }}
                    exit={{
                      opacity: 0,
                      rotate: angles.rest * 2,
                      x: angles.exitX,
                      scale: 0.9,
                    }}
                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    className="relative w-full max-w-[340px] rounded-[2.5rem] border border-white/10 shadow-2xl backdrop-blur-3xl group cursor-pointer"
                    style={{
                      background: `linear-gradient(rgba(255,255,255,${layers[activeIndex % layers.length].gradientOpacity}), rgba(0,0,0,0.5))`,
                    }}
                    onTapStart={() => setIsPaused(true)}
                    onTap={() => {
                      setActiveIndex((i) => (i + 1) % testimonials.length);
                      setIsPaused(false);
                    }}
                  >
                    <CardContent testimonial={testimonials[activeIndex]} t={t} />
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Dot indicators + tap hint */}
              <div className="flex flex-col items-center gap-3 mt-6">
                <div className="flex gap-2">
                  {testimonials.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { setActiveIndex(i); setIsPaused(false); }}
                      className="transition-all duration-300 rounded-full"
                      style={{
                        width: i === activeIndex ? 24 : 8,
                        height: 8,
                        background: i === activeIndex ? '#C6A649' : 'rgba(198,166,73,0.25)',
                      }}
                    />
                  ))}
                </div>
                <p className="text-xs text-white/30 tracking-widest uppercase">
                  {t('Toca para ver más', 'Tap to see more')}
                </p>
              </div>
            </div>
          ) : (
            /* ── Desktop: fan layout (unchanged) ── */
            <div
              className="relative flex items-center justify-center px-8 min-h-[500px]"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              <div className="flex items-center justify-center">
                {testimonials.map((testimonial, index) => {
                  const layer = layers[index % layers.length];
                  const rotation = isHovering ? 0 : layer.rotation;
                  const margin = isHovering ? 0 : -60;

                  return (
                    <div
                      key={testimonial.author}
                      className="relative flex h-[420px] w-[350px] items-center justify-center rounded-[2.5rem] border border-white/10 shadow-2xl backdrop-blur-3xl transition-all duration-700 ease-out group"
                      style={{
                        background: isHovering
                          ? 'rgba(255,255,255,0.08)'
                          : `linear-gradient(rgba(255,255,255,${layer.gradientOpacity}), rgba(0,0,0,0.5))`,
                        transform: `rotate(${rotation}deg) translateY(${isHovering ? 20 : 0}px) scale(${isHovering ? 1.05 : 1})`,
                        marginLeft: margin,
                        marginRight: margin,
                        zIndex: isHovering ? 50 : 10 + index,
                      }}
                    >
                      <CardContent testimonial={testimonial} t={t} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default TestimonialCarousel;
