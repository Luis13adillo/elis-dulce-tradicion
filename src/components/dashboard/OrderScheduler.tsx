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

            // Calculate relative position from startHour
            // Each hour = 64px (h-16), 1 min = 64/60 px
            const hourHeight = 80;
            const minutesOffset = (hours - startHour) * hourHeight + (minutes / 60) * hourHeight;
            const durationHeight = hourHeight; // Default 1 hour duration block

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
            "flex flex-col h-full rounded-2xl shadow-sm border overflow-hidden font-sans transition-colors",
            darkMode ? "bg-[#1f2937] border-slate-700" : "bg-white border-gray-100"
        )}>
            {/* Header */}
            <div className={cn(
                "flex items-center justify-between p-6 border-b sticky top-0 z-20",
                darkMode ? "bg-[#1f2937] border-slate-700" : "bg-white border-gray-100"
            )}>
                <div className="flex items-center gap-6">
                    <h2 className={cn(
                        "text-2xl font-bold tracking-tight first-letter:capitalize",
                        darkMode ? "text-white" : "text-gray-900"
                    )}>
                        {format(currentDate, 'MMMM, yyyy', { locale })}
                    </h2>

                    <div className={cn("flex rounded-lg p-1", darkMode ? "bg-slate-800" : "bg-gray-100")}>
                        {(['Month', 'Week', 'Day'] as ViewMode[]).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={cn(
                                    "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                                    viewMode === mode
                                        ? (darkMode ? "bg-slate-700 text-white shadow-sm" : "bg-white text-gray-900 shadow-sm")
                                        : (darkMode ? "text-slate-400 hover:text-white" : "text-gray-500 hover:text-gray-900")
                                )}
                            >
                                {t(mode === 'Month' ? 'Mes' : mode === 'Week' ? 'Semana' : 'Día', mode)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className={cn(
                        "flex items-center rounded-lg border",
                        darkMode ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"
                    )}>
                        <Button variant="ghost" size="icon" onClick={() => navigate('prev')} className={cn(
                            "rounded-l-lg",
                            darkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-white text-gray-600"
                        )}>
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <Button variant="ghost" onClick={() => setCurrentDate(new Date())} className={cn(
                            "px-4 font-medium border-x rounded-none h-9",
                            darkMode ? "text-slate-300 hover:bg-slate-700 border-slate-700" : "text-gray-700 hover:bg-white border-gray-200"
                        )}>
                            {t('Hoy', 'Today')}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => navigate('next')} className={cn(
                            "rounded-r-lg",
                            darkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-white text-gray-600"
                        )}>
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Grid Container */}
            <div className={cn("flex-1 overflow-auto", darkMode ? "bg-[#13141f]" : "bg-[#FAFAFA]")}>
                <div className="flex min-w-[800px]">
                    {/* Time Axis (Left) */}
                    <div className={cn(
                        "w-16 flex-shrink-0 border-r sticky left-0 z-10",
                        darkMode ? "bg-[#1f2937] border-slate-700" : "bg-white border-gray-100"
                    )}>
                        <div className={cn("h-20 border-b", darkMode ? "border-slate-700" : "border-gray-100")} /> {/* Header spacer */}
                        {timeSlots.map(hour => (
                            <div key={hour} className="h-20 border-b border-transparent relative flex justify-center">
                                <span className={cn(
                                    "text-xs font-medium absolute -top-2 px-1",
                                    darkMode ? "text-slate-500 bg-[#13141f]" : "text-gray-400 bg-[#FAFAFA]"
                                )}>
                                    {format(set(new Date(), { hours: hour }), 'h aa')}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Columns (Days) */}
                    <div className={cn("flex-1 grid grid-cols-7 divide-x", darkMode ? "divide-slate-700" : "divide-gray-100")}>
                        {weekDays.map(day => {
                            const isToday = isSameDay(day, new Date());
                            const dayOrders = getDayOrders(day);

                            return (
                                <div key={day.toISOString()} className={cn("flex flex-col min-w-[120px] group", darkMode ? "bg-[#1f2937]" : "bg-white")}>
                                    {/* Column Header */}
                                    <div className={cn(
                                        "h-20 p-3 flex flex-col items-center justify-center border-b sticky top-0 z-10",
                                        darkMode ? "bg-[#1f2937] border-slate-700" : "bg-white border-gray-100",
                                        isToday && (darkMode ? "bg-green-900/10" : "bg-green-50/50")
                                    )}>
                                        <span className={cn(
                                            "text-xs font-medium mb-1",
                                            isToday ? "text-green-500" : (darkMode ? "text-slate-500" : "text-gray-500")
                                        )}>
                                            {format(day, 'EEEE', { locale })}
                                        </span>
                                        <div className={cn(
                                            "h-10 w-10 flex items-center justify-center rounded-full text-xl font-bold transition-all",
                                            isToday
                                                ? "bg-green-600 text-white shadow-md shadow-green-600/20"
                                                : (darkMode ? "text-white group-hover:bg-slate-800" : "text-gray-900 group-hover:bg-gray-50")
                                        )}>
                                            {format(day, 'd')}
                                        </div>
                                    </div>

                                    {/* Order Blocks Grid */}
                                    <div className={cn("flex-1 relative", darkMode ? "bg-[#1f2937]" : "bg-white")}>
                                        {/* Grid Lines */}
                                        {timeSlots.map(hour => (
                                            <div key={hour} className={cn("h-20 border-b", darkMode ? "border-slate-800" : "border-gray-50")} />
                                        ))}

                                        {/* Events */}
                                        {dayOrders.map(({ order, top, height }) => (
                                            <motion.div
                                                key={order.id}
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className={cn(
                                                    "absolute left-1 right-1 rounded-lg p-3 text-xs border cursor-pointer hover:brightness-110 transition-all shadow-sm flex flex-col gap-1 overflow-hidden",
                                                    // Assign colors based on status/theme roughly matching reference variety
                                                    order.status === 'confirmed' ? "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-300" :
                                                        order.status === 'ready' ? "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-300" :
                                                            "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-300"
                                                )}
                                                style={{ top: top, height: height - 4 }} // -4 for gap
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
        </div>
    );
}
