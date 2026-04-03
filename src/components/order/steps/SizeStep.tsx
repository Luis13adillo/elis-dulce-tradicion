/* eslint-disable @typescript-eslint/no-explicit-any */
import { useLanguage } from '@/contexts/LanguageContext';
import { formatPrice } from '@/lib/pricing';
import { User, Check } from 'lucide-react';

interface SizeStepProps {
  cakeSize: string;
  activeCakeSizes: Array<{ value: string; label: string; labelEs: string; price: number; serves: string; featured: boolean }>;
  optionsLoading: boolean;
  isSpanish: boolean;
  onSizeChange: (size: string) => void;
}

export function getSizeSummary(cakeSize: string, activeCakeSizes: any[], isSpanish: boolean): string | null {
  if (!cakeSize) return null;
  const s = activeCakeSizes.find(s => s.value === cakeSize);
  return s ? (isSpanish ? s.labelEs : s.label) : cakeSize;
}

export function validateSizeStep(cakeSize: string, t: any): string | null {
  if (!cakeSize) return t('Por favor selecciona un tamaño', 'Please select a size');
  return null;
}

const SizeStep = ({ cakeSize, activeCakeSizes, optionsLoading, isSpanish, onSizeChange }: SizeStepProps) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      {/* Serving Guide Banner */}
      <div className="bg-[#C6A649]/10 border border-[#C6A649]/20 rounded-2xl p-4 flex items-center gap-4 mb-2">
        <div className="bg-[#C6A649] text-black rounded-lg p-2">
          <User size={20} strokeWidth={3} />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-[#C6A649]">{t('Guía de Porciones', 'Serving Guide')}</p>
          <p className="text-sm text-gray-300 font-medium">{t('Escoge según el número de invitados', 'Choose based on your headcount')}</p>
        </div>
      </div>

      {/* Loading Skeleton */}
      {optionsLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        /* Size Selection Grid */
        <div className="grid grid-cols-2 gap-4">
          {activeCakeSizes.map(s => (
            <button
              key={s.value}
              onClick={() => onSizeChange(s.value)}
              className={`relative p-6 rounded-[2rem] text-left transition-all duration-500 border overflow-hidden group/card ${
                cakeSize === s.value
                  ? 'bg-white/10 border-[#C6A649]/50 shadow-[0_20px_50px_rgba(0,0,0,0.5)] scale-105'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/[0.08] hover:border-[#C6A649]/30'
              }`}
            >
              {s.featured && (
                <div className="absolute top-0 right-0 bg-[#C6A649] text-[9px] font-black text-black px-4 py-1.5 rounded-bl-[1.5rem] uppercase tracking-widest z-10">
                  Popular
                </div>
              )}
              <div className="text-xs font-black uppercase tracking-widest mb-2 opacity-50 group-hover/card:opacity-100 transition-opacity">
                {s.serves} {t('pers', 'ppl')}
              </div>
              <div className="font-black text-white text-base md:text-lg mb-4 leading-tight uppercase tracking-tight">
                {isSpanish ? s.labelEs : s.label}
              </div>
              <div className={`text-2xl font-black tracking-tight ${cakeSize === s.value ? 'text-[#C6A649]' : 'text-white'}`}>
                {formatPrice(s.price)}
              </div>

              {cakeSize === s.value && (
                <div className="absolute bottom-5 right-5 text-[#C6A649] animate-fade-in">
                  <Check size={28} strokeWidth={4} />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SizeStep;
