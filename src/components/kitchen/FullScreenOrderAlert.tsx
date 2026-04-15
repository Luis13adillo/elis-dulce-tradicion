import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Order } from '@/types/order';
import { Button } from '@/components/ui/button';
import { Bell, X, Clock, User, Cake } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';

interface FullScreenOrderAlertProps {
    order: Order | null;
    isOpen: boolean;
    onClose: () => void;
    onViewOrder: (order: Order) => void;
}

export function FullScreenOrderAlert({ order, isOpen, onClose, onViewOrder }: FullScreenOrderAlertProps) {
    const { t } = useLanguage();
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Initialize simple notification beep or use existing one from project assets
        // Assuming /notification.mp3 exists as seen in useOrdersFeed logic
        audioRef.current = new Audio('/notification.mp3');
    }, []);

    useEffect(() => {
        if (isOpen && order) {
            if (audioRef.current) {
                audioRef.current.loop = true;
                audioRef.current.currentTime = 0;
                audioRef.current.volume = 1.0;
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => console.log('Audio autoplay prevented:', error));
                }
            }
        } else {
            if (audioRef.current) {
                audioRef.current.loop = false;
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
        }
    }, [isOpen, order]);

    if (!isOpen || !order) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
                >
                    <motion.div
                        initial={{ scale: 0.5, opacity: 0, y: 50 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.5, opacity: 0, y: 50 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="w-full max-w-lg"
                    >
                        <Card className="bg-[#1e1e1e] border-2 border-red-500 shadow-2xl overflow-hidden relative">
                            {/* Pulsing Border Effect */}
                            <div className="absolute inset-0 border-4 border-red-500/20 animate-pulse pointer-events-none rounded-xl"></div>

                            {/* Header Gradient */}
                            <div className="bg-gradient-to-r from-red-600 to-orange-600 p-6 text-center relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/20 to-transparent animate-pulse"></div>
                                <div className="relative z-10 flex flex-col items-center gap-3">
                                    <div className="bg-white/20 p-4 rounded-full backdrop-blur-sm animate-bounce">
                                        <Bell className="h-8 w-8 text-white fill-white" />
                                    </div>
                                    <h2 className="text-3xl font-black text-white uppercase tracking-wider drop-shadow-md">
                                        {t('¡Nueva Orden!', 'New Order!')}
                                    </h2>
                                </div>
                            </div>

                            <CardContent className="p-8 bg-[#1e1e1e] text-white space-y-8">
                                <div className="text-center space-y-2">
                                    <p className="text-slate-400 font-medium text-sm uppercase tracking-widest">{t('Número de Orden', 'Order Number')}</p>
                                    <h3 className="text-4xl font-bold text-[#C6A649]">#{order.order_number}</h3>
                                </div>

                                <div className="grid grid-cols-2 gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold">
                                            <User className="h-3 w-3" /> {t('Cliente', 'Customer')}
                                        </div>
                                        <div className="text-lg font-semibold truncate">{order.customer_name}</div>
                                    </div>

                                    <div className="space-y-1 text-right">
                                        <div className="flex items-center justify-end gap-2 text-slate-400 text-xs uppercase font-bold">
                                            <Clock className="h-3 w-3" /> {t('Hora de Entrega', 'Due Time')}
                                        </div>
                                        <div className="text-lg font-semibold">{order.time_needed}</div>
                                    </div>

                                    <div className="col-span-2 pt-2 border-t border-white/10">
                                        <div className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold mb-1">
                                            <Cake className="h-3 w-3" /> {t('Detalles', 'Details')}
                                        </div>
                                        <div className="text-base text-slate-200">
                                            {order.cake_size} — {order.filling}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 pt-4">
                                    <Button
                                        onClick={() => onViewOrder(order)}
                                        size="lg"
                                        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-lg h-14 rounded-xl shadow-lg shadow-red-900/20"
                                    >
                                        {t('Aceptar Orden', 'Accept Order')}
                                    </Button>

                                    <Button
                                        variant="ghost"
                                        onClick={onClose}
                                        className="w-full text-slate-400 hover:text-white hover:bg-white/10"
                                    >
                                        {t('Cerrar', 'Dismiss')}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
