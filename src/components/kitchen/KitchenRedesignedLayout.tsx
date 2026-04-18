import { KitchenSidebar } from "./KitchenSidebar";
import { cn } from "@/lib/utils";
import { Search, Clock, Sun, Moon, Bell, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect, memo } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Isolated clock — React.memo prevents 60s timer from re-rendering the entire layout
const ClockDisplay = memo(({ darkMode }: { darkMode: boolean }) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors",
            darkMode ? "bg-slate-800/60 text-slate-300" : "bg-white/80 text-gray-600 shadow-sm"
        )}>
            <Clock className="h-3.5 w-3.5" />
            <span className="font-medium text-xs whitespace-nowrap">
                {format(currentTime, 'EEE, d MMM • h:mm a')}
            </span>
        </div>
    );
});

interface KitchenRedesignedLayoutProps {
    children: React.ReactNode;
    activeView: 'queue' | 'upcoming' | 'inventory' | 'deliveries' | 'reports';
    onChangeView: (view: 'queue' | 'upcoming' | 'inventory' | 'deliveries' | 'reports') => void;
    isConnected?: boolean;
    connectionError?: string | null;
    onLogout: () => void;
    title?: string;
    darkMode?: boolean;
    onToggleTheme?: () => void;
    searchQuery?: string;
    onSearchChange?: (query: string) => void;
    notificationCount?: number;
    onNotificationClick?: () => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    badgeCounts?: Record<string, number>;
    soundEnabled?: boolean;
    onToggleSound?: () => void;
    userName?: string;
    /**
     * Primary action slot (e.g. Walk-In Order CTA). Rendered prominently in the
     * utility row to the right of the search bar.
     */
    headerAction?: React.ReactNode;
    /**
     * Secondary actions slot (e.g. settings popovers, test buttons). Rendered
     * inside the icon cluster so they don't fight with the primary action.
     */
    headerSecondaryActions?: React.ReactNode;
    todayOrderCount?: number;
    maxDailyCapacity?: number;
}

