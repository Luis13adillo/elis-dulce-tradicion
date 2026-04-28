import { memo, useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Order, OrderAction } from "@/types/order";
import { Globe, Store, Timer, ChevronRight, Truck, ShoppingBag } from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatCurrency, formatTime } from "@/lib/i18n-utils";
import { supabase, STORAGE_BUCKET } from "@/lib/supabase";

interface CompactOrderCardProps {
    order: Order;
    onAction: (orderId: number, action: OrderAction) => void;
    onShowDetails?: (order: Order) => void;
    onCancel?: (order: Order) => void;
    isReadOnly?: boolean;
    variant?: 'default' | 'dark';
}

const dicebearAvatar = (seed: string) =>
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

export const CompactOrderCard = memo(function CompactOrderCard({
    order,
    onAction,
    onShowDetails,
    onCancel,
    isReadOnly,
    variant = 'dark',
}: CompactOrderCardProps) {
    const { t, language } = useLanguage();
    const isDark = variant === 'dark';

    // Tick every 60s so the urgency timer stays fresh
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    // Parse the due date once — reused by minutesToDue and dateTimeLine
    const dueDateTime = useMemo(() => {
        if (!order.date_needed) return null;
        try {
            return parseISO(`${order.date_needed}T${order.time_needed || '00:00'}`);
        } catch {
            return null;
        }
    }, [order.date_needed, order.time_needed]);

    const minutesToDue = useMemo(() => {
        if (!dueDateTime) return 0;
        return differenceInMinutes(dueDateTime, new Date(now));
    }, [dueDateTime, now]);

    const formattedTotal = useMemo(() => {
        if (order.total_amount === undefined || order.total_amount === null) return null;
        const n = typeof order.total_amount === 'string' ? parseFloat(order.total_amount) : order.total_amount;
        if (isNaN(n)) return null;
        return formatCurrency(n, language);
    }, [order.total_amount, language]);

    const isCompleted = ['delivered', 'completed', 'cancelled'].includes(order.status);
    const isOverdue = !isCompleted && minutesToDue <= 0;
    const isUrgent = !isCompleted && minutesToDue > 0 && minutesToDue <= 60;
    const isApproaching = !isCompleted && minutesToDue > 60 && minutesToDue <= 240;

    // Header strip color reflects urgency at a glance
    const headerTone = isOverdue
        ? isDark ? 'bg-red-500/15' : 'bg-red-50'
        : isUrgent
            ? isDark ? 'bg-amber-500/15' : 'bg-amber-50'
            : isApproaching
                ? isDark ? 'bg-yellow-500/10' : 'bg-yellow-50/70'
                : isDark ? 'bg-slate-800/60' : 'bg-gray-50';

    const accentBorder = isOverdue
        ? 'border-l-red-500'
        : isUrgent
            ? 'border-l-amber-400'
            : isApproaching
                ? 'border-l-yellow-400'
                : 'border-l-[#C6A649]';

    // Source pill: walk-in vs online
    const isWalkIn = order.payment_method === 'cash';

    // Status badge text + color
    const statusMeta = useMemo(() => {
        switch (order.status) {
            case 'pending':
                return { label: t('Nueva', 'New'), cls: 'bg-black text-white' };
            case 'confirmed':
                return { label: t('Confirmada', 'Confirmed'), cls: 'bg-yellow-500 text-white' };
            case 'in_progress':
                return { label: t('Preparando', 'Prep'), cls: 'bg-yellow-600 text-white' };
            case 'ready':
                return order.delivery_option === 'delivery'
                    ? { label: t('Lista · Entrega', 'Ready · Delivery'), cls: 'bg-green-600 text-white' }
                    : { label: t('Lista · Recoger', 'Ready · Pickup'), cls: 'bg-green-500 text-white' };
            case 'out_for_delivery':
                return { label: t('En Camino', 'On Way'), cls: 'bg-blue-600 text-white' };
            case 'delivered':
                return { label: t('Entregada', 'Delivered'), cls: 'bg-gray-500 text-white' };
            case 'completed':
                return { label: t('Completada', 'Done'), cls: 'bg-gray-400 text-white' };
            case 'cancelled':
                return { label: t('Cancelada', 'Cancelled'), cls: 'bg-red-500/80 text-white' };
            default:
                return { label: order.status, cls: 'bg-gray-200 text-gray-700' };
        }
    }, [order.status, order.delivery_option, t]);

    // Format the time-to-due as a compact "Xh Ym" or "OVERDUE Xm" string
    const timeLabel = useMemo(() => {
        const abs = Math.abs(minutesToDue);
        const hrs = Math.floor(abs / 60);
        const mins = abs % 60;
        let txt: string;
        if (abs < 60) txt = `${abs}m`;
        else if (abs < 1440) txt = `${hrs}h ${mins}m`;
        else txt = `${Math.floor(abs / 1440)}d ${Math.floor((abs % 1440) / 60)}h`;
        if (isOverdue) return `${t('ATRASADO', 'OVERDUE')} ${txt}`;
        if (isCompleted) return null;
        return `${t('En', 'In')} ${txt}`;
    }, [minutesToDue, isOverdue, isCompleted, t]);

    const timeColor = isOverdue
        ? isDark ? 'text-red-400' : 'text-red-600'
        : isUrgent
            ? isDark ? 'text-amber-400' : 'text-amber-700'
            : isApproaching
                ? isDark ? 'text-yellow-400' : 'text-yellow-700'
                : isDark ? 'text-slate-300' : 'text-gray-600';

    // Build the cake summary line: size [• N ppl] · bread · filling
    const cakeSummary = useMemo(() => {
        if (order.items && order.items.length > 0) {
            // Menu order — show first item summary
            const first = order.items[0];
            const more = order.items.length > 1 ? ` +${order.items.length - 1}` : '';
            return `${first.quantity}× ${first.name}${more}`;
        }
        const sizeWithServings = order.cake_size && order.servings
            ? `${order.cake_size} • ${order.servings} ${t('pers', 'ppl')}`
            : order.cake_size;
        const parts = [sizeWithServings, order.bread_type, order.filling].filter(Boolean);
        return parts.length ? parts.join(' · ') : t('Pastel personalizado', 'Custom cake');
    }, [order.items, order.cake_size, order.servings, order.bread_type, order.filling, t]);

    // Reference image URL (resolved or null) — uses Supabase SDK so it stays in
    // sync with VITE_SUPABASE_URL across environments
    const refImageUrl = useMemo(() => {
        if (!order.reference_image_path) return null;
        const p = order.reference_image_path;
        if (p.startsWith('http') || p.startsWith('/')) return p;
        if (!supabase) return null;
        return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(p).data.publicUrl;
    }, [order.reference_image_path]);

    const fallbackAvatar = useMemo(
        () => dicebearAvatar(order.customer_name ?? 'guest'),
        [order.customer_name]
    );

    // Theme — strip the "short — long notes" pattern, keep only the short label here
    const themeShort = useMemo(() => {
        if (!order.theme) return null;
        return order.theme.split(' — ')[0];
    }, [order.theme]);

    // Pickup/delivery date+time line
    const dateTimeLine = useMemo(() => {
        if (!dueDateTime) return null;
        const datePart = format(dueDateTime, 'MMM d');
        const timePart = order.time_needed ? formatTime(order.time_needed, language) : '';
        return `${datePart}${timePart ? ` · ${timePart}` : ''}`;
    }, [dueDateTime, order.time_needed, language]);

    // Single primary CTA driven by status. One click = one atomic backend
    // transition. No client-side chaining: each status advances to exactly the
    // next state, matching the order state machine. This keeps the UI in sync
    // with the server and makes failures (toast on error) easy to surface.
    const primaryAction = useMemo<{ label: string; action: OrderAction; cls: string } | null>(() => {
        if (isReadOnly) return null;
        switch (order.status) {
            case 'pending':
                return { label: t('Aceptar', 'Accept'), action: 'confirm', cls: 'bg-green-600 hover:bg-green-700 text-white' };
            case 'confirmed':
                return { label: t('Empezar', 'Start Baking'), action: 'start', cls: 'bg-green-600 hover:bg-green-700 text-white' };
            case 'in_progress':
                return { label: t('Lista para Recoger', 'Mark Ready'), action: 'ready', cls: 'bg-green-600 hover:bg-green-700 text-white' };
            case 'ready':
                return order.delivery_option === 'delivery'
                    ? { label: t('Despachar', 'Dispatch'), action: 'delivery', cls: 'bg-orange-500 hover:bg-orange-600 text-white' }
                    : { label: t('Marcar Recogida', 'Picked Up'), action: 'complete', cls: 'bg-orange-500 hover:bg-orange-600 text-white' };
            case 'out_for_delivery':
                return { label: t('Marcar Entregada', 'Mark Delivered'), action: 'markDelivered', cls: 'bg-blue-600 hover:bg-blue-700 text-white' };
            default:
                return null;
        }
    }, [order.status, order.delivery_option, isReadOnly, t]);

    const primaryTooltip = useMemo<string | null>(() => {
        if (!primaryAction) return null;
        switch (order.status) {
            case 'pending':
                return t('Aceptar la orden', 'Accept this order');
            case 'confirmed':
                return t('Empezar a hornear', 'Start baking');
            case 'in_progress':
                return t('Marcar como lista y notificar al cliente', 'Mark ready and notify the customer');
            case 'ready':
                return order.delivery_option === 'delivery'
                    ? t('Enviar al repartidor', 'Dispatch to driver')
                    : t('El cliente recogió el pastel', 'Customer has picked up the cake');
            case 'out_for_delivery':
                return t('Confirmar entrega al cliente', 'Confirm delivery to customer');
            default:
                return null;
        }
    }, [order.status, order.delivery_option, primaryAction, t]);

    return (
        <div
            onClick={() => onShowDetails?.(order)}
            className={cn(
                "group relative rounded-2xl overflow-hidden border border-l-4 cursor-pointer transition-all",
                "shadow-sm hover:shadow-lg hover:-translate-y-0.5",
                isDark
                    ? "bg-[#1f2937] border-slate-700/50 text-white"
                    : "bg-white border-gray-100 text-gray-900",
                accentBorder,
                isOverdue && "ring-1 ring-red-500/30"
            )}
        >
            {/* HEADER STRIP — order #, source, time-to-due, status */}
            <div className={cn("flex items-center gap-2 px-3 py-2", headerTone)}>
                {/* Reference / avatar thumbnail */}
                <div className={cn(
                    "h-10 w-10 rounded-lg overflow-hidden flex-shrink-0 border",
                    isDark ? "border-slate-700 bg-slate-800" : "border-gray-200 bg-gray-100"
                )}>
                    <img
                        src={refImageUrl ?? fallbackAvatar}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                        onError={(e) => {
                            const img = e.currentTarget;
                            // Prevent infinite onError loop if dicebear itself fails
                            img.onerror = null;
                            img.src = fallbackAvatar;
                        }}
                    />
                </div>

                {/* Order # + source pill */}
                <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn("text-sm font-bold truncate", isDark ? "text-white" : "text-gray-900")}>
                            #{order.order_number}
                        </span>
                        <span className={cn(
                            "inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0",
                            isWalkIn
                                ? isDark ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-700"
                                : isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-100 text-blue-700"
                        )}>
                            {isWalkIn ? <Store className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
                            {isWalkIn ? t('Local', 'Walk-in') : t('Web', 'Online')}
                        </span>
                    </div>
                    {timeLabel && (
                        <span className={cn("flex items-center gap-1 text-[11px] font-bold leading-tight mt-0.5", timeColor)}>
                            <Timer className="h-3 w-3" />
                            {timeLabel}
                        </span>
                    )}
                </div>

                {/* Status badge — on hover, crossfades to a cancel ✕ in the same slot */}
                {(() => {
                    const canCancel = !!onCancel && !['completed', 'cancelled', 'delivered'].includes(order.status);
                    return (
                        <div className="relative flex-shrink-0">
                            <span className={cn(
                                "block px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-opacity",
                                canCancel && "group-hover:opacity-0",
                                statusMeta.cls
                            )}>
                                {statusMeta.label}
                            </span>
                            {canCancel && (
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onCancel!(order); }}
                                    title={t('Cancelar Orden', 'Cancel Order')}
                                    aria-label={t('Cancelar Orden', 'Cancel Order')}
                                    className={cn(
                                        "absolute inset-0 flex items-center justify-center rounded-full text-[11px] font-bold leading-none opacity-0 group-hover:opacity-100 transition-opacity",
                                        isDark
                                            ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                                            : "bg-red-100 text-red-600 hover:bg-red-200"
                                    )}
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    );
                })()}
            </div>

            {/* BODY — customer, cake summary, theme, date+time */}
            <div className="px-3 py-2.5 space-y-1">
                <h3 className={cn(
                    "text-sm font-bold leading-tight truncate",
                    isDark ? "text-white" : "text-gray-900"
                )}>
                    {order.customer_name || t('Cliente', 'Customer')}
                </h3>

                {order.recipient_name && (
                    <p className={cn(
                        "text-[11px] font-semibold leading-tight truncate",
                        isDark ? "text-emerald-300" : "text-emerald-700"
                    )}>
                        {t('Para', 'For')}: {order.recipient_name}
                    </p>
                )}

                <p className={cn(
                    "text-xs font-medium truncate",
                    isDark ? "text-slate-200" : "text-gray-700"
                )}>
                    {cakeSummary}
                </p>

                {themeShort && (
                    <p className={cn(
                        "text-xs italic truncate font-display",
                        isDark ? "text-amber-300/90" : "text-amber-700"
                    )}>
                        {themeShort}
                    </p>
                )}

                <p className={cn(
                    "flex items-center gap-1.5 text-[11px]",
                    isDark ? "text-slate-400" : "text-gray-500"
                )}>
                    {dateTimeLine && <span>{dateTimeLine}</span>}
                    {dateTimeLine && order.delivery_option && <span>·</span>}
                    {order.delivery_option === 'delivery' ? (
                        <span className="inline-flex items-center gap-0.5">
                            <Truck className="h-3 w-3" /> {t('Entrega', 'Delivery')}
                        </span>
                    ) : order.delivery_option === 'pickup' ? (
                        <span className="inline-flex items-center gap-0.5">
                            <ShoppingBag className="h-3 w-3" /> {t('Recoger', 'Pickup')}
                        </span>
                    ) : null}
                </p>
            </div>

            {/* FOOTER — total + payment + primary CTA */}
            <div className={cn(
                "flex items-center justify-between gap-2 px-3 py-2 border-t",
                isDark ? "border-slate-700/50 bg-slate-900/30" : "border-gray-100 bg-gray-50/60"
            )}>
                <div className="flex items-center gap-1.5 min-w-0">
                    {formattedTotal && (
                        <span className={cn(
                            "text-sm font-bold",
                            isDark ? "text-white" : "text-gray-900"
                        )}>
                            {formattedTotal}
                        </span>
                    )}
                    {order.payment_status && (
                        <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0",
                            order.payment_status === 'paid'
                                ? isDark ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-700"
                                : order.payment_status === 'pending'
                                    ? isDark ? "bg-yellow-500/20 text-yellow-400" : "bg-yellow-100 text-yellow-700"
                                    : isDark ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-700"
                        )}>
                            {order.payment_status === 'paid' ? t('Pagado', 'Paid') : order.payment_status === 'pending' ? t('Pend.', 'Unpaid') : order.payment_status}
                        </span>
                    )}
                </div>

                {primaryAction ? (
                    <Button
                        size="sm"
                        title={primaryTooltip ?? undefined}
                        onClick={(e) => {
                            e.stopPropagation();
                            onAction(order.id, primaryAction.action);
                        }}
                        className={cn(
                            "h-8 px-3 rounded-lg text-xs font-bold gap-1 shadow-sm",
                            primaryAction.cls
                        )}
                    >
                        {primaryAction.label}
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                            e.stopPropagation();
                            onShowDetails?.(order);
                        }}
                        className={cn(
                            "h-8 px-3 rounded-lg text-xs font-medium",
                            isDark ? "text-slate-300 hover:bg-slate-700" : "text-gray-600 hover:bg-gray-100"
                        )}
                    >
                        {t('Ver', 'View')}
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>

        </div>
    );
});
