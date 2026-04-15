import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageToggle from '@/components/LanguageToggle';
import { Button } from '@/components/ui/button';
import { LogOut, RefreshCw, LayoutDashboard, Calendar, ShoppingBag, Menu as MenuIcon, Settings, Sun, Moon, Keyboard } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTheme } from 'next-themes';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  showTabs?: boolean;
}

const DashboardLayout = ({ 
  children, 
  title, 
  onRefresh, 
  isRefreshing = false,
  showTabs = true
}: DashboardLayoutProps) => {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const getActiveTab = () => {
    if (location.pathname.includes('owner-dashboard')) return 'owner';
    if (location.pathname.includes('bakery-dashboard')) return 'orders';
    if (location.pathname.includes('kitchen-display')) return 'kitchen';
    return 'orders';
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Universal Dashboard Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          
          <div className="flex items-center gap-4">
            {/* Logo or Brand */}
            <div className="flex items-center gap-2 font-bold text-xl text-primary">
              <LayoutDashboard className="h-6 w-6" />
              <span className="hidden md:inline-block">Eli's Dashboard</span>
            </div>
            
            <div className="h-6 w-px bg-border mx-2 hidden md:block" />
            
            <h1 className="font-semibold text-lg">{title}</h1>
          </div>

          {/* Navigation Tabs - For staff to switch between views */}
          {showTabs && (user?.profile?.role === 'owner' || user?.profile?.role === 'baker') && (
            <div className="hidden lg:flex items-center justify-center flex-1 mx-4">
              <div className="flex bg-muted/50 p-1 rounded-lg">
                {/* Owner-only tab */}
                {user?.profile?.role === 'owner' && (
                  <Button 
                      variant={location.pathname === '/owner-dashboard' ? 'secondary' : 'ghost'} 
                      size="sm" 
                      onClick={() => navigate('/owner-dashboard')}
                      className="gap-2"
                  >
                      <Settings className="h-4 w-4" />
                      {t('Admin', 'Admin')}
                  </Button>
                )}
                {/* Shared tabs for baker and owner */}
                <Button
                    variant={location.pathname === '/kitchen-display' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => navigate('/kitchen-display')}
                    className="gap-2"
                >
                    <ShoppingBag className="h-4 w-4" />
                    {t('Panel de Cocina', 'Kitchen Display')}
                </Button>
                <Button
                    variant={location.pathname === '/bakery-dashboard' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => navigate('/bakery-dashboard')}
                    className="gap-2"
                >
                    <MenuIcon className="h-4 w-4" />
                    {t('Cola del Panadero', 'Baker Queue')}
                </Button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 md:gap-4">
             {onRefresh && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{t('Actualizar', 'Refresh')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('Actualizar', 'Refresh')} <kbd className="ml-1 px-1 py-0.5 bg-muted rounded text-xs">R</kbd></p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Keyboard Shortcuts Hint */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden md:flex h-9 w-9"
                  onClick={() => {
                    // Trigger the ? shortcut help
                    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
                  }}
                >
                  <Keyboard className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('Atajos de Teclado', 'Keyboard Shortcuts')} <kbd className="ml-1 px-1 py-0.5 bg-muted rounded text-xs">?</kbd></p>
              </TooltipContent>
            </Tooltip>
            
            {/* Dark Mode Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  className="h-9 w-9"
                >
                  {theme === 'dark' ? (
                    <Sun className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Moon className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{theme === 'dark' ? t('Modo Claro', 'Light Mode') : t('Modo Oscuro', 'Dark Mode')}</p>
              </TooltipContent>
            </Tooltip>
            
            <LanguageToggle />
            
            <div className="h-6 w-px bg-border mx-1" />
            
            <div className="flex items-center gap-3">
              <div className="text-right hidden md:block">
                <p className="text-sm font-medium leading-none">{user?.profile?.full_name || user?.email || 'User'}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.profile?.role || 'Guest'}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleLogout}>
                    <LogOut className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('Cerrar Sesión', 'Logout')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 container mx-auto p-4 md:p-6 animate-fade-in">
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;