export function KitchenRedesignedLayout({
    children,
    activeView,
    onChangeView,
    onLogout,
    title = "Orders",
    darkMode = false,
    onToggleTheme,
    searchQuery,
    onSearchChange,
    notificationCount,
    onNotificationClick,
    onRefresh,
    isRefreshing,
    badgeCounts,
    soundEnabled = true,
    onToggleSound,
    userName = 'Staff',
    headerAction,
    headerSecondaryActions,
    isConnected = true,
    connectionError,
    todayOrderCount,
    maxDailyCapacity,
}: KitchenRedesignedLayoutProps) {
    const isDarkMode = darkMode;

    // Shared classes for the icon-cluster buttons so they all read as a single
    // unified control surface instead of 6 floating circles.
    const iconBtn = cn(
        "rounded-full h-9 w-9 transition-colors",
        isDarkMode
            ? "text-slate-300 hover:bg-slate-700/70"
            : "text-slate-500 hover:bg-gray-200/70"
    );

    return (
        <div className={cn(
            "flex h-screen overflow-hidden font-sans transition-colors duration-300",
            isDarkMode ? "bg-[#13141f]" : "bg-[#F3F4F6]"
        )}>
            {/* Sidebar */}
            <KitchenSidebar
                activeView={activeView}
                onChangeView={onChangeView}
                onLogout={onLogout}
                compact={true}
                darkMode={isDarkMode}
                notificationCount={notificationCount}
                onNotificationClick={onNotificationClick}
                badgeCounts={badgeCounts}
                userName={userName}
            />

            <main className={cn(
                "flex-1 flex flex-col min-w-0 px-6 lg:px-8 pt-5 pb-6 transition-colors duration-300",
                isDarkMode ? "bg-[#13141f]" : "bg-[#F3F4F6]"
            )}>
                {/* ========== HEADER (two rows) ========== */}
                <header className="flex flex-col gap-3 mb-5">
                    {/* Row 1 — Identity: title, today counter, clock, avatar */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <h1 className={cn(
                                "text-2xl lg:text-3xl font-bold tracking-tight transition-colors truncate",
                                isDarkMode ? "text-white" : "text-gray-900"
                            )}>
                                {title}
                            </h1>
                            {todayOrderCount !== undefined && maxDailyCapacity !== undefined && (
                                <div className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap",
                                    todayOrderCount >= maxDailyCapacity
                                        ? isDarkMode ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-700"
                                        : todayOrderCount >= maxDailyCapacity * 0.8
                                            ? isDarkMode ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-700"
                                            : isDarkMode ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-700"
                                )}>
                                    Today: {todayOrderCount} / {maxDailyCapacity}
                                </div>
                            )}
                            {/* Live indicator — small, sits near identity */}
                            <div
                                title={isConnected ? 'Live feed connected' : (connectionError ?? 'Reconnecting...')}
                                className={cn(
                                    "hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold select-none",
                                    isConnected
                                        ? isDarkMode ? "bg-green-500/15 text-green-400" : "bg-green-100 text-green-600"
                                        : isDarkMode ? "bg-red-500/15 text-red-400 animate-pulse" : "bg-red-100 text-red-600 animate-pulse"
                                )}
                            >
                                <span className={cn("h-1.5 w-1.5 rounded-full", isConnected ? "bg-green-500" : "bg-red-500")} />
                                {isConnected ? "Live" : "Offline"}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <ClockDisplay darkMode={isDarkMode} />
                            <Avatar className="h-9 w-9 border-2 border-white/80 shadow-sm cursor-pointer">
                                <AvatarImage src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=22c55e&color=fff`} />
                                <AvatarFallback className="bg-green-600 text-white font-bold text-sm">
                                    {userName.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                        </div>
                    </div>

                    {/* Row 2 — Utility: search, walk-in CTA, icon cluster */}
                    <div className="flex items-center gap-3">
                        {/* Search — takes remaining space, capped at lg */}
                        <div className="relative flex-1 max-w-xl">
                            <Search className={cn(
                                "absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4",
                                isDarkMode ? "text-slate-500" : "text-gray-400"
                            )} />
                            <input
                                type="text"
                                placeholder="Name, order #, phone, email"
                                value={searchQuery ?? ''}
                                onChange={(e) => onSearchChange?.(e.target.value)}
                                className={cn(
                                    "w-full pl-10 pr-4 py-2 rounded-full border focus:outline-none focus:ring-2 focus:ring-green-500/40 text-sm transition-all",
                                    isDarkMode
                                        ? "bg-slate-800/70 border-slate-700/60 text-white placeholder:text-slate-500"
                                        : "bg-white border-gray-200 text-gray-900 shadow-sm"
                                )}
                            />
                        </div>

                        {/* Primary action (Walk-In Order) */}
                        {headerAction}

                        {/* Icon cluster — grouped in a single pill so they read together */}
                        <div className={cn(
                            "flex items-center gap-1 rounded-full p-1",
                            isDarkMode ? "bg-slate-800/60" : "bg-white/80 shadow-sm"
                        )}>
                            {/* Secondary actions slot (settings, test alert) — same look as icon cluster */}
                            {headerSecondaryActions}

                            {onToggleSound && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={onToggleSound}
                                    className={cn(
                                        iconBtn,
                                        soundEnabled && (isDarkMode ? "text-emerald-400" : "text-emerald-600")
                                    )}
                                    title={soundEnabled ? "Mute notifications" : "Unmute notifications"}
                                >
                                    {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                                </Button>
                            )}

                            {onRefresh && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={onRefresh}
                                    disabled={isRefreshing}
                                    className={iconBtn}
                                    title="Refresh orders"
                                >
                                    <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                                </Button>
                            )}

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onToggleTheme}
                                className={cn(
                                    iconBtn,
                                    isDarkMode && "text-yellow-400"
                                )}
                                title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                            >
                                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                            </Button>

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onNotificationClick}
                                className={cn(iconBtn, "relative")}
                                title="Notifications"
                            >
                                <Bell className="h-4 w-4" />
                                {(notificationCount ?? 0) > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                                        {notificationCount! > 99 ? '99+' : notificationCount}
                                    </span>
                                )}
                            </Button>
                        </div>
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {children}
                </div>
            </main>
        </div>
    );
}
