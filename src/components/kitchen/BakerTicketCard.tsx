/**
 * BakerTicketCard - Kitchen work order / recipe card for bakers
 * Focus: Show ALL details clearly so bakers don't miss anything
 * Minimal actions - just an optional "Ready" button
 */
import { Button } from "@/components/ui/button";
import { Order } from "@/types/order";
import { Clock, Calendar, Check } from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface BakerTicketCardProps {
    order: Order;
    onMarkReady?: (orderId: number) => void;
}

export function BakerTicketCard({ order, onMarkReady }: BakerTicketCardProps) {
    const [imageError, setImageError] = useState(false);

    // Calculate time until due
    const getTimeUntilDue = () => {
        try {
            const dueDateTime = parseISO(`${order.date_needed}T${order.time_needed}`);
            const now = new Date();
            const minutes = differenceInMinutes(dueDateTime, now);
            if (minutes < 0) return { text: 'OVERDUE', urgent: true };
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            if (hours > 24) {
                const days = Math.floor(hours / 24);
                return { text: `${days}d ${hours % 24}h`, urgent: false };
            }
            return {
                text: `${hours}h ${mins}m`,
                urgent: hours < 4
            };
        } catch {
            return { text: '', urgent: false };
        }
    };

    const timeInfo = getTimeUntilDue();

    // Get image URL
    const getImageUrl = () => {
        if (!order.reference_image_path || imageError) return null;
        if (order.reference_image_path.startsWith('http')) return order.reference_image_path;
        if (order.reference_image_path.startsWith('/')) return order.reference_image_path;
        return `https://rnszrscxwkdwvvlsihqc.supabase.co/storage/v1/object/public/orders/${order.reference_image_path}`;
    };

    const imageUrl = getImageUrl();

    return (
        <div className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700/50 flex flex-col h-full">
            {/* Header: Order # + Customer Name + Status */}
            <div className="bg-slate-900 px-5 py-4 border-b border-slate-700/50">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-slate-400 text-xs font-mono">#{order.order_number}</p>
                        <h3 className="text-white font-bold text-lg truncate mt-0.5">
                            {order.customer_name}
                        </h3>
                    </div>
                    {order.status === 'in_progress' && (
                        <span className="shrink-0 px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-bold rounded-full border border-blue-500/30">
                            IN PROGRESS
                        </span>
                    )}
                </div>

                {/* Due Date/Time */}
                <div className="flex items-center gap-4 mt-3 text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                        <Calendar className="h-4 w-4 text-slate-500" />
                        <span>{format(parseISO(order.date_needed), 'EEE, MMM d')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                        <Clock className="h-4 w-4 text-slate-500" />
                        <span className="font-semibold">{format(parseISO(`2000-01-01T${order.time_needed}`), 'h:mm a')}</span>
                    </div>
                    {timeInfo.text && (
                        <span className={cn(
                            "ml-auto text-xs font-bold px-2 py-1 rounded",
                            timeInfo.urgent
                                ? "bg-red-500/20 text-red-400"
                                : "bg-slate-700 text-slate-400"
                        )}>
                            {timeInfo.urgent ? '⚠️ ' : ''}{timeInfo.text}
                        </span>
                    )}
                </div>
            </div>

            {/* Reference Image */}
            {imageUrl && (
                <div className="relative h-48 bg-slate-900">
                    <img
                        src={imageUrl}
                        alt="Reference"
                        className="h-full w-full object-contain bg-slate-900"
                        onError={() => setImageError(true)}
                    />
                    <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded text-xs text-slate-300">
                        Reference Photo
                    </div>
                </div>
            )}

            {/* Order Details - The Main Content */}
            <div className="flex-1 p-5 space-y-4">
                {/* Cake Size - Most Important */}
                <div className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 rounded-xl p-4 border border-pink-500/20">
                    <p className="text-pink-400 text-xs font-semibold uppercase tracking-wider mb-1">Cake Size</p>
                    <p className="text-white text-xl font-bold">{order.cake_size || 'Custom'}</p>
                </div>

                {/* Filling / Flavors */}
                {order.filling && (
                    <div className="bg-slate-700/30 rounded-xl p-4">
                        <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">
                            Filling / Flavors
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {order.filling.split(',').map((filling, idx) => (
                                <span
                                    key={idx}
                                    className="px-3 py-1.5 bg-amber-500/20 text-amber-200 rounded-full text-sm font-medium border border-amber-500/30"
                                >
                                    {filling.trim()}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Theme / Design */}
                {order.theme && (
                    <div className="bg-slate-700/30 rounded-xl p-4">
                        <p className="text-purple-400 text-xs font-semibold uppercase tracking-wider mb-2">
                            Theme / Design
                        </p>
                        <p className="text-white font-medium">{order.theme}</p>
                    </div>
                )}

                {/* Dedication Text */}
                {order.dedication && (
                    <div className="bg-slate-700/30 rounded-xl p-4">
                        <p className="text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-2">
                            Dedication Text (Write on Cake)
                        </p>
                        <p className="text-cyan-200 text-lg font-medium italic">"{order.dedication}"</p>
                    </div>
                )}

                {/* Special Instructions - Very Important */}
                {order.special_instructions && (
                    <div className="bg-amber-500/10 rounded-xl p-4 border-2 border-amber-500/30 border-dashed">
                        <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                            <span>⚠️</span> Special Instructions
                        </p>
                        <p className="text-amber-100 font-medium">{order.special_instructions}</p>
                    </div>
                )}
            </div>

            {/* Optional Ready Button - Subtle at bottom */}
            {onMarkReady && order.status !== 'ready' && (
                <div className="px-5 pb-5">
                    <Button
                        onClick={() => onMarkReady(order.id)}
                        variant="outline"
                        className="w-full h-10 bg-transparent border-slate-600 text-slate-400 hover:bg-green-500/20 hover:text-green-400 hover:border-green-500/50 transition-all"
                    >
                        <Check className="h-4 w-4 mr-2" />
                        Mark Ready
                    </Button>
                </div>
            )}
        </div>
    );
}
