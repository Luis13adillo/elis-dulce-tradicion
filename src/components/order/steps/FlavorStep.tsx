/* eslint-disable @typescript-eslint/no-explicit-any */
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { AlertCircle, Check } from 'lucide-react';

interface FlavorStepProps {
  breadType: string;
  activeBreadTypes: Array<{ value: string; label: string; desc: string }>;
  selectedFillings: string[];
  activeFillings: Array<{ value: string; label: string; sub: string; premium: boolean }>;
  premiumFillingSizes: Record<string, string>;
  activePremiumOptions: Array<{ value: string; label: string; labelEs: string; upcharge: number }>;
  optionsLoading: boolean;
  isSpanish: boolean;
  onBreadChange: (breadType: string) => void;
  onFillingToggle: (filling: string) => void;
  onPremiumSizeSet: (filling: string, size: string) => void;
}

export function getFlavorSummary(
  breadType: string,
  selectedFillings: string[],
  activeBreadTypes: any[],
  activeFillings: any[]
): string | null {
  const bread = activeBreadTypes.find(b => b.value === breadType);
  const fillingLabels = selectedFillings.slice(0, 2).map(f => activeFillings.find((af: any) => af.value === f)?.label || f);
  const breadLabel = bread?.label || breadType;
  if (!breadLabel) return null;
  const fillingSuffix = fillingLabels.length > 0 ? ` • ${fillingLabels.join(', ')}` : '';
  return `${breadLabel}${fillingSuffix}`;
}

export function validateFlavorStep(selectedFillings: string[], t: any): string | null {
  if (selectedFillings.length === 0) return t('Por favor selecciona al menos un relleno', 'Please select at least one filling');
  return null;
}

