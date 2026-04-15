import { ReactNode } from "react";
import { FrontDeskSidebar } from "./FrontDeskSidebar";
import { format } from "date-fns";
import { Volume2, VolumeX, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FrontDeskLayoutProps {
    children: ReactNode;
    activeView: 'ready' | 'active' | 'history';
    onChangeView: (view: 'ready' | 'active' | 'history') => void;
    onLogout: () => void;
    soundEnabled: boolean;
    onToggleSound: () => void;
    readyCount?: number;
    title?: string;
}

export default function FrontDeskLayout({
    children,
    activeView,
    onChangeView,
    onLogout,
    soundEnabled,
    onToggleSound,
    readyCount,
    title
}: FrontDeskLayoutProps) {
    const currentDate = new Date();

    return (
        <div className="flex h-screen bg-[#13141f] overflow-hidden font-sans">
            <FrontDeskSidebar
                activeView={activeView}
                onChangeView={onChangeView}
                onLogout={onLogout}
                readyCount={readyCount}
                title={title}
            />

            <main className="flex-1 flex flex-col min-w-0">
                {/* Top Header Bar */}
                <header className="h-20 border-b border-slate-800 bg-[#1a1b26]/50 backdrop-blur flex items-center justify-between px-8">
                    <div>
                        <p className="text-slate-400 text-sm font-medium">
                            {format(currentDate, 'd MMM yyyy')}
                        </p>
                        <h2 className="text-2xl font-bold text-white tracking-wide">
                            {format(currentDate, 'h:mm:ss a')}
                        </h2>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Sound Toggle */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onToggleSound}
                            className={`rounded-full h-10 w-10 border transition-all ${soundEnabled
                                ? "bg-blue-500/10 text-blue-500 border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                                : "bg-slate-800 text-slate-400 border-transparent hover:text-white"
                                }`}
                        >
                            {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                        </Button>

                        <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-full border border-slate-700">
                            <div className="p-2 rounded-full bg-slate-700 text-yellow-400">
                                <Sun className="h-4 w-4" />
                            </div>
                            <div className="p-2 rounded-full text-slate-400">
                                <Moon className="h-4 w-4" />
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-auto p-6 md:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
