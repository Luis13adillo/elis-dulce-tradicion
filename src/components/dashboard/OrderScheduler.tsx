import { useState, useMemo } from 'react';
import { format, startOfWeek, addDays, isSameDay, parse, addHours, startOfDay, isWithinInterval, set, getHours, getMinutes } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import { useLanguage } from '@/contexts/LanguageContext';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Order } from '@/types/order';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface OrderSchedulerProps {
    orders: Order[];
    onOrderClick?: (order: Order) => void;
    darkMode?: boolean;
    businessStartHour?: number;
    businessEndHour?: number;
}

type ViewMode = 'Month' | 'Week' | 'Day';

export function OrderScheduler({ orders, onOrderClick, darkMode = false, businessStartHour, businessEndHour }: OrderSchedulerProps) {
    const { t, language } = useLanguage();
    const locale = language === 'es' ? es : enUS;

    // State
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<ViewMode>('Week');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    // Constants — use business hours from DB when available, fall back to defaults
    const startHour = businessStartHour ?? 6;
    const endHour = businessEndHour ?? 22;
    const timeSlots = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

    // Helper to get week days
    const weekDays = useMemo(() => {
        const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
        return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }, [currentDate]);

    // Filter orders for the current week
    const weeklyOrders = useMemo(() => {
        return orders.filter(order => {
            if (!order.date_needed) return false;
            const orderDate = new Date(order.date_needed + 'T00:00:00'); // Normalize
            const start = weekDays[0];
            const end = addDays(weekDays[6], 1); // Until end of last day

            // Simple range check (ignoring time for this high level filter)
            return orderDate >= start && orderDate < end;
        });
    }, [orders, weekDays]);

    // Group orders by day and calculate position
    // Returns: { [dateKey]: Array<{ order: Order, top: number, height: number }> }
    const processedOrders = useMemo(() => {
        const map = new Map<string, Array<{ order: Order, top: number, height: number }>>();

        weeklyOrders.forEach(order => {
            if (!order.date_needed || !order.time_needed) return;

            const dateKey = order.date_needed; // YYYY-MM-DD

            // Parse time (e.g., "14:30")
            const [hours, minutes] = order.time_needed.split(':').map(Number);

            const hourHeight = 48;
            const minutesOffset = (hours - startHour) * hourHeight + (minutes / 60) * hourHeight;
            const durationHeight = hourHeight;

            if (!map.has(dateKey)) {
                map.set(dateKey, []);
            }
            map.get(dateKey)?.push({ order, top: minutesOffset, height: durationHeight });
        });
        return map;
    }, [weeklyOrders]);

    const navigate = (direction: 'prev' | 'next') => {
        if (viewMode === 'Week') {
            setCurrentDate(prev => addDays(prev, direction === 'next' ? 7 : -7));
        } else if (viewMode === 'Day') {
            setCurrentDate(prev => addDays(prev, direction === 'next' ? 1 : -1));
        }
    };

    const getDayOrders = (date: Date) => {
        const key = format(date, 'yyyy-MM-dd');
        return processedOrders.get(key) || [];
    };

    return (
        <div className={cn(
            "flex flex-col h-full min-h-0 rounded-2xl shadow-sm border overflow-hidden font-sans transition-colors",
            darkMode ? "bg-[#1f2937] border-slate-700" : "bg-white border-gray-100"
        )}>
            {/* Header */}
            <div className={cn(
                "flex items-center justify-between gap-3 px-4 py-2.5 border-b flex-none",
                darkMode ? "bg-[#1f2937] border-slate-700" : "bg-white border-gray-100"
            )}>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C6A649]" aria-hidden />
                        <h2 className={cn(
                            "text-xl font-display font-semibold tracking-tight first-letter:capitalize",
                            darkMode ? "text-white" : "text-gray-900"
                        )}>
                            {format(currentDate, 'MMMM yyyy', { locale })}
                        </h2>
                    </div>

                    <div className={cn("flex rounded-lg p-0.5", darkMode ? "bg-slate-800" : "bg-gray-100")} role="tablist" aria-label={t('Modo de vista', 'View mode')}>
                        {(['Month', 'Week', 'Day'] as ViewMode[]).map(mode => (
                            <button
                                key={mode}
                                role="tab"
                                aria-selected={viewMode === mode}
                                onClick={() => setViewMode(mode)}
                                className={cn(
                                    "px-3 py-1 text-xs font-sans font-medium rounded-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6A649]",
                                    viewMode === mode
                                        ? (darkMode ? "bg-[#C6A649] text-[#1A1A2E] shadow-sm" : "bg-[#1A1A2E] text-white shadow-sm")
                                        : (darkMode ? "text-slate-400 hover:text-white" : "text-gray-500 hover:text-gray-900")
                                )}
                            >
                                {t(mode === 'Month' ? 'Mes' : mode === 'Week' ? 'Semana' : 'Día', mode)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className={cn(
                        "flex items-center rounded-full border overflow-hidden",
                        darkMode ? "bg-slate-800/60 border-slate-700" : "bg-gray-50 border-gray-200"
                    )}>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate('prev')}
                            aria-label={t('Anterior', 'Previous')}
                            className={cn(
                                "h-8 w-8 rounded-none",
                                darkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-white text-gray-600"
                            )}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setCurrentDate(new Date())}
                            className={cn(
                                "px-3 h-8 text-xs font-sans font-medium border-x rounded-none",
                                darkMode
                                    ? "text-[#C6A649] hover:bg-[#C6A649]/10 border-slate-700"
                                    : "text-[#1A1A2E] hover:bg-white border-gray-200"
                            )}
                        >
                            {t('Hoy', 'Today')}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate('next')}
                            aria-label={t('Siguiente', 'Next')}
                            className={cn(
                                "h-8 w-8 rounded-none",
                                darkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-white text-gray-600"
                            )}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Grid Container */}
            <div
                className={cn("flex-1 min-h-0 overflow-auto", darkMode ? "bg-[#13141f]" : "bg-[#FAFAFA]")}
                role="grid"
                aria-label={t('Calendario de pedidos', 'Order calendar')}
            >
                <div className="flex min-w-[720px]">
                    {/* Time Axis (Left) */}
                    <div className={cn(
                        "w-14 flex-shrink-0 border-r sticky left-0 z-10",
                        darkMode ? "bg-[#1f2937] border-slate-700" : "bg-white border-gray-100"
                    )}>
                        <div className={cn("h-14 border-b", darkMode ? "border-slate-700" : "border-gray-100")} /> {/* Header spacer */}
                        {timeSlots.map(hour => (
                            <div key={hour} className="h-12 border-b border-transparent relative flex justify-center">
                                <span className={cn(
                                    "text-[11px] tabular-nums font-medium absolute -top-2 px-1",
                                    darkMode ? "text-slate-500 bg-[#13141f]" : "text-gray-400 bg-[#FAFAFA]"
                                )}>
                                    {format(set(new Date(), { hours: hour }), 'h aa')}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Columns (Days) */}
                    <div className={cn("flex-1 grid grid-cols-7 divide-x", darkMode ? "divide-slate-700/60" : "divide-gray-100")}>
                        {weekDays.map(day => {
                            const isToday = isSameDay(day, new Date());
                            const dayOrders = getDayOrders(day);

                            return (
                                <div
                                    key={day.toISOString()}
                                    role="columnheader"
                                    aria-current={isToday ? 'date' : undefined}
                                    className={cn("flex flex-col min-w-[96px] group", darkMode ? "bg-[#1f2937]" : "bg-white")}
                                >
                                    {/* Column Header */}
                                    <div className={cn(
                                        "h-14 px-2 py-1.5 flex flex-col items-center justify-center border-b sticky top-0 z-10",
                                        darkMode ? "bg-[#1f2937] border-slate-700" : "bg-white border-gray-100",
                                        isToday && (darkMode ? "bg-[#C6A649]/5" : "bg-[#C6A649]/5")
                                    )}>
                                        <span className={cn(
                                            "text-[10px] uppercase tracking-wider font-semibold mb-0.5",
                                            isToday ? "text-[#C6A649]" : (darkMode ? "text-slate-500" : "text-gray-500")
                                        )}>
                                            {format(day, 'EEE', { locale })}
                                        </span>
                                        <div className={cn(
                                            "h-7 w-7 flex items-center justify-center rounded-full text-sm font-bold tabular-nums transition-all",
                                            isToday
                                                ? "bg-[#C6A649] text-[#1A1A2E] shadow-[0_0_0_3px_rgba(198,166,73,0.18)]"
                                                : (darkMode ? "text-white group-hover:bg-slate-800" : "text-gray-900 group-hover:bg-gray-100")
                                        )}>
                                            {format(day, 'd')}
                                        </div>
                                    </div>

                                    {/* Order Blocks Grid */}
                                    <div className={cn("flex-1 relative", darkMode ? "bg-[#1f2937]" : "bg-white")}>
                                        {/* Grid Lines */}
                                        {timeSlots.map(hour => (
                                            <div key={hour} className={cn("h-12 border-b", darkMode ? "border-slate-800/60" : "border-gray-100/70")} />
                                        ))}

                                        {/* Events */}
                                        {dayOrders.map(({ order, top, height }) => (
                                            <motion.button
                                                key={order.id}
                                                type="button"
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ duration: 0.15 }}
                                                aria-label={`${order.customer_name || 'Customer'} — ${order.time_needed} — ${order.status}`}
                                                className={cn(
                                                    "absolute left-1 right-1 rounded-lg px-1.5 py-1 text-[11px] border cursor-pointer",
                                                    "font-sans font-medium text-left shadow-sm flex flex-col gap-0.5 overflow-hidden",
                                                    "transition-all duration-150 hover:ring-1 hover:ring-[#C6A649]/50 hover:brightness-110",
                                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6A649]",
                                                    "min-h-[28px]",
                                                    order.status === 'confirmed' ? "bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-300" :
                                                        order.status === 'ready' ? "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300" :
                                                            "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300"
                                                )}
                                                style={{ top: top, height: Math.max(height - 4, 28) }}
                                                onClick={() => onOrderClick?.(order)}
                                            >
                                                <div className="font-semibold truncate leading-tight">{order.customer_name || 'Customer'}</div>
                                                <div className="flex items-center gap-1 opacity-80 leading-tight">
                                                    <Clock className="w-2.5 h-2.5" />
                                                    <span className="tabular-nums">{order.time_needed}</span>
                                                </div>
                                                {height > 40 && (
                                                    <div className="truncate opacity-75 leading-tight">{order.cake_size}</div>
                                                )}
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
