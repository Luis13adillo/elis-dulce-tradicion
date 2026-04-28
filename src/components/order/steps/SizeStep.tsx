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
  servings: string;
  onServingsChange: (value: string) => void;
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

const SizeStep = ({ cakeSize, activeCakeSizes, optionsLoading, isSpanish, onSizeChange, servings, onServingsChange }: SizeStepProps) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Serving Guide Banner */}
      <div className="bg-[#C6A649]/10 border border-[#C6A649]/20 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
        <div className="bg-[#C6A649] text-black rounded-lg p-1.5 sm:p-2 flex-shrink-0">
          <User size={18} strokeWidth={3} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-[#C6A649]">{t('Guía de Porciones', 'Serving Guide')}</p>
          <p className="text-xs sm:text-sm text-gray-300 font-medium leading-snug">{t('Escoge según el número de invitados', 'Choose based on your headcount')}</p>
        </div>
      </div>

      {/* Guest count input */}
      <div className="space-y-2">
        <label className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-[0.3em] block">
          {t('¿Cuántas personas?', 'How many guests?')}
        </label>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          value={servings}
          onChange={(e) => onServingsChange(e.target.value)}
          placeholder={t('Ej. 12', 'e.g. 12')}
          className="w-full bg-white/5 border border-white/10 focus:border-[#C6A649]/50 hover:bg-white/10 transition-all rounded-2xl p-3.5 sm:p-4 text-white font-bold outline-none text-base"
        />
      </div>

      {/* Loading Skeleton */}
      {optionsLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        /* Size Selection Grid */
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
          {activeCakeSizes.map(s => (
            <button
              key={s.value}
              onClick={() => onSizeChange(s.value)}
              className={`relative p-3.5 sm:p-6 rounded-2xl sm:rounded-[2rem] text-left transition-all duration-500 border overflow-hidden group/card ${
                cakeSize === s.value
                  ? 'bg-white/10 border-[#C6A649]/50 shadow-[0_20px_50px_rgba(0,0,0,0.5)] scale-[1.03]'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/[0.08] hover:border-[#C6A649]/30 active:scale-95'
              }`}
            >
              {s.featured && (
                <div className="absolute top-0 right-0 bg-[#C6A649] text-[8px] sm:text-[9px] font-black text-black px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-bl-xl sm:rounded-bl-[1.5rem] uppercase tracking-widest z-10">
                  Popular
                </div>
              )}
              <div className="text-[10px] sm:text-xs font-black uppercase tracking-widest mb-1.5 sm:mb-2 opacity-50 group-hover/card:opacity-100 transition-opacity">
                {s.serves} {t('pers', 'ppl')}
              </div>
              <div className="font-black text-white text-sm sm:text-base md:text-lg mb-2 sm:mb-4 leading-tight uppercase tracking-tight">
                {isSpanish ? s.labelEs : s.label}
              </div>
              <div className={`text-xl sm:text-2xl font-black tracking-tight ${cakeSize === s.value ? 'text-[#C6A649]' : 'text-white'}`}>
                {formatPrice(s.price)}
              </div>

              {cakeSize === s.value && (
                <div className="absolute bottom-3 right-3 sm:bottom-5 sm:right-5 text-[#C6A649] animate-fade-in">
                  <Check size={22} strokeWidth={4} />
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
