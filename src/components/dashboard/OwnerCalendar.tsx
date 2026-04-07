import { useState, useMemo } from 'react';
import { format, startOfWeek, addDays, isSameDay, startOfMonth, endOfMonth, addMonths, set, isSameMonth } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import { useLanguage } from '@/contexts/LanguageContext';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Order } from '@/types/order';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface OwnerCalendarProps {
    orders: Order[];
    onOrderClick?: (order: Order) => void;
    businessStartHour?: number;
    businessEndHour?: number;
    maxDailyCapacity?: number;
    darkMode?: boolean;
}

type ViewMode = 'Month' | 'Week' | 'Day';

export function OwnerCalendar({ orders, onOrderClick, businessStartHour, businessEndHour, maxDailyCapacity, darkMode = false }: OwnerCalendarProps) {
    const { t, language } = useLanguage();
    const locale = language === 'es' ? es : enUS;

    // State
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<ViewMode>('Week');

    // Use business hours with fallback to defaults
    const startHour = businessStartHour ?? 6;
    const endHour = businessEndHour ?? 22;
    const timeSlots = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

    // Helper to get week days
    const weekDays = useMemo(() => {
        const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
        return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }, [currentDate]);

    // Count orders per date (for Month view)
    const orderCountByDate = useMemo(() => {
        const counts = new Map<string, { total: number, pending: number, ready: number, other: number }>();
        orders.forEach(order => {
            if (!order.date_needed) return;
            const key = order.date_needed;
            if (!counts.has(key)) counts.set(key, { total: 0, pending: 0, ready: 0, other: 0 });
            const entry = counts.get(key)!;
            entry.total++;
            if (order.status === 'pending' || order.status === 'confirmed') entry.pending++;
            else if (order.status === 'ready' || order.status === 'completed' || order.status === 'delivered') entry.ready++;
            else entry.other++;
        });
        return counts;
    }, [orders]);

    // Filter orders for the current week
    const weeklyOrders = useMemo(() => {
        return orders.filter(order => {
            if (!order.date_needed) return false;
            const orderDate = new Date(order.date_needed + 'T00:00:00');
            const start = weekDays[0];
            const end = addDays(weekDays[6], 1);
            return orderDate >= start && orderDate < end;
        });
    }, [orders, weekDays]);

    // Group orders by day and calculate position
    const processedOrders = useMemo(() => {
        const map = new Map<string, Array<{ order: Order, top: number, height: number }>>();

        weeklyOrders.forEach(order => {
            if (!order.date_needed || !order.time_needed) return;

            const dateKey = order.date_needed;
            const [hours, minutes] = order.time_needed.split(':').map(Number);

            const hourHeight = 80;
            const minutesOffset = (hours - startHour) * hourHeight + (minutes / 60) * hourHeight;
            const durationHeight = hourHeight;

            if (!map.has(dateKey)) {
                map.set(dateKey, []);
            }
            map.get(dateKey)?.push({ order, top: minutesOffset, height: durationHeight });
        });
        return map;
    }, [weeklyOrders, startHour]);

    const navigate = (direction: 'prev' | 'next') => {
        if (viewMode === 'Month') {
            setCurrentDate(prev => addMonths(prev, direction === 'next' ? 1 : -1));
        } else if (viewMode === 'Week') {
            setCurrentDate(prev => addDays(prev, direction === 'next' ? 7 : -7));
        } else if (viewMode === 'Day') {
            setCurrentDate(prev => addDays(prev, direction === 'next' ? 1 : -1));
        }
    };

    const getDayOrders = (date: Date) => {
        const key = format(date, 'yyyy-MM-dd');
        return processedOrders.get(key) || [];
    };

    // Month view: generate calendar grid (6 weeks x 7 days)
    const monthGrid = useMemo(() => {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });

        const weeks: Date[][] = [];
        let day = calendarStart;

        for (let w = 0; w < 6; w++) {
            const week: Date[] = [];
            for (let d = 0; d < 7; d++) {
                week.push(day);
                day = addDays(day, 1);
            }
            weeks.push(week);
            if (day > monthEnd && w >= 3) break;
        }

        return weeks;
    }, [currentDate]);

    // Day view: filter orders for selected day
    const dayOrders = useMemo(() => {
        const dateKey = format(currentDate, 'yyyy-MM-dd');
        return orders
            .filter(o => o.date_needed === dateKey && o.time_needed)
            .map(order => {
                const [hours, minutes] = (order.time_needed || '12:00').split(':').map(Number);
                const hourHeight = 80;
                const top = (hours - startHour) * hourHeight + (minutes / 60) * hourHeight;
                return { order, top, height: hourHeight };
            });
    }, [orders, currentDate, startHour]);

    // Dark mode color helpers
    const bg = darkMode ? "bg-[#1f2937]" : "bg-white";
    const deepBg = darkMode ? "bg-[#13141f]" : "bg-[#FAFAFA]";
    const border = darkMode ? "border-slate-700" : "border-gray-100";
    const divideColor = darkMode ? "divide-slate-700" : "divide-gray-100";
    const titleColor = darkMode ? "text-white" : "text-gray-900";
    const mutedText = darkMode ? "text-slate-400" : "text-gray-500";
    const subText = darkMode ? "text-slate-500" : "text-gray-400";

    return (
        <div className={cn("flex flex-col h-full rounded-2xl shadow-sm border overflow-hidden font-sans transition-colors duration-300", bg, border)}>
            {/* Header */}
            <div className={cn("flex items-center justify-between p-6 border-b sticky top-0 z-20 transition-colors", bg, border)}>
                <div className="flex items-center gap-6">
                    <h2 className={cn("text-2xl font-bold tracking-tight first-letter:capitalize", titleColor)}>
                        {format(currentDate, viewMode === 'Day' ? 'EEEE, MMMM d, yyyy' : 'MMMM, yyyy', { locale })}
                    </h2>

                    <div className={cn("flex rounded-lg p-1", darkMode ? "bg-slate-700" : "bg-gray-100")}>
                        {(['Month', 'Week', 'Day'] as ViewMode[]).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={cn(
                                    "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                                    viewMode === mode
                                        ? darkMode ? "bg-slate-600 text-white shadow-sm" : "bg-white text-gray-900 shadow-sm"
                                        : darkMode ? "text-slate-400 hover:text-white" : "text-gray-500 hover:text-gray-900"
                                )}
                            >
                                {t(mode === 'Month' ? 'Mes' : mode === 'Week' ? 'Semana' : 'Día', mode)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className={cn("flex items-center rounded-lg border", darkMode ? "bg-slate-700 border-slate-600" : "bg-gray-50 border-gray-200")}>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate('prev')}
                            className={cn("hover:bg-opacity-80 rounded-l-lg", darkMode ? "text-slate-300 hover:bg-slate-600" : "text-gray-600 hover:bg-white")}
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setCurrentDate(new Date())}
                            className={cn("px-4 font-medium border-x rounded-none h-9", darkMode ? "text-slate-300 border-slate-600 hover:bg-slate-600" : "text-gray-700 border-gray-200 hover:bg-white")}
                        >
                            {t('Hoy', 'Today')}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate('next')}
                            className={cn("hover:bg-opacity-80 rounded-r-lg", darkMode ? "text-slate-300 hover:bg-slate-600" : "text-gray-600 hover:bg-white")}
                        >
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* --- MONTH VIEW --- */}
            {viewMode === 'Month' && (
                <div className={cn("flex-1 overflow-auto p-4", deepBg)}>
                    {/* Day-of-week headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {[1, 2, 3, 4, 5, 6, 0].map(dow => (
                            <div key={dow} className={cn("text-center text-xs font-semibold uppercase py-2", subText)}>
                                {format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), dow === 0 ? 6 : dow - 1), 'EEE', { locale })}
                            </div>
                        ))}
                    </div>
                    {/* Weeks */}
                    <div className="grid gap-1">
                        {monthGrid.map((week, wi) => (
                            <div key={wi} className="grid grid-cols-7 gap-1">
                                {week.map(day => {
                                    const dateKey = format(day, 'yyyy-MM-dd');
                                    const counts = orderCountByDate.get(dateKey);
                                    const isCurrentMonth = isSameMonth(day, currentDate);
                                    const isToday = isSameDay(day, new Date());
                                    const today = new Date();
                                    const isPast = isCurrentMonth && !isToday && day < today;
                                    const dayOrders = orders.filter(o => o.date_needed === dateKey);

                                    // Gold intensity: 0 orders = transparent, max orders = deep gold
                                    const maxForScale = maxDailyCapacity || 10;
                                    const intensity = counts && counts.total > 0
                                        ? Math.min(1, counts.total / maxForScale)
                                        : 0;
                                    // Interpolate from light gold (opacity 0.08) to deep gold (opacity 0.55)
                                    const goldOpacity = intensity > 0 ? 0.08 + intensity * 0.47 : 0;

                                    return (
                                        <Popover key={dateKey}>
                                            <PopoverTrigger asChild>
                                                <button
                                                    disabled={!isCurrentMonth || dayOrders.length === 0}
                                                    className={cn(
                                                        "relative min-h-[76px] p-2 rounded-xl border transition-all text-left",
                                                        isCurrentMonth
                                                            ? darkMode ? "border-slate-700 hover:border-[#C6A649]/50" : "border-gray-100 hover:border-[#C6A649]/40"
                                                            : darkMode ? "border-transparent opacity-30" : "border-transparent opacity-30",
                                                        isToday && (darkMode ? "ring-2 ring-[#C6A649]/50" : "ring-2 ring-[#C6A649]/40"),
                                                        isPast && "opacity-50",
                                                        dayOrders.length > 0 && "cursor-pointer"
                                                    )}
                                                    style={{
                                                        backgroundColor: goldOpacity > 0
                                                            ? `rgba(198,166,73,${goldOpacity})`
                                                            : undefined
                                                    }}
                                                >
                                                    <span className={cn(
                                                        "text-sm font-bold",
                                                        isToday ? "text-[#C6A649]" :
                                                        isCurrentMonth ? (darkMode ? "text-slate-200" : "text-gray-900") :
                                                        darkMode ? "text-slate-600" : "text-gray-300"
                                                    )}>
                                                        {format(day, 'd')}
                                                    </span>
                                                    {counts && counts.total > 0 && (
                                                        <div className="mt-1.5">
                                                            <span className={cn(
                                                                "inline-flex items-center justify-center rounded-full text-[10px] font-black px-1.5 py-0.5 min-w-[20px]",
                                                                intensity >= 0.8
                                                                    ? "bg-[#C6A649] text-white"
                                                                    : darkMode
                                                                        ? "bg-[#C6A649]/20 text-[#C6A649]"
                                                                        : "bg-[#C6A649]/15 text-[#9a7d30]"
                                                            )}>
                                                                {counts.total}
                                                            </span>
                                                        </div>
                                                    )}
                                                </button>
                                            </PopoverTrigger>
                                            {dayOrders.length > 0 && (
                                                <PopoverContent
                                                    className={cn(
                                                        "w-72 p-0 rounded-xl border shadow-xl overflow-hidden",
                                                        darkMode ? "bg-[#1f2937] border-slate-700" : "bg-white border-gray-100"
                                                    )}
                                                    align="center"
                                                    side="bottom"
                                                >
                                                    <div className={cn("px-4 py-3 border-b", darkMode ? "border-slate-700" : "border-gray-100")}>
                                                        <p className={cn("text-sm font-bold", darkMode ? "text-white" : "text-gray-800")}>
                                                            {format(new Date(dateKey + 'T12:00:00'), 'MMMM d', { locale })}
                                                        </p>
                                                        <p className={cn("text-xs mt-0.5", darkMode ? "text-slate-400" : "text-gray-500")}>
                                                            {dayOrders.length} {dayOrders.length === 1 ? t('pedido', 'order') : t('pedidos', 'orders')}
                                                        </p>
                                                    </div>
                                                    <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
                                                        {dayOrders.map(order => (
                                                            <button
                                                                key={order.id}
                                                                className={cn(
                                                                    "w-full flex items-center justify-between px-4 py-3 text-left transition-colors",
                                                                    darkMode
                                                                        ? "hover:bg-slate-700/50 divide-slate-700"
                                                                        : "hover:bg-amber-50/60"
                                                                )}
                                                                onClick={() => onOrderClick?.(order)}
                                                            >
                                                                <div className="min-w-0">
                                                                    <p className={cn("text-sm font-semibold truncate", darkMode ? "text-white" : "text-gray-800")}>
                                                                        {order.customer_name}
                                                                    </p>
                                                                    <p className={cn("text-xs truncate mt-0.5", darkMode ? "text-slate-400" : "text-gray-500")}>
                                                                        {order.time_needed && `${order.time_needed} · `}{order.cake_size}
                                                                    </p>
                                                                </div>
                                                                <span className={cn(
                                                                    "ml-3 flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold",
                                                                    order.status === 'ready' || order.status === 'completed' || order.status === 'delivered'
                                                                        ? "bg-green-100 text-green-700"
                                                                        : order.status === 'cancelled'
                                                                            ? "bg-red-100 text-red-700"
                                                                            : "bg-amber-100 text-amber-700"
                                                                )}>
                                                                    {order.status}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </PopoverContent>
                                            )}
                                        </Popover>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* --- WEEK VIEW --- */}
            {viewMode === 'Week' && (
                <div className={cn("flex-1 overflow-auto", deepBg)}>
                    <div className={cn("flex min-w-[800px] divide-x", divideColor)}>
                        {/* Time Axis (Left) */}
                        <div className={cn("w-16 flex-shrink-0 border-r sticky left-0 z-10", bg, border)}>
                            <div className={cn("h-20 border-b", border)} />
                            {timeSlots.map(hour => (
                                <div key={hour} className="h-20 border-b border-transparent relative flex justify-center">
                                    <span className={cn("text-xs font-medium absolute -top-2 px-1", subText, deepBg)}>
                                        {format(set(new Date(), { hours: hour }), 'h aa')}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Columns (Days) */}
                        <div className={cn("flex-1 grid grid-cols-7 divide-x", divideColor)}>
                            {weekDays.map(day => {
                                const isToday = isSameDay(day, new Date());
                                const dayOrd = getDayOrders(day);

                                return (
                                    <div key={day.toISOString()} className={cn("flex flex-col min-w-[120px] group", bg)}>
                                        {/* Column Header */}
                                        <div className={cn(
                                            "h-20 p-3 flex flex-col items-center justify-center border-b sticky top-0 z-10",
                                            border,
                                            bg,
                                            isToday && (darkMode ? "bg-[#C6A649]/10" : "bg-orange-50/50")
                                        )}>
                                            <span className={cn(
                                                "text-xs font-medium mb-1",
                                                isToday ? "text-[#C6A649]" : mutedText
                                            )}>
                                                {format(day, 'EEEE', { locale })}
                                            </span>
                                            <div className={cn(
                                                "h-10 w-10 flex items-center justify-center rounded-full text-xl font-bold transition-all",
                                                isToday
                                                    ? "bg-[#C6A649] text-white shadow-md shadow-[#C6A649]/20"
                                                    : darkMode
                                                        ? "text-slate-200 group-hover:bg-slate-700"
                                                        : "text-gray-900 group-hover:bg-gray-50"
                                            )}>
                                                {format(day, 'd')}
                                            </div>
                                        </div>

                                        {/* Order Blocks Grid */}
                                        <div className={cn("flex-1 relative", bg)}>
                                            {timeSlots.map(hour => (
                                                <div key={hour} className={cn("h-20 border-b", darkMode ? "border-slate-800" : "border-gray-50")} />
                                            ))}
                                            {dayOrd.map(({ order, top, height }) => (
                                                <motion.div
                                                    key={order.id}
                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    className={cn(
                                                        "absolute left-1 right-1 rounded-lg p-3 text-xs border cursor-pointer hover:brightness-95 transition-all shadow-sm flex flex-col gap-1 overflow-hidden",
                                                        order.status === 'confirmed' ? "bg-orange-100 border-orange-200 text-orange-900" :
                                                            order.status === 'ready' ? "bg-green-100 border-green-200 text-green-900" :
                                                                "bg-gray-100 border-gray-200 text-gray-900"
                                                    )}
                                                    style={{ top: top, height: height - 4 }}
                                                    onClick={() => onOrderClick?.(order)}
                                                >
                                                    <div className="font-bold truncate">{order.customer_name || 'Customer'}</div>
                                                    <div className="flex items-center gap-1 opacity-80">
                                                        <Clock className="w-3 h-3" />
                                                        <span>{order.time_needed}</span>
                                                    </div>
                                                    <div className="truncate opacity-75">{order.cake_size}</div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* --- DAY VIEW --- */}
            {viewMode === 'Day' && (
                <div className={cn("flex-1 overflow-auto", deepBg)}>
                    <div className="flex min-w-[400px]">
                        {/* Time Axis */}
                        <div className={cn("w-16 flex-shrink-0 border-r sticky left-0 z-10", bg, border)}>
                            {timeSlots.map(hour => (
                                <div key={hour} className="h-20 border-b border-transparent relative flex justify-center">
                                    <span className={cn("text-xs font-medium absolute -top-2 px-1", subText, deepBg)}>
                                        {format(set(new Date(), { hours: hour }), 'h aa')}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Single Day Column */}
                        <div className={cn("flex-1 relative", bg)}>
                            {timeSlots.map(hour => (
                                <div key={hour} className={cn("h-20 border-b", darkMode ? "border-slate-800" : "border-gray-50")} />
                            ))}
                            {dayOrders.map(({ order, top, height }) => (
                                <motion.div
                                    key={order.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className={cn(
                                        "absolute left-2 right-2 rounded-lg p-3 text-sm border cursor-pointer hover:brightness-95 transition-all shadow-sm flex flex-col gap-1 overflow-hidden",
                                        order.status === 'confirmed' ? "bg-orange-100 border-orange-200 text-orange-900" :
                                            order.status === 'ready' ? "bg-green-100 border-green-200 text-green-900" :
                                                "bg-gray-100 border-gray-200 text-gray-900"
                                    )}
                                    style={{ top: top, height: height - 4 }}
                                    onClick={() => onOrderClick?.(order)}
                                >
                                    <div className="font-bold">{order.customer_name || 'Customer'}</div>
                                    <div className="flex items-center gap-2 opacity-80">
                                        <Clock className="w-3 h-3" />
                                        <span>{order.time_needed}</span>
                                        <span>-</span>
                                        <span>{order.cake_size}</span>
                                    </div>
                                </motion.div>
                            ))}
                            {dayOrders.length === 0 && (
                                <div className={cn("absolute inset-0 flex items-center justify-center text-sm", subText)}>
                                    {t('Sin pedidos para este día', 'No orders for this day')}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
