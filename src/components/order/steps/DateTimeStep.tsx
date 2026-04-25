/* eslint-disable @typescript-eslint/no-explicit-any */
import { useLanguage } from '@/contexts/LanguageContext';
import { validateLeadTime } from '@/lib/validation';
import { formatTimeDisplay } from './orderStepConstants';
import { Check, Clock, Calendar, Sun, Sunset, Moon } from 'lucide-react';
import { useMemo, useRef } from 'react';

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

const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDays = (d: Date, n: number) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};

const capFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const groupTimes = (times: string[]) => {
  const morning: string[] = [];
  const afternoon: string[] = [];
  const evening: string[] = [];
  for (const t of times) {
    const h = parseInt(t.split(':')[0], 10);
    if (h < 12) morning.push(t);
    else if (h < 17) afternoon.push(t);
    else evening.push(t);
  }
  return { morning, afternoon, evening };
};

const DateTimeStep = ({
  dateNeeded,
  timeNeeded,
  timeOptions,
  minLeadTimeHours = 48,
  maxAdvanceDays = 90,
  onDateChange,
  onTimeChange,
}: DateTimeStepProps) => {
  const { t, language } = useLanguage();
  const locale = language === 'es' ? 'es' : 'en-US';
  const dateInputRef = useRef<HTMLInputElement>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const minDate = ymd(today);
  const maxDate = ymd(addDays(today, maxAdvanceDays));

  // Avoid timezone shift when displaying YYYY-MM-DD strings
  const selectedDate = dateNeeded ? new Date(dateNeeded + 'T12:00:00') : null;

  // Compute the earliest valid pickup day given the lead-time gate.
  // Used both to show a smart "Earliest" chip and a "Weekend" chip.
  const earliestValidDay = useMemo(() => {
    const minMs = Date.now() + minLeadTimeHours * 60 * 60 * 1000;
    const probe = new Date(today);
    // walk forward until end-of-day passes the lead-time threshold
    while (probe.getTime() + 24 * 60 * 60 * 1000 <= minMs) {
      probe.setDate(probe.getDate() + 1);
    }
    return probe;
  }, [today, minLeadTimeHours]);

  const nextWeekend = useMemo(() => {
    const probe = new Date(earliestValidDay);
    while (probe.getDay() !== 6) probe.setDate(probe.getDate() + 1);
    return probe;
  }, [earliestValidDay]);

  const chipLabel = (d: Date) => {
    const weekday = capFirst(d.toLocaleDateString(locale, { weekday: 'short' })).replace('.', '');
    return `${weekday} ${d.getDate()}`;
  };

  const quickPicks = useMemo(() => {
    const picks: { key: string; label: string; date: Date }[] = [
      { key: 'earliest', label: chipLabel(earliestValidDay), date: earliestValidDay },
    ];
    if (ymd(nextWeekend) !== ymd(earliestValidDay)) {
      picks.push({ key: 'weekend', label: chipLabel(nextWeekend), date: nextWeekend });
    }
    const oneWeek = addDays(earliestValidDay, 7);
    if (ymd(oneWeek) !== ymd(nextWeekend)) {
      picks.push({ key: 'oneweek', label: chipLabel(oneWeek), date: oneWeek });
    }
    return picks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earliestValidDay, nextWeekend, locale]);

  const openPicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    if ('showPicker' in el && typeof (el as any).showPicker === 'function') {
      try {
        (el as any).showPicker();
        return;
      } catch {
        /* fall through */
      }
    }
    el.click();
  };

  const dayOfWeek = selectedDate
    ? capFirst(selectedDate.toLocaleDateString(locale, { weekday: 'long' }))
    : null;
  const monthDayLong = selectedDate
    ? capFirst(selectedDate.toLocaleDateString(locale, { month: 'long', day: 'numeric' }))
    : null;

  const groupedTimes = groupTimes(timeOptions);
  const periodMeta = {
    morning: { icon: Sun, label: t('Mañana', 'Morning') },
    afternoon: { icon: Sunset, label: t('Tarde', 'Afternoon') },
    evening: { icon: Moon, label: t('Noche', 'Evening') },
  } as const;
  const orderedPeriods = ['morning', 'afternoon', 'evening'] as const;

  return (
    <div className="space-y-6 sm:space-y-7">
      {/* DATE HERO CARD */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={openPicker}
          className={`w-full relative overflow-hidden rounded-2xl sm:rounded-3xl p-4 sm:p-6 border transition-all text-left active:scale-[0.99] ${
            selectedDate
              ? 'bg-gradient-to-br from-[#C6A649]/25 via-[#C6A649]/8 to-transparent border-[#C6A649]/50 shadow-[0_0_30px_rgba(198,166,73,0.18)]'
              : 'bg-white/5 border-white/10 hover:border-[#C6A649]/30 hover:bg-white/10'
          }`}
        >
          <div className="flex items-center justify-between gap-3 relative z-10">
            <div className="flex-1 min-w-0">
              <div className="text-[9px] sm:text-[10px] font-black text-[#C6A649] uppercase tracking-[0.3em] mb-1.5">
                {selectedDate
                  ? t('Día de Entrega', 'Pickup Day')
                  : t('Selecciona una Fecha', 'Choose a Date')}
              </div>
              {selectedDate ? (
                <>
                  <div className="text-2xl sm:text-3xl font-black text-white leading-tight tracking-tight truncate">
                    {dayOfWeek}
                  </div>
                  <div className="text-sm sm:text-base font-medium text-gray-300 leading-tight font-serif italic mt-0.5">
                    {monthDayLong}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg sm:text-xl font-black text-white leading-tight tracking-tight">
                    {t('Toca para elegir', 'Tap to choose')}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-400 leading-tight mt-1">
                    {t(
                      `Mínimo ${minLeadTimeHours}h de anticipación`,
                      `Minimum ${minLeadTimeHours}h lead time`
                    )}
                  </div>
                </>
              )}
            </div>
            <div
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center flex-shrink-0 border ${
                selectedDate
                  ? 'bg-[#C6A649] text-black border-[#C6A649] shadow-[0_0_20px_rgba(198,166,73,0.4)]'
                  : 'bg-[#C6A649]/15 text-[#C6A649] border-[#C6A649]/30 animate-pulse'
              }`}
            >
              <Calendar size={20} strokeWidth={2.5} />
            </div>
          </div>

          <input
            ref={dateInputRef}
            type="date"
            min={minDate}
            max={maxDate}
            value={dateNeeded}
            onChange={(e) => onDateChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label={t('Fecha de entrega', 'Pickup date')}
          />
        </button>

        {/* QUICK DATE CHIPS */}
        {quickPicks.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] flex-shrink-0">
              {t('Rápido', 'Quick')}
            </span>
            <div className="flex gap-2 flex-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {quickPicks.map((p) => {
                const isSelected = ymd(p.date) === dateNeeded;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => onDateChange(ymd(p.date))}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all border ${
                      isSelected
                        ? 'bg-[#C6A649] text-black border-[#C6A649]'
                        : 'bg-white/5 border-white/10 text-gray-300 hover:border-[#C6A649]/40 hover:text-white active:scale-95'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* DIVIDER WITH LABEL */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <span className="text-[9px] sm:text-[10px] font-black text-gray-300 uppercase tracking-[0.35em]">
          {t('Hora de Entrega', 'Pickup Time')}
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      </div>

      {/* TIME GRID — grouped by period */}
      {!dateNeeded && (
        <div className="text-center text-[11px] sm:text-xs text-gray-500 italic font-serif -mt-2">
          {t('Primero elige una fecha arriba', 'Pick a date above first')}
        </div>
      )}

      <div
        className={`space-y-4 sm:space-y-5 transition-all duration-300 ${
          dateNeeded ? 'opacity-100' : 'opacity-40 pointer-events-none'
        }`}
      >
        {orderedPeriods.map((period) => {
          const slots = groupedTimes[period];
          if (slots.length === 0) return null;
          const Icon = periodMeta[period].icon;
          return (
            <div key={period} className="space-y-2 sm:space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <Icon size={12} strokeWidth={3} className="text-[#C6A649]/70" />
                <span className="text-[10px] sm:text-xs font-black text-gray-300 uppercase tracking-[0.25em]">
                  {periodMeta[period].label}
                </span>
                <div className="flex-1 h-px bg-white/5 ml-1" />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {slots.map((time) => {
                  const isSelected = timeNeeded === time;
                  return (
                    <button
                      key={time}
                      type="button"
                      onClick={() => onTimeChange(time)}
                      className={`py-3 sm:py-3.5 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-black transition-all border ${
                        isSelected
                          ? 'bg-[#C6A649] text-black border-[#C6A649] shadow-[0_0_20px_rgba(198,166,73,0.4)] scale-[1.04]'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:border-[#C6A649]/30 hover:bg-white/10 hover:text-white active:scale-95'
                      }`}
                    >
                      {formatTimeDisplay(time)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* LEAD TIME CONFIRMATION */}
      {dateNeeded && timeNeeded && (
        <div className="flex justify-center pt-1">
          {(() => {
            const leadTime = validateLeadTime(dateNeeded, timeNeeded, minLeadTimeHours);
            if (leadTime.isValid && leadTime.hoursUntilEvent) {
              const days = Math.floor(leadTime.hoursUntilEvent / 24);
              if (days > 0) {
                const dayLabel = days === 1 ? t('día', 'day') : t('días', 'days');
                return (
                  <div className="flex items-center gap-2 text-[#C6A649] text-[10px] sm:text-xs font-black uppercase tracking-wider bg-[#C6A649]/10 px-4 sm:px-5 py-2 rounded-full border border-[#C6A649]/25 animate-fade-in">
                    <Check size={13} strokeWidth={4} />
                    {`${days} ${dayLabel} ${t('para preparar', 'to prepare')}`}
                  </div>
                );
              }
              return (
                <div className="flex items-center gap-2 text-[#C6A649] text-[10px] sm:text-xs font-black uppercase tracking-wider bg-[#C6A649]/10 px-4 sm:px-5 py-2 rounded-full border border-[#C6A649]/25">
                  <Check size={13} strokeWidth={4} />
                  {t('Listo para hoy', 'Ready today')}
                </div>
              );
            }
            return (
              <div className="flex items-center gap-2 text-amber-400 text-[10px] sm:text-xs font-black uppercase tracking-wider bg-amber-500/10 px-4 sm:px-5 py-2 rounded-full border border-amber-500/25">
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
