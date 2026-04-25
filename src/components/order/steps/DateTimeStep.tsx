/* eslint-disable @typescript-eslint/no-explicit-any */
import { useLanguage } from '@/contexts/LanguageContext';
import { validateLeadTime } from '@/lib/validation';
import { formatTimeDisplay } from './orderStepConstants';
import { Check, Clock, Calendar } from 'lucide-react';

interface DateTimeStepProps {
  dateNeeded: string;
  timeNeeded: string;
  timeOptions: string[];
  minLeadTimeHours?: number;
  maxAdvanceDays?: number;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
}

export function getDateTimeSummary(dateNeeded: string, timeNeeded: string): string | null {
  if (!dateNeeded) return null;
  const timeDisplay = timeNeeded ? ` • ${formatTimeDisplay(timeNeeded)}` : '';
  return `${dateNeeded}${timeDisplay}`;
}

export function validateDateTimeStep(
  dateNeeded: string,
  timeNeeded: string,
  t: any,
  minLeadTimeHours: number = 48
): string | null {
  if (!dateNeeded) return t('Por favor selecciona una fecha', 'Please select a date');
  if (!timeNeeded) return t('Por favor selecciona una hora', 'Please select a time');
  const leadCheck = validateLeadTime(dateNeeded, timeNeeded, minLeadTimeHours);
  if (!leadCheck.isValid) {
    return t(
      `Se requieren al menos ${minLeadTimeHours} horas de anticipación`,
      `Minimum ${minLeadTimeHours}h lead time required`
    );
  }
  return null;
}

const DateTimeStep = ({
  dateNeeded,
  timeNeeded,
  timeOptions,
  minLeadTimeHours = 48,
  maxAdvanceDays = 90,
  onDateChange,
  onTimeChange,
}: DateTimeStepProps) => {
  const { t } = useLanguage();

  const minDate = new Date().toISOString().split('T')[0];
  const maxDate = new Date(Date.now() + maxAdvanceDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="relative group/date">
        <input
          type="date"
          min={minDate}
          max={maxDate}
          value={dateNeeded}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 focus:border-[#C6A649]/50 hover:bg-white/10 transition-all rounded-2xl sm:rounded-3xl p-4 sm:p-6 pr-14 sm:pr-16 text-center text-base sm:text-2xl font-black text-white outline-none cursor-pointer"
        />
        <div className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 pointer-events-none text-[#C6A649] group-hover/date:scale-110 transition-transform">
          <Calendar size={22} />
        </div>
      </div>

      <div className="space-y-3 sm:space-y-4">
        <label className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-[0.3em] block text-center opacity-70">
          {t('Hora de Entrega', 'Pickup Time')}
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 sm:gap-3">
          {timeOptions.map(time => (
            <button
              key={time}
              onClick={() => onTimeChange(time)}
              className={`py-3 sm:py-4 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-black transition-all border uppercase tracking-wider sm:tracking-widest ${
                timeNeeded === time
                  ? 'bg-[#C6A649] text-black border-[#C6A649] shadow-[0_0_20px_rgba(198,166,73,0.4)] scale-105'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:border-[#C6A649]/30 hover:bg-white/10 active:scale-95'
              }`}
            >
              {formatTimeDisplay(time)}
            </button>
          ))}
        </div>
      </div>

      {/* Lead Time Display */}
      {dateNeeded && timeNeeded && (
        <div className="flex justify-center">
          {(() => {
            const leadTime = validateLeadTime(dateNeeded, timeNeeded, minLeadTimeHours);
            if (leadTime.isValid && leadTime.hoursUntilEvent) {
              const days = Math.floor(leadTime.hoursUntilEvent / 24);
              return (
                <div className="flex items-center gap-2 text-[#C6A649] text-[10px] sm:text-xs font-black uppercase tracking-wider sm:tracking-widest bg-[#C6A649]/10 px-4 sm:px-6 py-2 rounded-full border border-[#C6A649]/20 animate-fade-in">
                  <Check size={13} strokeWidth={4} /> {days} {t('días para preparar', 'days to prepare')}
                </div>
              );
            }
            return (
              <div className="flex items-center gap-2 text-amber-500 text-[10px] sm:text-xs font-black uppercase tracking-wider sm:tracking-widest bg-amber-500/10 px-4 sm:px-6 py-2 rounded-full border border-amber-500/20">
                <Clock size={13} strokeWidth={4} />
                {t(`Mínimo ${minLeadTimeHours}h requerido`, `Min ${minLeadTimeHours}h required`)}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default DateTimeStep;
