import { useRef, useState, useEffect, memo } from 'react';
import { motion, useInView } from 'framer-motion';
import { Instagram, Facebook, Pause, Play, ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const reelVideos = [
  { src: '/videos/reel_DQkJIv_CcRf.mp4', instagramUrl: 'https://www.instagram.com/p/DQkJIv_CcRf/' },
  { src: '/videos/reel_DVq2SVhjkbw.mp4', instagramUrl: 'https://www.instagram.com/p/DVq2SVhjkbw/' },
  { src: '/videos/reel_DU_cjV_iukD.mp4', instagramUrl: 'https://www.instagram.com/p/DU_cjV_iukD/' },
  { src: '/videos/reel_DJhfsKFO_Cq.mp4', instagramUrl: 'https://www.instagram.com/p/DJhfsKFO_Cq/' },
  { src: '/videos/reel_DEYWBvFOkhQ.mp4', instagramUrl: 'https://www.instagram.com/p/DEYWBvFOkhQ/' },
  { src: '/videos/reel_DDUs-71uRLm.mp4', instagramUrl: 'https://www.instagram.com/p/DDUs-71uRLm/' },
  { src: '/videos/reel_DUjQeEiD.mp4', instagramUrl: 'https://www.instagram.com/p/DUjQeEiD-mg/' },
  { src: '/videos/reel_DManEHfRtp4.mp4', instagramUrl: 'https://www.instagram.com/p/DManEHfRtp4/' },
];

interface VideoCardProps {
  src: string;
  instagramUrl: string;
  index: number;
  globalPaused: boolean;
}

const VideoCard = ({ src, instagramUrl, index, globalPaused }: VideoCardProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(cardRef, { margin: '-20% 0px -20% 0px' });

  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;
    const shouldPlay = isInView && !globalPaused && !isPaused;
    if (shouldPlay) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isInView, globalPaused, isPaused]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPaused(p => !p);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) videoRef.current.muted = !isMuted;
    setIsMuted(m => !m);
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.06 }}
      className="flex-shrink-0"
    >
      <div
        className="relative w-[240px] sm:w-[260px] h-[426px] sm:h-[462px] rounded-2xl overflow-hidden cursor-pointer group
          bg-black border border-white/10
          hover:border-[#C6A649]/60
          hover:shadow-[0_0_40px_rgba(198,166,73,0.18)]
          transition-all duration-400"
        onClick={() => window.open(instagramUrl, '_blank')}
      >
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70 z-10 pointer-events-none" />

        {/* Video */}
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          muted={isMuted}
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setIsLoaded(true)}
        />

        {/* Loading spinner */}
        {!isLoaded && (
          <div className="absolute inset-0 bg-zinc-900/80 flex items-center justify-center z-0">
            <div className="w-8 h-8 border-2 border-[#C6A649] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Controls — visible on hover */}
        <div className="absolute inset-0 z-20 p-3 flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          {/* Top */}
          <div className="flex justify-between items-start">
            <div className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/10">
              <Instagram className="w-3.5 h-3.5 text-white" />
            </div>
            <button
              onClick={toggleMute}
              className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/10 hover:bg-[#C6A649] hover:border-[#C6A649] hover:text-black transition-all"
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5 text-white" /> : <Volume2 className="w-3.5 h-3.5 text-white" />}
            </button>
          </div>

          {/* Bottom */}
          <div className="flex justify-end">
            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/20 hover:bg-[#C6A649] hover:border-[#C6A649] hover:text-black transition-all"
            >
              {isPaused || globalPaused
                ? <Play className="w-4 h-4 text-white ml-0.5" />
                : <Pause className="w-4 h-4 text-white" />
              }
            </button>
          </div>
        </div>

        {/* Gold shimmer on hover */}
        <div className="absolute inset-0 z-30 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C6A649]/60 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#C6A649]/40 to-transparent" />
        </div>
      </div>
    </motion.div>
  );
};

const InstagramReelsSection = memo(() => {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [globalPaused, setGlobalPaused] = useState(false);
  const [scrollDir, setScrollDir] = useState<'right' | 'left'>('right');

  useEffect(() => {
    if (globalPaused) return;
    const container = scrollRef.current;
    if (!container) return;

    let id: number;
    const speed = 0.4;

    const animate = () => {
      const max = container.scrollWidth - container.clientWidth;
      if (scrollDir === 'right') {
        container.scrollLeft += speed;
        if (container.scrollLeft >= max - 1) setScrollDir('left');
      } else {
        container.scrollLeft -= speed;
        if (container.scrollLeft <= 1) setScrollDir('right');
      }
      id = requestAnimationFrame(animate);
    };

    id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, [globalPaused, scrollDir]);

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' });
  };

  return (
    <section className="py-16 md:py-24 lg:py-32 bg-black relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[#C6A649]/4 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#C6A649]/30 to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#C6A649]/15 to-transparent" />

      <div className="container mx-auto px-4 max-w-7xl relative z-10">

        {/* Header */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6">
          <div className="text-center md:text-left">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-xs font-bold tracking-[0.3em] text-[#C6A649] uppercase mb-3 block"
            >
              {t('Síguenos', 'Follow Along')}
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-4xl md:text-5xl font-black text-white tracking-tight uppercase"
            >
              @ELISBAKERYCAFE
            </motion.h2>
            <div className="h-1 w-24 md:w-32 bg-gradient-to-r from-[#C6A649] to-transparent rounded-full mt-4 mx-auto md:mx-0" />
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => scroll('left')}
              className="w-11 h-11 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/60 hover:text-[#C6A649] hover:border-[#C6A649]/50 hover:bg-[#C6A649]/10 transition-all duration-300"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button
              onClick={() => setGlobalPaused(p => !p)}
              className="w-11 h-11 rounded-full border border-[#C6A649]/40 bg-[#C6A649]/10 flex items-center justify-center text-[#C6A649] hover:bg-[#C6A649] hover:text-black transition-all duration-300 shadow-[0_0_20px_rgba(198,166,73,0.15)]"
            >
              {globalPaused
                ? <Play className="w-4 h-4 ml-0.5" />
                : <Pause className="w-4 h-4" />
              }
            </button>

            <button
              onClick={() => scroll('right')}
              className="w-11 h-11 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/60 hover:text-[#C6A649] hover:border-[#C6A649]/50 hover:bg-[#C6A649]/10 transition-all duration-300"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Carousel */}
        <div className="relative -mx-4 md:mx-0">
          <div
            ref={scrollRef}
            className="flex gap-4 md:gap-5 overflow-x-auto pb-6 px-4 md:px-0"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {reelVideos.map((video, i) => (
              <VideoCard
                key={i}
                src={video.src}
                instagramUrl={video.instagramUrl}
                index={i}
                globalPaused={globalPaused}
              />
            ))}
          </div>

          {/* Fade edges */}
          <div className="absolute top-0 left-0 w-12 md:w-24 h-full bg-gradient-to-r from-black to-transparent pointer-events-none z-10 hidden md:block" />
          <div className="absolute top-0 right-0 w-12 md:w-24 h-full bg-gradient-to-l from-black to-transparent pointer-events-none z-10 hidden md:block" />
        </div>

        {/* Footer CTA */}
        <div className="text-center mt-10 flex flex-col items-center gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <a
              href="https://www.instagram.com/elisbakerycafe/"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative inline-flex items-center gap-3 px-8 py-4 overflow-hidden rounded-full transition-transform hover:scale-105 duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 opacity-20 blur-xl group-hover:opacity-40 transition-opacity" />
              <div className="absolute inset-0 border border-white/20 rounded-full group-hover:border-pink-400/50 transition-colors" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              <Instagram className="relative w-5 h-5 text-white group-hover:text-pink-400 transition-colors" />
              <span className="relative font-black tracking-widest text-white text-sm uppercase">
                @elisbakerycafe
              </span>
            </a>

            <a
              href="https://www.facebook.com/elispasteleria/"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative inline-flex items-center gap-3 px-8 py-4 overflow-hidden rounded-full transition-transform hover:scale-105 duration-300"
            >
              <div className="absolute inset-0 bg-blue-600/20 blur-xl group-hover:bg-blue-500/30 transition-opacity" />
              <div className="absolute inset-0 border border-white/20 rounded-full group-hover:border-blue-400/50 transition-colors" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              <Facebook className="relative w-5 h-5 text-white group-hover:text-blue-400 transition-colors" />
              <span className="relative font-black tracking-widest text-white text-sm uppercase">
                elispasteleria
              </span>
            </a>
          </div>

          <p className="text-white/25 text-xs tracking-widest uppercase">
            {t('Etiquétanos para aparecer aquí', 'Tag us to get featured')}
          </p>
        </div>

      </div>
    </section>
  );
});

InstagramReelsSection.displayName = 'InstagramReelsSection';
export default InstagramReelsSection;
