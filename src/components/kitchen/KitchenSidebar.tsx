import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClipboardList, LogOut, CalendarDays, Bell, Boxes, Truck, BarChart3 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import TransparentLogo from '@/assets/brand/logo.png';

interface KitchenSidebarProps {
    activeView: 'queue' | 'upcoming' | 'calendar' | 'inventory' | 'deliveries' | 'reports';
    onChangeView: (view: 'queue' | 'upcoming' | 'calendar' | 'inventory' | 'deliveries' | 'reports') => void;
    onLogout: () => void;
    compact?: boolean;
    darkMode?: boolean;
    notificationCount?: number;
    onNotificationClick?: () => void;
    badgeCounts?: Record<string, number>;
    userName?: string;
}

export function KitchenSidebar({ activeView, onChangeView, onLogout, compact = false, darkMode = false, notificationCount, onNotificationClick, badgeCounts, userName = 'Staff' }: KitchenSidebarProps) {
    const { t } = useLanguage();

    const menuItems = [
        {
            id: 'queue',
            label: t('Ordenes', 'Orders'),
            icon: ClipboardList,
            view: 'queue' as const
        },
        {
            id: 'upcoming',
            label: t('Calendario', 'Calendar'),
            icon: CalendarDays,
            view: 'upcoming' as const
        },
        {
            id: 'inventory',
            label: t('Inventario', 'Inventory'),
            icon: Boxes,
            view: 'inventory' as const
        },
        {
            id: 'deliveries',
            label: t('Entregas', 'Deliveries'),
            icon: Truck,
            view: 'deliveries' as const
        },
        {
            id: 'reports',
            label: t('Reportes', 'Reports'),
            icon: BarChart3,
            view: 'reports' as const
        },
    ];

    return (
        <div className={cn(
            "flex flex-col h-screen border-r transition-all duration-300",
            compact ? "w-20 items-center py-6" : "w-64",
            darkMode ? "bg-[#1f2937] border-slate-700" : "bg-white border-gray-100"
        )}>
            {/* Logo Area */}
            <div className={cn("mb-8 flex justify-center", compact ? "px-0" : "px-6")}>
                <img
                    src={TransparentLogo}
                    alt="Eli's Logo"
                    className={cn("object-contain drop-shadow-md", compact ? "h-14 w-14" : "h-24 w-auto")}
                />
            </div>

            {/* Navigation */}
            <div className={cn("space-y-4 flex-1", compact ? "w-full px-3" : "px-4")}>
                {menuItems.map((item) => (
                    <Button
                        key={item.id}
                        variant="ghost"
                        className={cn(
                            "w-full transition-all duration-200 relative group",
                            compact ? "h-12 w-12 p-0 justify-center rounded-xl" : "justify-start gap-3 h-12 text-md font-medium",
                            activeView === item.view
                                ? (darkMode ? "bg-green-500/20 text-green-400" : "bg-green-50 text-green-600")
                                : (darkMode ? "text-slate-400 hover:bg-slate-700 hover:text-white" : "text-gray-400 hover:bg-gray-50 hover:text-gray-600")
                        )}
                        onClick={() => onChangeView(item.view)}
                    >
                        <item.icon className={cn("transition-colors", compact ? "h-6 w-6" : "h-5 w-5")} />
                        {!compact && item.label}

                        {/* Active Indicator Strip */}
                        {activeView === item.view && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-green-600 rounded-r-full" />
                        )}

                        {/* Badge Count */}
                        {(badgeCounts?.[item.id] ?? 0) > 0 && (
                            <span className={cn(
                                "absolute rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center",
                                compact
                                    ? "top-1 right-1 h-4 min-w-[16px] px-0.5"
                                    : "top-1/2 -translate-y-1/2 right-3 h-5 min-w-[20px] px-1"
                            )}>
                                {badgeCounts![item.id] > 99 ? '99+' : badgeCounts![item.id]}
                            </span>
                        )}
                    </Button>
                ))}

                {/* Notifications Button */}
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full transition-all duration-200 relative group",
                        compact ? "h-12 w-12 p-0 justify-center rounded-xl" : "justify-start gap-3 h-12 text-md font-medium",
                        darkMode ? "text-slate-400 hover:bg-slate-700 hover:text-white" : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                    )}
                    onClick={onNotificationClick}
                >
                    <Bell className={cn("transition-colors", compact ? "h-6 w-6" : "h-5 w-5")} />
                    {!compact && t('Notificaciones', 'Notifications')}
                    {(notificationCount ?? 0) > 0 && (
                        <span className={cn(
                            "absolute rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center",
                            compact
                                ? "top-1 right-1 h-4 min-w-[16px] px-0.5"
                                : "top-1/2 -translate-y-1/2 right-3 h-5 min-w-[20px] px-1"
                        )}>
                            {notificationCount! > 99 ? '99+' : notificationCount}
                        </span>
                    )}
                </Button>
            </div>

            {/* Footer Actions */}
            <div className={cn("mt-auto space-y-2", compact ? "w-full px-3 pb-6" : "p-6 border-t", darkMode ? "border-slate-700" : "border-gray-100")}>
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full text-red-400 hover:text-red-500",
                        compact ? "h-12 w-12 p-0 justify-center rounded-xl" : "justify-start gap-3",
                        darkMode ? "hover:bg-red-900/20" : "hover:bg-red-50"
                    )}
                    onClick={onLogout}
                >
                    <LogOut className={cn(compact ? "h-5 w-5" : "h-5 w-5")} />
                    {!compact && t('Cerrar Sesión', 'Log Out')}
                </Button>

                {/* User Avatar if compact */}
                {compact && (
                    <div className={cn("mt-4 pt-4 border-t flex justify-center", darkMode ? "border-slate-700" : "border-gray-100")}>
                        <div className="h-10 w-10 rounded-full bg-green-600 overflow-hidden border-2 border-white shadow-sm">
                            <img
                                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=22c55e&color=fff&size=40`}
                                alt={userName}
                                className="h-full w-full object-cover"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
