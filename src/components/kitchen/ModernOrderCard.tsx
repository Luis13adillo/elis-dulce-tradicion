import { memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Order } from "@/types/order";
import { Clock, MapPin, Calendar } from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import ReferenceImageViewer from "@/components/order/ReferenceImageViewer";

interface ModernOrderCardProps {
    order: Order;
    onAction: (orderId: number, action: 'confirm' | 'start' | 'ready' | 'delivery' | 'complete' | 'markDelivered') => void;
    onShowDetails?: (order: Order) => void;
    onCancel?: (order: Order) => void;
    isReadOnly?: boolean;
    isFrontDesk?: boolean;
    variant?: 'default' | 'dark';
}

export const ModernOrderCard = memo(function ModernOrderCard({
    order,
    onAction,
    onShowDetails,
    onCancel,
    isReadOnly,
    isFrontDesk,
    variant = 'default'
}: ModernOrderCardProps) {
    const { t } = useLanguage();

    // Memoize urgency — avoid re-parsing ISO strings on every render
    const urgencyMinutes = useMemo(() => {
        try {
            const dueDateTime = parseISO(`${order.date_needed}T${order.time_needed}`);
            return differenceInMinutes(dueDateTime, new Date());
        } catch {
            return 0;
        }
    }, [order.date_needed, order.time_needed]);

    // Keep a stable function reference for JSX that still calls the memoized value
    const getUrgency = () => urgencyMinutes;

    // Status color mapping
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-black text-white hover:bg-gray-800'; // "New"
            case 'confirmed': return 'bg-yellow-500 text-white hover:bg-yellow-600'; // "Preparing" equivalent
            case 'in_progress': return 'bg-yellow-600 text-white hover:bg-yellow-700'; // "Preparing"
            case 'ready':
                return order.delivery_option === 'delivery'
                    ? 'bg-green-600 text-white hover:bg-green-700' // "Delivery"
                    : 'bg-green-500 text-white hover:bg-green-600'; // "Pickup"
            case 'out_for_delivery': return 'bg-blue-600 text-white hover:bg-blue-700';
            case 'delivered': return 'bg-gray-500 text-white';
            case 'completed': return 'bg-gray-400 text-white';
            default: return 'bg-gray-200 text-gray-700';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending': return t('Nueva', 'New');
            case 'confirmed': return t('Confirmada', 'Confirmed');
            case 'in_progress': return t('Preparando', 'Preparing');
            case 'ready': return order.delivery_option === 'delivery' ? t('Entrega', 'Delivery') : t('Recoger', 'Pickup');
            case 'out_for_delivery': return t('En Camino', 'On Way');
            case 'delivered': return t('Entregada', 'Delivered');
            case 'completed': return t('Completada', 'Done');
            default: return status;
        }
    };

    const statusColor = getStatusColor(order.status);
    const statusLabel = getStatusLabel(order.status);

    const renderActions = () => {
        const viewButton = (
            <Button
                variant="outline"
                onClick={() => onShowDetails?.(order)}
                className="flex-1 bg-white text-black border-gray-200 hover:bg-gray-50 rounded-xl h-10"
            >
                {t('Ver Orden', 'View Order')}
            </Button>
        );

        let actionButton = null;

        if (order.status === 'pending') {
            actionButton = (
                <Button onClick={() => onAction(order.id, 'confirm')} className="flex-1 bg-red-600 text-white hover:bg-red-700 rounded-xl h-10">
                    {t('Aceptar Orden', 'Accept Order')}
                </Button>
            );
        } else if (order.status === 'confirmed') {
            actionButton = (
                <Button onClick={() => onAction(order.id, 'start')} className="flex-1 bg-yellow-500 text-white hover:bg-yellow-600 rounded-xl h-10">
                    {t('Comenzar Preparación', 'Start Preparing')}
                </Button>
            );
        } else if (order.status === 'in_progress') {
            actionButton = (
                <Button onClick={() => onAction(order.id, 'ready')} className="flex-1 bg-green-600 text-white hover:bg-green-700 rounded-xl h-10">
                    {t('Marcar Lista', 'Mark Ready')}
                </Button>
            );
        } else if (order.status === 'ready') {
            actionButton = (
                <Button onClick={() => onAction(order.id, order.delivery_option === 'delivery' ? 'delivery' : 'complete')} className="flex-1 bg-orange-500 text-white hover:bg-orange-600 rounded-xl h-10">
                    {order.delivery_option === 'delivery' ? t('Enviar Repartidor', 'Dispatch Driver') : t('Completar Recoger', 'Complete Pickup')}
                </Button>
            );
        } else if (order.status === 'out_for_delivery') {
            actionButton = (
                <Button onClick={() => onAction(order.id, 'markDelivered')} className="flex-1 bg-blue-600 text-white hover:bg-blue-700 rounded-xl h-10">
                    {t('Marcar Entregada', 'Mark Delivered')}
                </Button>
            );
        }

        if (!actionButton && isReadOnly) return null;

        return (
            <div className="flex gap-3 w-full">
                {viewButton}
                {actionButton}
            </div>
        );
    };


    return (
        <div className={cn(
            "rounded-2xl p-5 shadow-sm border flex flex-col gap-4 font-sans hover:shadow-md transition-shadow",
            variant === 'dark'
                ? "bg-[#1f2937] border-slate-700/50 text-white"
                : "bg-white border-gray-100 text-gray-900",
            getUrgency() <= 0 && !['delivered', 'completed', 'cancelled'].includes(order.status) && (
                variant === 'dark'
                    ? "border-l-4 border-l-red-500/70"
                    : "border-l-4 border-l-red-400"
            )
        )}>

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className={cn(
                        "h-10 w-10 rounded-full overflow-hidden border relative",
                        variant === 'dark' ? "bg-slate-700 border-slate-600" : "bg-gray-100 border-gray-200"
                    )}>
                        {order.reference_image_path ? (
                            <img
                                src={order.reference_image_path.startsWith('http')
                                    ? order.reference_image_path
                                    : order.reference_image_path.startsWith('/')
                                        ? order.reference_image_path
                                        : `https://rnszrscxwkdwvvlsihqc.supabase.co/storage/v1/object/public/reference-images/${order.reference_image_path}`
                                }
                                alt="Ref"
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                    // Fallback to avatar on image error
                                    (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${order.customer_name}`;
                                }}
                            />
                        ) : (
                            <img
                                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${order.customer_name}`}
                                alt="Avatar"
                                className="h-full w-full object-cover"
                            />
                        )}
                    </div>
                    <div>
                        <h3 className={cn("font-bold leading-tight", variant === 'dark' ? "text-white" : "text-gray-900")}>
                            {order.customer_name}
                        </h3>
                        <p className={cn("text-xs", variant === 'dark' ? "text-slate-400" : "text-gray-500")}>
                            #{order.order_number}
                        </p>
                    </div>
                </div>

                <Badge className={cn("px-3 py-1 rounded-full text-xs font-bold border-none", statusColor)}>
                    {statusLabel}
                </Badge>
            </div>

            {/* Info Grid */}
            <div className={cn(
                "grid grid-cols-2 gap-y-2 gap-x-4 text-xs border-b pb-4",
                variant === 'dark' ? "text-slate-400 border-slate-700/50" : "text-gray-500 border-gray-100"
            )}>
                <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{format(parseISO(order.date_needed), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{format(parseISO(`2000-01-01T${order.time_needed}`), 'h:mm a')}</span>
                </div>
                {getUrgency() > 0 && getUrgency() < 60 && (
                    <div className="col-span-2 flex items-center gap-2 font-black mt-1 text-red-600 animate-pulse bg-red-50 p-2 rounded-lg border border-red-200">
                        <Clock className="h-4 w-4" />
                        <span>URGENT: Due in {getUrgency()} mins</span>
                    </div>
                )}
                {getUrgency() >= 60 && (
                    <div className={cn("col-span-2 flex items-center gap-2 font-medium mt-1", variant === 'dark' ? "text-amber-400" : "text-amber-600")}>
                        <Clock className="h-3.5 w-3.5" />
                        <span>Due in {Math.floor(getUrgency() / 60)}h {getUrgency() % 60}m</span>
                    </div>
                )}
                {getUrgency() <= 0 && !['delivered', 'completed', 'cancelled'].includes(order.status) && (
                    <div className={cn(
                        "col-span-2 flex items-center gap-2 font-black mt-1 text-xs p-2 rounded-lg border animate-pulse",
                        variant === 'dark'
                            ? "text-red-400 bg-red-900/30 border-red-500/30"
                            : "text-red-700 bg-red-50 border-red-200"
                    )}>
                        <Clock className="h-4 w-4" />
                        <span>
                            {Math.abs(getUrgency()) < 60
                                ? `OVERDUE: ${Math.abs(getUrgency())}m ago`
                                : Math.abs(getUrgency()) < 1440
                                    ? `OVERDUE: ${Math.floor(Math.abs(getUrgency()) / 60)}h ${Math.abs(getUrgency()) % 60}m ago`
                                    : `OVERDUE: ${Math.floor(Math.abs(getUrgency()) / 1440)}d ago`
                            }
                        </span>
                    </div>
                )}
            </div>

            {/* Cake/Order Details */}
            <div className="flex-1 space-y-2">
                {/* Handle custom cake orders (no items array) */}
                {!order.items || order.items.length === 0 ? (
                    <div className="text-sm space-y-1">
                        <div className="flex items-start gap-2">
                            <span className={cn("font-bold", variant === 'dark' ? "text-green-400" : "text-green-600")}>1x</span>
                            <div className="flex-1">
                                <p className={cn("font-medium", variant === 'dark' ? "text-slate-200" : "text-gray-800")}>
                                    {order.cake_size || 'Custom Cake'}
                                </p>
                                {order.filling && (
                                    <p className={cn("text-xs", variant === 'dark' ? "text-slate-500" : "text-gray-500")}>
                                        {order.filling}
                                    </p>
                                )}
                            </div>
                        </div>
                        {order.theme && (() => {
                            const [shortTheme, designNotes] = order.theme.split(' — ');
                            return (
                                <>
                                    <p className={cn("text-sm font-medium pl-6", variant === 'dark' ? "text-amber-400" : "text-amber-600")}>
                                        <span className="font-bold">Theme:</span> {shortTheme}
                                    </p>
                                    {designNotes && (
                                        <div className={cn(
                                            "ml-6 mt-1 px-3 py-2 rounded-lg border-l-4 border-[#C6A649] text-xs",
                                            variant === 'dark' ? "bg-[#C6A649]/10 text-slate-300" : "bg-amber-50 text-gray-700"
                                        )}>
                                            <span className="font-bold text-[#C6A649] block mb-0.5">Design Notes:</span>
                                            {designNotes}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                        {order.dedication && (
                            <p className="text-xs text-amber-500 italic pl-6">
                                "{order.dedication}"
                            </p>
                        )}
                    </div>
                ) : (
                    /* Original items display for menu orders */
                    order.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 text-sm">
                            <span className={cn(
                                "font-bold min-w-[20px]",
                                variant === 'dark' ? "text-green-400" : "text-green-600"
                            )}>
                                {item.quantity}x
                            </span>
                            <div className="flex-1">
                                <p className={cn("font-medium", variant === 'dark' ? "text-slate-200" : "text-gray-800")}>
                                    {item.name}
                                </p>
                                {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                                    <p className={cn("text-xs mt-0.5", variant === 'dark' ? "text-slate-500" : "text-gray-500")}>
                                        {item.selected_modifiers.map((m: any) => m.name).join(', ')}
                                    </p>
                                )}
                                {item.special_instructions && (
                                    <p className="text-xs text-amber-500 italic mt-0.5">
                                        "{item.special_instructions}"
                                    </p>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Reference Photo — prominent inline display */}
            {order.reference_image_path && (() => {
                const imgUrl = order.reference_image_path.startsWith('http')
                    ? order.reference_image_path
                    : `https://rnszrscxwkdwvvlsihqc.supabase.co/storage/v1/object/public/reference-images/${order.reference_image_path}`;
                return (
                    <div
                        data-ref-section="true"
                        className={cn(
                            "rounded-xl overflow-hidden border-l-4 border-[#C6A649]",
                            variant === 'dark' ? "bg-[#C6A649]/10 border border-[#C6A649]/30" : "bg-amber-50 border border-amber-200"
                        )}
                    >
                        <div className={cn(
                            "flex items-center justify-between px-3 py-1.5 text-xs font-bold",
                            variant === 'dark' ? "text-[#C6A649]" : "text-amber-700"
                        )}>
                            <div className="flex items-center gap-2">
                                <span>📷</span>
                                <span>{t('Foto de Referencia', 'Reference Photo')}</span>
                            </div>
                            <ReferenceImageViewer
                                imagePath={order.reference_image_path}
                                orderNumber={order.order_number}
                                theme={order.theme}
                            />
                        </div>
                        <img
                            src={imgUrl}
                            alt={t('Referencia de pastel', 'Cake reference')}
                            className="w-full h-32 object-cover"
                            onError={(e) => {
                                (e.currentTarget.closest('[data-ref-section="true"]') as HTMLElement | null)?.remove();
                            }}
                        />
                    </div>
                );
            })()}

            {/* Actions */}
            <div className={cn("pt-4 border-t", variant === 'dark' ? "border-slate-700/50" : "border-gray-100")}>
                <div className="flex gap-2">
                    {!isReadOnly && renderActions()}
                </div>
                {onCancel && !['completed', 'cancelled', 'delivered'].includes(order.status) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); onCancel(order); }}
                        className={cn(
                            "w-full text-xs h-8 mt-2",
                            variant === 'dark'
                                ? "text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                : "text-red-400 hover:text-red-500 hover:bg-red-500/10"
                        )}
                    >
                        {t('Cancelar Orden', 'Cancel Order')}
                    </Button>
                )}
            </div>
        </div>
    );
});
