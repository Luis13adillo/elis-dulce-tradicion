import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    ShoppingBag,
    Package,
    FileText,
    Settings,
    LogOut,
    Calendar,
    Boxes,
    Globe,
    Users,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

import TransparentLogo from '@/assets/brand/logo.png';

interface OwnerSidebarProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    className?: string;
}

export const OwnerSidebar = ({ activeTab, setActiveTab, className }: OwnerSidebarProps) => {
    const { t } = useLanguage();
    const { signOut } = useAuth();
    const navigate = useNavigate();

    const menuSections = [
        {
            label: t('Operaciones', 'Operations'),
            items: [
                { id: 'overview', label: t('Resumen', 'Overview'), icon: LayoutDashboard },
                { id: 'orders', label: t('Pedidos', 'Orders'), icon: ShoppingBag },
                { id: 'customers', label: t('Clientes', 'Customers'), icon: Users },
                { id: 'calendar', label: t('Calendario', 'Calendar'), icon: Calendar },
            ],
        },
        {
            label: t('Gestión', 'Management'),
            items: [
                { id: 'products', label: t('Productos', 'Products'), icon: Package },
                { id: 'inventory', label: t('Inventario', 'Inventory'), icon: Boxes },
            ],
        },
        {
            label: t('Informes', 'Insights'),
            items: [
                { id: 'reports', label: t('Reportes', 'Reports'), icon: FileText },
            ],
        },
        {
            label: t('Sistema', 'System'),
            items: [
                { id: 'settings', label: t('Configuración', 'Settings'), icon: Settings },
                { id: 'website', label: t('Sitio Web', 'Website'), icon: Globe },
            ],
        },
    ];

    return (
        <div className={cn("flex h-full w-20 flex-col items-center bg-white border-r border-gray-200 py-8 transition-all duration-300 md:w-64 md:items-start md:px-6", className)}>
            {/* Brand Logo Area */}
            <div className="mb-10 flex w-full justify-center md:justify-start px-2">
                <img
                    src={TransparentLogo}
                    alt="Eli's Logo"
                    className="h-16 w-auto object-contain drop-shadow-lg"
                />
            </div>

            {/* Navigation Menu */}
            <nav className="flex w-full flex-1 flex-col gap-1 overflow-y-auto">
                {menuSections.map((section) => (
                    <div key={section.label} className="mb-2">
                        <p className="hidden md:block px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                            {section.label}
                        </p>
                        {section.items.map((item) => {
                            const isActive = activeTab === item.id;
                            const Icon = item.icon;

                            return (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id)}
                                    className={cn(
                                        "group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 transition-all duration-300",
                                        isActive
                                            ? "bg-[#C6A649] text-white shadow-lg shadow-[#C6A649]/20"
                                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                                    )}
                                >
                                    <Icon className={cn("h-5 w-5 transition-transform group-hover:scale-110", isActive && "animate-pulse-subtle")} />
                                    <span className={cn("hidden font-medium text-sm md:block", isActive ? "font-bold" : "")}>
                                        {item.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* Logout Button */}
            <div className="mt-auto w-full pt-6">
                <button
                    onClick={async () => {
                        await signOut();
                        navigate('/login');
                    }}
                    className="group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-red-600 transition-all hover:bg-red-50 hover:text-red-700"
                >
                    <LogOut className="h-6 w-6" />
                    <span className="hidden font-medium md:block">{t('Salir', 'Logout')}</span>
                </button>
            </div>
        </div>
    );
};
