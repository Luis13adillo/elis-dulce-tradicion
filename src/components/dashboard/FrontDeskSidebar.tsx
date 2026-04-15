import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LayoutDashboard, CheckCircle2, History, LogOut, Ticket } from "lucide-react";
import TransparentLogo from '@/assets/brand/logo.png';

interface FrontDeskSidebarProps {
    activeView: 'ready' | 'active' | 'history';
    onChangeView: (view: 'ready' | 'active' | 'history') => void;
    onLogout: () => void;
    readyCount?: number;
    title?: string;
}

export function FrontDeskSidebar({
    activeView,
    onChangeView,
    onLogout,
    readyCount = 0,
    title = "Front Desk"
}: FrontDeskSidebarProps) {
    const menuItems = [
        {
            id: 'active',
            label: 'Kitchen Tickets',
            icon: Ticket,
            view: 'active' as const
        },
        {
            id: 'ready',
            label: 'Ready for Pickup',
            icon: CheckCircle2,
            view: 'ready' as const,
            badge: readyCount > 0 ? readyCount : undefined
        },
        {
            id: 'history',
            label: 'Order History',
            icon: History,
            view: 'history' as const
        }
    ];

    return (
        <div className="flex flex-col h-screen w-64 bg-[#1a1b26] border-r border-slate-800 text-slate-300">
            {/* Logo area */}
            <div className="p-6 flex justify-center">
                <img
                    src={TransparentLogo}
                    alt="Eli's Logo"
                    className="h-32 w-auto object-contain drop-shadow-lg"
                />
            </div>

            {/* Navigation */}
            <div className="space-y-2 px-6">
                {menuItems.map((item) => (
                    <Button
                        key={item.id}
                        variant="ghost"
                        className={cn(
                            "w-full justify-start gap-3 h-12 text-md font-medium transition-all duration-200 relative",
                            activeView === item.view
                                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                                : "hover:bg-slate-800 hover:text-white"
                        )}
                        onClick={() => onChangeView(item.view)}
                    >
                        <item.icon className="h-5 w-5" />
                        {item.label}
                        {item.badge !== undefined && (
                            <span className="absolute right-3 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                {item.badge}
                            </span>
                        )}
                    </Button>
                ))}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Footer Actions */}
            <div className="p-6 border-t border-slate-800 space-y-2">
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 text-red-400 hover:text-red-300 hover:bg-red-950/20"
                    onClick={onLogout}
                >
                    <LogOut className="h-5 w-5" />
                    Sign Out
                </Button>
            </div>
        </div>
    );
}
