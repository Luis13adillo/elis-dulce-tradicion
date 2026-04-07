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
            "flex items-center gap-2 px-4 py-2 rounded-full shadow-sm transition-colors",
            darkMode ? "bg-slate-800 text-slate-300" : "bg-white text-gray-500"
        )}>
            <Clock className="h-4 w-4" />
            <span className="font-medium text-sm">
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
    headerAction?: React.ReactNode;
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
    isConnected = true,
    connectionError,
}: KitchenRedesignedLayoutProps) {
    const isDarkMode = darkMode;

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
                "flex-1 flex flex-col min-w-0 p-6 lg:p-8 transition-colors duration-300",
                isDarkMode ? "bg-[#13141f]" : "bg-[#F3F4F6]"
            )}>
                {/* Header Area */}
                <header className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className={cn(
                            "text-3xl font-bold tracking-tight transition-colors",
                            isDarkMode ? "text-white" : "text-gray-900"
                        )}>{title}</h1>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Extra Header Action (e.g. Walk-In Order button) */}
                        {headerAction}

                        {/* Search Bar */}
                        <div className="relative hidden md:block group">
                            <Search className={cn(
                                "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors",
                                isDarkMode ? "text-slate-500 group-hover:text-slate-300" : "text-gray-400 group-hover:text-gray-600"
                            )} />
                            <input
                                type="text"
                                placeholder="Name, order #, phone, email"
                                value={searchQuery ?? ''}
                                onChange={(e) => onSearchChange?.(e.target.value)}
                                className={cn(
                                    "pl-10 pr-4 py-2 rounded-full border-none focus:ring-2 focus:ring-green-500 shadow-sm text-sm w-64 transition-all",
                                    isDarkMode ? "bg-slate-800 text-white placeholder:text-slate-500" : "bg-white text-gray-900"
                                )}
                            />
                        </div>

                        {/* Theme Toggle Button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onToggleTheme}
                            className={cn(
                                "rounded-full shadow-sm transition-colors",
                                isDarkMode ? "bg-slate-800 text-yellow-400 hover:bg-slate-700" : "bg-white text-slate-400 hover:bg-gray-50"
                            )}
                        >
                            {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                        </Button>

                        {/* Sound Toggle */}
                        {onToggleSound && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onToggleSound}
                                className={cn(
                                    "rounded-full shadow-sm transition-colors",
                                    soundEnabled
                                        ? isDarkMode
                                            ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                            : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                        : isDarkMode
                                            ? "bg-slate-800 text-slate-400 hover:bg-slate-700"
                                            : "bg-white text-slate-400 hover:bg-gray-50"
                                )}
                                title={soundEnabled ? "Mute notifications" : "Unmute notifications"}
                            >
                                {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                            </Button>
                        )}

                        {/* Refresh Button */}
                        {onRefresh && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onRefresh}
                                disabled={isRefreshing}
                                className={cn(
                                    "rounded-full shadow-sm transition-colors",
                                    isDarkMode
                                        ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                        : "bg-white text-slate-400 hover:bg-gray-50"
                                )}
                                title="Refresh orders"
                            >
                                <RefreshCw className={cn("h-5 w-5", isRefreshing && "animate-spin")} />
                            </Button>
                        )}

                        {/* Connection Status Indicator */}
                        <div
                            title={isConnected ? 'Live feed connected' : (connectionError ?? 'Reconnecting...')}
                            className={cn(
                                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold select-none",
                                isConnected
                                    ? isDarkMode ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-600"
                                    : isDarkMode ? "bg-red-500/20 text-red-400 animate-pulse" : "bg-red-100 text-red-600 animate-pulse"
                            )}
                        >
                            <span className={cn(
                                "h-2 w-2 rounded-full",
                                isConnected ? "bg-green-500" : "bg-red-500"
                            )} />
                            {isConnected ? "Live" : "Offline"}
                        </div>

                        {/* Notification Bell */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onNotificationClick}
                            className={cn(
                                "rounded-full shadow-sm transition-colors relative",
                                isDarkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-white text-slate-400 hover:bg-gray-50"
                            )}
                        >
                            <Bell className="h-5 w-5" />
                            {(notificationCount ?? 0) > 0 && (
                                <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                                    {notificationCount! > 99 ? '99+' : notificationCount}
                                </span>
                            )}
                        </Button>

                        {/* Time Display — isolated component, won't re-render siblings */}
                        <ClockDisplay darkMode={isDarkMode} />

                        {/* User Profile */}
                        <Avatar className="h-10 w-10 border-2 border-white shadow-sm cursor-pointer">
                            <AvatarImage src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=22c55e&color=fff`} />
                            <AvatarFallback className="bg-green-600 text-white font-bold">
                                {userName.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
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
