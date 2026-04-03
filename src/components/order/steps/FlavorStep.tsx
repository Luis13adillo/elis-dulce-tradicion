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

  return (
    <div className="space-y-6">
      {/* Bread Type Selector */}
      <div className="space-y-4">
        <label className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] mb-4 block opacity-70">
          {t('Tipo de Pan', 'Bread Type')}
        </label>
        {optionsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {activeBreadTypes.map(type => (
              <button
                key={type.value}
                onClick={() => onBreadChange(type.value)}
                className={`p-6 rounded-3xl flex items-center justify-between border transition-all duration-500 ${
                  breadType === type.value
                    ? 'bg-[#C6A649] border-[#C6A649] text-black shadow-[0_15px_30px_rgba(198,166,73,0.3)] scale-[1.02]'
                    : 'bg-white/5 border-white/10 text-white hover:bg-white/[0.08] hover:border-[#C6A649]/30'
                }`}
              >
                <div className="text-left">
                  <div className="font-black uppercase tracking-tight text-lg">{type.label}</div>
                  <div className={`text-sm font-medium italic ${breadType === type.value ? 'text-black/60' : 'text-gray-400'}`}>
                    {type.desc}
                  </div>
                </div>
                {breadType === type.value && <Check size={24} className="text-black" strokeWidth={4} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filling Multi-Select Grid */}
      <div className="space-y-4">
        <label className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] mb-4 block opacity-70 flex items-center justify-between">
          <span>
            {t('Relleno', 'Filling')} <span className="opacity-50 font-medium">({t('Opcional', 'Optional')})</span>
          </span>
          <span className={cn(selectedFillings.length >= 2 ? 'text-[#C6A649]' : 'text-gray-500')}>
            {selectedFillings.length}/2
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {activeFillings.map(f => {
            const isSelected = selectedFillings.includes(f.value);
            const needsSizeSelection = f.premium && isSelected && !premiumFillingSizes[f.value];
            const selectedSizeOption = f.premium && isSelected
              ? activePremiumOptions.find(opt => opt.value === premiumFillingSizes[f.value])
              : null;

            return (
              <div key={f.value} className="relative">
                <button
                  onClick={() => onFillingToggle(f.value)}
                  className={`w-full p-4 rounded-2xl border text-left transition-all duration-500 relative overflow-hidden group/filling ${
                    isSelected
                      ? 'bg-[#C6A649]/20 border-[#C6A649] text-[#C6A649] shadow-[0_10px_20px_rgba(0,0,0,0.3)] scale-[1.05]'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:border-[#C6A649]/30 hover:bg-white/[0.08]'
                  }`}
                >
                  <div className="relative z-10 flex flex-col">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-black uppercase tracking-tight mb-1">{f.label}</div>
                      {f.premium && (
                        <span className="text-[8px] font-black bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full uppercase tracking-widest">
                          Premium
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 leading-none">{f.sub}</div>
                    {selectedSizeOption && (
                      <div className="text-[10px] font-black text-[#C6A649] mt-2 flex items-center gap-1">
                        +${selectedSizeOption.upcharge} ({isSpanish ? selectedSizeOption.labelEs : selectedSizeOption.label})
                      </div>
                    )}
                  </div>
                  {isSelected && <div className="absolute inset-0 bg-[#C6A649]/5 z-0" />}
                </button>

                {/* Premium filling size selection popup */}
                {needsSizeSelection && (
                  <div className="absolute top-full left-0 right-0 mt-2 z-20 bg-black/95 backdrop-blur-xl border border-[#C6A649]/50 rounded-2xl p-4 shadow-[0_20px_40px_rgba(0,0,0,0.8)] animate-fade-in">
                    <p className="text-xs font-black text-[#C6A649] uppercase tracking-widest mb-3 text-center">
                      {t('Selecciona tamaño', 'Select size')}
                    </p>
                    <div className="flex flex-col gap-2">
                      {activePremiumOptions.map(opt => (
                        <button
                          key={opt.value}
                          onClick={(e) => {
                            e.stopPropagation();
                            onPremiumSizeSet(f.value, opt.value);
                          }}
                          className="w-full p-3 rounded-xl bg-white/5 border border-white/10 hover:border-[#C6A649]/50 hover:bg-[#C6A649]/10 transition-all flex justify-between items-center"
                        >
                          <span className="text-sm font-bold text-white">{isSpanish ? opt.labelEs : opt.label}</span>
                          <span className="text-sm font-black text-[#C6A649]">+${opt.upcharge}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Warning if premium filling needs size selection */}
        {hasPendingPremiumSelection() && (
          <div className="flex items-center gap-3 text-amber-400 text-xs font-bold uppercase tracking-wider bg-amber-500/10 px-4 py-3 rounded-xl border border-amber-500/20">
            <AlertCircle size={16} />
            {t('Selecciona el tamaño para los rellenos premium', 'Select size for premium fillings')}
          </div>
        )}
      </div>
    </div>
  );
};

export default FlavorStep;
