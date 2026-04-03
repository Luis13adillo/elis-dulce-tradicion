import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

export type KitchenTab = 'all' | 'active' | 'today' | 'new' | 'preparing' | 'pickup' | 'delivery' | 'done';

interface KitchenNavTabsProps {
    activeTab: KitchenTab;
    onTabChange: (tab: KitchenTab) => void;
    counts?: Record<KitchenTab, number>;
    darkMode?: boolean;
}

export function KitchenNavTabs({ activeTab, onTabChange, counts, darkMode = false }: KitchenNavTabsProps) {
    const { t } = useLanguage();

    const tabs: { id: KitchenTab; label: string }[] = [
        { id: 'all', label: t('Todos', 'All') },
        { id: 'active', label: t('Activos', 'Active') },
        { id: 'today', label: t('Hoy', 'Today') },
        { id: 'new', label: t('Nuevo', 'New') },
        { id: 'preparing', label: t('Preparando', 'Preparing') },
        { id: 'pickup', label: t('Recogida', 'Pickup') },
        { id: 'delivery', label: t('Entrega', 'Delivery') },
        { id: 'done', label: t('Listo', 'Done') },
    ];

    return (
        <div className={cn(
            "flex items-center gap-2 p-1 rounded-full backdrop-blur-sm border w-fit transition-all",
            darkMode
                ? "bg-slate-800/50 border-slate-700/50"
                : "bg-gray-100/80 border-gray-200"
        )}>
            {tabs.map((tab) => (
                <Button
                    key={tab.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => onTabChange(tab.id)}
                    className={cn(
                        "rounded-full px-4 text-sm font-medium transition-all duration-200",
                        activeTab === tab.id
                            ? (darkMode ? "bg-slate-700 text-white shadow-md" : "bg-white text-black shadow-sm")
                            : (darkMode ? "text-slate-400 hover:text-white hover:bg-slate-700/50" : "text-gray-500 hover:text-gray-900 hover:bg-white/50")
                    )}
                >
                    {tab.label}
                    {counts && counts[tab.id] > 0 && (
                        <span className={cn(
                            "ml-2 text-xs py-0.5 px-1.5 rounded-full",
                            activeTab === tab.id
                                ? (darkMode ? "bg-black/20 text-white" : "bg-black/5 text-black")
                                : (darkMode ? "bg-slate-700 text-slate-300" : "bg-gray-200 text-gray-600")
                        )}>
                            {counts[tab.id]}
                        </span>
                    )}
                </Button>
            ))}
        </div>
    );
}
