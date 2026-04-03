import { useState, useMemo } from 'react';
import { format, startOfWeek, addDays, isSameDay, startOfMonth, endOfMonth, getDay, addMonths, set, isSameMonth } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import { useLanguage } from '@/contexts/LanguageContext';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Order } from '@/types/order';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface OwnerCalendarProps {
    orders: Order[];
    onOrderClick?: (order: Order) => void;
    businessStartHour?: number;
    businessEndHour?: number;
    maxDailyCapacity?: number;
}

type ViewMode = 'Month' | 'Week' | 'Day';

export function OwnerCalendar({ orders, onOrderClick, businessStartHour, businessEndHour, maxDailyCapacity }: OwnerCalendarProps) {
    const { t, language } = useLanguage();
    const locale = language === 'es' ? es : enUS;

    // State
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<ViewMode>('Week');
    const [expandedDate, setExpandedDate] = useState<string | null>(null);

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

        // Generate enough weeks to cover the month
        for (let w = 0; w < 6; w++) {
            const week: Date[] = [];
            for (let d = 0; d < 7; d++) {
                week.push(day);
                day = addDays(day, 1);
            }
            weeks.push(week);
            // Stop if we've passed the end of the month and finished the week
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

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden font-sans">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-white sticky top-0 z-20">
                <div className="flex items-center gap-6">
                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight first-letter:capitalize">
                        {format(currentDate, viewMode === 'Day' ? 'EEEE, MMMM d, yyyy' : 'MMMM, yyyy', { locale })}
                    </h2>

                    <div className="flex bg-gray-100 rounded-lg p-1">
                        {(['Month', 'Week', 'Day'] as ViewMode[]).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={cn(
                                    "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                                    viewMode === mode
                                        ? "bg-white text-gray-900 shadow-sm"
                                        : "text-gray-500 hover:text-gray-900"
                                )}
                            >
                                {t(mode === 'Month' ? 'Mes' : mode === 'Week' ? 'Semana' : 'Día', mode)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200">
                        <Button variant="ghost" size="icon" onClick={() => navigate('prev')} className="hover:bg-white rounded-l-lg text-gray-600">
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <Button variant="ghost" onClick={() => setCurrentDate(new Date())} className="px-4 font-medium text-gray-700 hover:bg-white border-x border-gray-200 rounded-none h-9">
                            {t('Hoy', 'Today')}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => navigate('next')} className="hover:bg-white rounded-r-lg text-gray-600">
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* --- MONTH VIEW --- */}
            {viewMode === 'Month' && (
                <div className="flex-1 overflow-auto p-4">
                    {/* Day-of-week headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {[1, 2, 3, 4, 5, 6, 0].map(dow => (
                            <div key={dow} className="text-center text-xs font-semibold text-gray-400 uppercase py-2">
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
                                    const isExpanded = expandedDate === dateKey;
                                    const fillPct = maxDailyCapacity && counts && counts.total > 0
                                        ? Math.min(100, (counts.total / maxDailyCapacity) * 100)
                                        : 0;
                                    const barColor = fillPct >= 80 ? 'bg-red-500' : fillPct >= 50 ? 'bg-yellow-500' : 'bg-green-500';

                                    return (
                                        <button
                                            key={dateKey}
                                            onClick={() => setExpandedDate(isExpanded ? null : dateKey)}
                                            className={cn(
                                                "relative min-h-[80px] p-2 rounded-xl border transition-all text-left hover:border-[#C6A649]/40",
                                                isCurrentMonth ? "bg-white border-gray-100" : "bg-gray-50/50 border-transparent",
                                                isToday && "ring-2 ring-[#C6A649]/30",
                                                isPast && "opacity-40",
                                                isExpanded && "bg-amber-50 border-amber-200"
                                            )}
                                        >
                                            <span className={cn(
                                                "text-sm font-bold",
                                                isToday ? "text-[#C6A649]" : isCurrentMonth ? "text-gray-900" : "text-gray-300"
                                            )}>
                                                {format(day, 'd')}
                                            </span>
                                            {counts && counts.total > 0 && (
                                                <div className="mt-1 space-y-0.5">
                                                    <span className="text-xs font-bold text-gray-600">
                                                        {counts.total} {counts.total === 1 ? t('pedido', 'order') : t('pedidos', 'orders')}
                                                    </span>
                                                    {maxDailyCapacity && (
                                                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                                                            <div
                                                                className={cn('h-1.5 rounded-full transition-all', barColor)}
                                                                style={{ width: `${fillPct}%` }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    {/* Expanded Day Order Panel */}
                    {expandedDate && (() => {
                        const dayOrders = orders.filter(o => o.date_needed === expandedDate);
                        if (dayOrders.length === 0) return null;
                        return (
                            <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                <h4 className="text-sm font-bold text-gray-700 mb-3">
                                    {format(new Date(expandedDate + 'T12:00:00'), 'MMMM d', { locale })} — {dayOrders.length} {t('pedidos', 'orders')}
                                </h4>
                                <div className="space-y-2">
                                    {dayOrders.map(order => (
                                        <div
                                            key={order.id}
                                            className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100 cursor-pointer hover:border-[#C6A649] transition-colors"
                                            onClick={() => onOrderClick?.(order)}
                                        >
                                            <div>
                                                <p className="text-sm font-semibold text-gray-800">{order.customer_name}</p>
                                                <p className="text-xs text-gray-500">{order.time_needed} · {order.cake_size} · {order.filling}</p>
                                            </div>
                                            <span className={cn(
                                                "text-xs px-2 py-0.5 rounded-full font-medium",
                                                order.status === 'ready' ? "bg-green-100 text-green-700" :
                                                order.status === 'cancelled' ? "bg-red-100 text-red-700" :
                                                "bg-amber-100 text-amber-700"
                                            )}>
                                                {order.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* --- WEEK VIEW --- */}
            {viewMode === 'Week' && (
                <div className="flex-1 overflow-auto bg-[#FAFAFA]">
                    <div className="flex min-w-[800px]">
                        {/* Time Axis (Left) */}
                        <div className="w-16 flex-shrink-0 bg-white border-r border-gray-100 sticky left-0 z-10">
                            <div className="h-20 border-b border-gray-100" />
                            {timeSlots.map(hour => (
                                <div key={hour} className="h-20 border-b border-transparent relative flex justify-center">
                                    <span className="text-xs font-medium text-gray-400 absolute -top-2 bg-[#FAFAFA] px-1">
                                        {format(set(new Date(), { hours: hour }), 'h aa')}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Columns (Days) */}
                        <div className="flex-1 grid grid-cols-7 divide-x divide-gray-100">
                            {weekDays.map(day => {
                                const isToday = isSameDay(day, new Date());
                                const dayOrd = getDayOrders(day);

                                return (
                                    <div key={day.toISOString()} className="flex flex-col min-w-[120px] bg-white group">
                                        {/* Column Header */}
                                        <div className={cn(
                                            "h-20 p-3 flex flex-col items-center justify-center border-b border-gray-100 sticky top-0 bg-white z-10",
                                            isToday && "bg-orange-50/50"
                                        )}>
                                            <span className={cn(
                                                "text-xs font-medium mb-1",
                                                isToday ? "text-[#C6A649]" : "text-gray-500"
                                            )}>
                                                {format(day, 'EEEE', { locale })}
                                            </span>
                                            <div className={cn(
                                                "h-10 w-10 flex items-center justify-center rounded-full text-xl font-bold transition-all",
                                                isToday
                                                    ? "bg-[#C6A649] text-white shadow-md shadow-[#C6A649]/20"
                                                    : "text-gray-900 group-hover:bg-gray-50"
                                            )}>
                                                {format(day, 'd')}
                                            </div>
                                        </div>

                                        {/* Order Blocks Grid */}
                                        <div className="flex-1 relative bg-white">
                                            {timeSlots.map(hour => (
                                                <div key={hour} className="h-20 border-b border-gray-50" />
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
                <div className="flex-1 overflow-auto bg-[#FAFAFA]">
                    <div className="flex min-w-[400px]">
                        {/* Time Axis */}
                        <div className="w-16 flex-shrink-0 bg-white border-r border-gray-100 sticky left-0 z-10">
                            {timeSlots.map(hour => (
                                <div key={hour} className="h-20 border-b border-transparent relative flex justify-center">
                                    <span className="text-xs font-medium text-gray-400 absolute -top-2 bg-[#FAFAFA] px-1">
                                        {format(set(new Date(), { hours: hour }), 'h aa')}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Single Day Column */}
                        <div className="flex-1 relative bg-white">
                            {timeSlots.map(hour => (
                                <div key={hour} className="h-20 border-b border-gray-50" />
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
                                <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
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
