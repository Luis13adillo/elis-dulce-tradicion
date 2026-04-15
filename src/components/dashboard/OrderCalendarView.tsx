import { useState, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Order } from '@/types/order';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useLanguage } from '@/contexts/LanguageContext';
import { Clock, Calendar as CalendarIcon } from 'lucide-react';

interface OrderCalendarViewProps {
    orders: Order[];
    onOrderClick?: (order: Order) => void;
    variant?: 'default' | 'kitchen';
}

export function OrderCalendarView({ orders, onOrderClick, variant = 'default' }: OrderCalendarViewProps) {
    const { t, language } = useLanguage();
    const [date, setDate] = useState<Date | undefined>(new Date());

    // Function to determine if a date has orders
    const ordersByDate = useMemo(() => {
        const map = new Map<string, Order[]>();
        orders.forEach(order => {
            const dateKey = order.date_needed;
            if (!map.has(dateKey)) {
                map.set(dateKey, []);
            }
            map.get(dateKey)?.push(order);
        });
        return map;
    }, [orders]);

    const selectedDateOrders = useMemo(() => {
        if (!date) return [];
        const dateKey = format(date, 'yyyy-MM-dd');
        return ordersByDate.get(dateKey) || [];
    }, [date, ordersByDate]);

    // Modifiers for the calendar to show dots/indicators
    const modifiers = {
        hasOrders: (d: Date) => ordersByDate.has(format(d, 'yyyy-MM-dd')),
    };

    const modifiersStyles = {
        hasOrders: {
            fontWeight: 'bold',
            textDecoration: 'underline',
            color: variant === 'kitchen' ? '#a855f7' : 'var(--primary)', // Purple for kitchen
        }
    };

    const cardClass = variant === 'kitchen'
        ? "bg-[#111827] border-slate-700 text-white shadow-none"
        : "h-fit";

    const textClass = variant === 'kitchen' ? 'text-slate-400' : 'text-muted-foreground';

    return (
        <div className="grid grid-cols-1 md:grid-cols-[350px_1fr] gap-6">
            <Card className={`${cardClass} h-fit`}>
                <CardHeader>
                    <CardTitle className={`flex items-center gap-2 ${variant === 'kitchen' ? 'text-white' : ''}`}>
                        <CalendarIcon className="h-5 w-5" />
                        {t('Calendario', 'Calendar')}
                    </CardTitle>
                    <CardDescription className={textClass}>
                        {t('Selecciona una fecha para ver los pedidos', 'Select a date to view orders')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0 flex justify-center pb-4">
                    <div className={variant === 'kitchen' ? 'dark-calendar-wrapper' : ''}>
                        <Calendar
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            className={`rounded-md border shadow-sm ${variant === 'kitchen'
                                    ? 'bg-[#1f2937] border-slate-700 text-white [&_.rdp-day_button:hover]:bg-slate-700 [&_.rdp-day_button:focus]:bg-purple-600 [&_.rdp-day_button.rdp-day_selected]:bg-purple-600'
                                    : ''
                                }`}
                            modifiers={modifiers}
                            modifiersStyles={modifiersStyles}
                            locale={language === 'es' ? es : undefined}
                        />
                    </div>
                </CardContent>
                <div className={`px-6 pb-6 text-sm ${textClass}`}>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${variant === 'kitchen' ? 'bg-purple-500' : 'bg-primary'}`} />
                        <span>{t('Días con pedidos', 'Days with orders')}</span>
                    </div>
                </div>
            </Card>

            <Card className={`${cardClass} h-full min-h-[500px]`}>
                <CardHeader>
                    <CardTitle className={variant === 'kitchen' ? 'text-white' : ''}>
                        {date ? format(date, 'PPPP', { locale: language === 'es' ? es : undefined }) : t('Seleccionar fecha', 'Select date')}
                    </CardTitle>
                    <CardDescription className={textClass}>
                        {selectedDateOrders.length} {t('pedidos programados', 'orders scheduled')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {selectedDateOrders.length > 0 ? (
                        <div className="space-y-4">
                            {selectedDateOrders.map(order => (
                                <div
                                    key={order.id}
                                    className={`flex items-start justify-between p-4 border rounded-lg cursor-pointer transition-colors ${variant === 'kitchen'
                                            ? 'bg-[#1f2937] border-slate-700 hover:border-purple-500 hover:bg-[#2d3748]'
                                            : 'hover:bg-accent/50'
                                        }`}
                                    onClick={() => onOrderClick?.(order)}
                                >
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`font-bold text-lg ${variant === 'kitchen' ? 'text-white' : ''}`}>
                                                #{order.order_number}
                                            </span>
                                            <Badge variant="outline" className={
                                                order.status === 'confirmed' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                    order.status === 'ready' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                                        'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                            }>
                                                {order.status}
                                            </Badge>
                                        </div>
                                        <h4 className={`font-medium ${variant === 'kitchen' ? 'text-gray-200' : ''}`}>
                                            {order.cake_size} - {order.filling}
                                        </h4>
                                        <p className={`text-sm ${textClass}`}>{order.customer_name}</p>
                                        {order.theme && <p className={`text-sm mt-1 ${variant === 'kitchen' ? 'text-purple-400' : 'text-primary'}`}>"{order.theme}"</p>}
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <Badge variant="outline" className={`flex items-center gap-1 ${variant === 'kitchen' ? 'border-slate-700 text-slate-300' : ''}`}>
                                            <Clock className="w-3 h-3" />
                                            {order.time_needed}
                                        </Badge>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={`flex flex-col items-center justify-center h-48 ${textClass}`}>
                            <CalendarIcon className="w-12 h-12 mb-4 opacity-20" />
                            <p>{t('No hay pedidos para esta fecha', 'No orders for this date')}</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