const FlavorStep = ({
  breadType,
  activeBreadTypes,
  selectedFillings,
  activeFillings,
  premiumFillingSizes,
  activePremiumOptions,
  optionsLoading,
  isSpanish,
  onBreadChange,
  onFillingToggle,
  onPremiumSizeSet,
}: FlavorStepProps) => {
  const { t } = useLanguage();

  const hasPendingPremiumSelection = () => {
    for (const filling of selectedFillings) {
      const fillingObj = activeFillings.find(f => f.value === filling);
      if (fillingObj?.premium && !premiumFillingSizes[filling]) {
        return true;
      }
    }
    return false;
  };

  // Premium filling awaiting size pick is rendered inline below the grid so
  // it doesn't overlap next-row cards on mobile (absolute popups inside a
  // 2-col grid clipped by the overflow-hidden wizard card).
  const pendingPremiumFilling = selectedFillings.find(f => {
    const obj = activeFillings.find(af => af.value === f);
    return obj?.premium && !premiumFillingSizes[f];
  });
  const pendingPremiumFillingObj = pendingPremiumFilling
    ? activeFillings.find(af => af.value === pendingPremiumFilling)
    : null;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Bread Type Selector */}
      <div className="space-y-3 sm:space-y-4">
        <label className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-[0.3em] block opacity-70">
          {t('Tipo de Pan', 'Bread Type')}
        </label>
        {optionsLoading ? (
          <div className="flex flex-col gap-2.5 sm:gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 sm:h-20 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 sm:gap-3">
            {activeBreadTypes.map(type => (
              <button
                key={type.value}
                onClick={() => onBreadChange(type.value)}
                className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl flex items-center justify-between gap-3 border transition-all duration-500 ${
                  breadType === type.value
                    ? 'bg-[#C6A649] border-[#C6A649] text-black shadow-[0_15px_30px_rgba(198,166,73,0.3)] scale-[1.02]'
                    : 'bg-white/5 border-white/10 text-white hover:bg-white/[0.08] hover:border-[#C6A649]/30 active:scale-[0.98]'
                }`}
              >
                <div className="text-left min-w-0 flex-1">
                  <div className="font-black uppercase tracking-tight text-sm sm:text-lg truncate">{type.label}</div>
                  <div className={`text-xs sm:text-sm font-medium italic leading-snug ${breadType === type.value ? 'text-black/60' : 'text-gray-400'}`}>
                    {type.desc}
                  </div>
                </div>
                {breadType === type.value && <Check size={20} className="text-black flex-shrink-0" strokeWidth={4} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filling Multi-Select Grid */}
      <div className="space-y-3 sm:space-y-4">
        <label className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-[0.3em] opacity-70 flex items-center justify-between">
          <span>
            {t('Relleno', 'Filling')} <span className="opacity-50 font-medium">({t('Opcional', 'Optional')})</span>
          </span>
          <span className={cn(selectedFillings.length >= 2 ? 'text-[#C6A649]' : 'text-gray-500')}>
            {selectedFillings.length}/2
          </span>
        </label>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {activeFillings.map(f => {
            const isSelected = selectedFillings.includes(f.value);
            const selectedSizeOption = f.premium && isSelected
              ? activePremiumOptions.find(opt => opt.value === premiumFillingSizes[f.value])
              : null;

            return (
              <button
                key={f.value}
                onClick={() => onFillingToggle(f.value)}
                className={`w-full p-3 sm:p-4 rounded-xl sm:rounded-2xl border text-left transition-all duration-500 relative overflow-hidden group/filling ${
                  isSelected
                    ? 'bg-[#C6A649]/20 border-[#C6A649] text-[#C6A649] shadow-[0_10px_20px_rgba(0,0,0,0.3)] scale-[1.03]'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-[#C6A649]/30 hover:bg-white/[0.08] active:scale-95'
                }`}
              >
                <div className="relative z-10 flex flex-col">
                  <div className="flex items-start gap-1.5 flex-wrap">
                    <div className="text-xs sm:text-sm font-black uppercase tracking-tight">{f.label}</div>
                    {f.premium && (
                      <span className="text-[8px] font-black bg-amber-500/20 text-amber-400 px-1.5 sm:px-2 py-0.5 rounded-full uppercase tracking-widest">
                        Premium
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest opacity-60 leading-tight mt-0.5 sm:mt-1">{f.sub}</div>
                  {selectedSizeOption && (
                    <div className="text-[10px] font-black text-[#C6A649] mt-1.5 sm:mt-2">
                      +${selectedSizeOption.upcharge} ({isSpanish ? selectedSizeOption.labelEs : selectedSizeOption.label})
                    </div>
                  )}
                </div>
                {isSelected && <div className="absolute inset-0 bg-[#C6A649]/5 z-0 pointer-events-none" />}
              </button>
            );
          })}
        </div>

        {/* Premium filling size picker — rendered inline, full-width, so it
            never overlaps the grid on small screens. */}
        {pendingPremiumFillingObj && (
          <div className="bg-black/40 backdrop-blur-xl border border-[#C6A649]/50 rounded-2xl p-4 shadow-[0_20px_40px_rgba(0,0,0,0.5)] animate-fade-in">
            <p className="text-[10px] sm:text-xs font-black text-[#C6A649] uppercase tracking-widest mb-3 text-center">
              {t('Tamaño para', 'Size for')} {pendingPremiumFillingObj.label}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {activePremiumOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onPremiumSizeSet(pendingPremiumFillingObj.value, opt.value)}
                  className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-[#C6A649]/50 hover:bg-[#C6A649]/10 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 text-center"
                >
                  <span className="text-xs font-bold text-white uppercase tracking-wide">{isSpanish ? opt.labelEs : opt.label}</span>
                  <span className="text-sm font-black text-[#C6A649]">+${opt.upcharge}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Warning if premium filling needs size selection */}
        {hasPendingPremiumSelection() && (
          <div className="flex items-center gap-2 sm:gap-3 text-amber-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-amber-500/10 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-amber-500/20">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span className="leading-tight">{t('Selecciona el tamaño para los rellenos premium', 'Select size for premium fillings')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FlavorStep;
