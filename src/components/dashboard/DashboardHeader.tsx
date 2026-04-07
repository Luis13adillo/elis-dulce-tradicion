import { useState, useRef, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Search, ShoppingBag, Package, Boxes, X, LogOut } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export interface SearchResult {
  type: 'order' | 'product' | 'ingredient';
  label: string;
  subtitle: string;
  tabId: string;
}

interface DashboardHeaderProps {
  onSearch?: (query: string) => SearchResult[];
  onNavigateTab?: (tabId: string) => void;
}

export const DashboardHeader = ({ onSearch, onNavigateTab }: DashboardHeaderProps) => {
  const { t } = useLanguage();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!value.trim()) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }

      debounceRef.current = setTimeout(() => {
        if (onSearch) {
          const results = onSearch(value.trim());
          setSearchResults(results);
          setShowResults(results.length > 0);
        }
      }, 300);
    },
    [onSearch]
  );

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowResults(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setSearchQuery('');
    setSearchResults([]);
    onNavigateTab?.(result.tabId);
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'order': return <ShoppingBag className="h-4 w-4 text-blue-500" />;
      case 'product': return <Package className="h-4 w-4 text-green-500" />;
      case 'ingredient': return <Boxes className="h-4 w-4 text-orange-500" />;
      default: return <Search className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'order': return t('Pedido', 'Order');
      case 'product': return t('Producto', 'Product');
      case 'ingredient': return t('Ingrediente', 'Ingredient');
      default: return '';
    }
  };

  return (
    <div className="flex h-20 items-center justify-between px-8">
      {/* Title & Search */}
      <div className="flex flex-1 items-center gap-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
            {t('Bienvenido', 'Welcome back')},{' '}
            <span className="text-[#C6A649]">
              {user?.profile?.full_name?.split(' ')[0] || 'Admin'}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('Aquí está lo que sucede hoy', "Here's what's happening today")}
          </p>
        </div>

        {/* Search with dropdown */}
        <div className="hidden max-w-md flex-1 md:block" ref={searchRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder={t('Buscar pedidos, productos, ingredientes...', 'Search orders, products, ingredients...')}
              className="h-11 rounded-2xl border-none bg-gray-100 pl-10 pr-10 text-gray-600 transition-all focus:bg-white focus:ring-2 focus:ring-[#C6A649]/20"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowResults(true);
              }}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setShowResults(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Search Results Dropdown */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl border bg-white shadow-lg z-50 max-h-[400px] overflow-auto">
                {/* Group results by type */}
                {(['order', 'product', 'ingredient'] as const).map((type) => {
                  const results = searchResults.filter((r) => r.type === type);
                  if (results.length === 0) return null;
                  return (
                    <div key={type}>
                      <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-400 bg-gray-50 first:rounded-t-2xl">
                        {getTypeLabel(type)} ({results.length})
                      </div>
                      {results.map((result, idx) => (
                        <button
                          key={`${type}-${idx}`}
                          onClick={() => handleResultClick(result)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                        >
                          {getResultIcon(result.type)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {result.label}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {result.subtitle}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* No results message */}
            {showResults && searchQuery.trim() && searchResults.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl border bg-white shadow-lg z-50 p-6 text-center">
                <p className="text-sm text-gray-500">
                  {t('Sin resultados para', 'No results for')} &quot;{searchQuery}&quot;
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-3 pl-2 rounded-full hover:ring-2 hover:ring-[#C6A649]/20 transition-all cursor-pointer">
              <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                <AvatarImage
                  src={`https://ui-avatars.com/api/?name=${user?.profile?.full_name || 'Admin'}&background=C6A649&color=fff`}
                />
                <AvatarFallback>AD</AvatarFallback>
              </Avatar>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-0">
            <div className="p-4">
              <p className="text-sm font-semibold text-gray-900">
                {user?.profile?.full_name || 'Admin'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {user?.email || ''}
              </p>
              <Badge
                variant="secondary"
                className="mt-2 capitalize"
              >
                {user?.profile?.role === 'owner'
                  ? t('Propietario', 'Owner')
                  : user?.profile?.role === 'baker'
                    ? t('Recepción', 'Front Desk')
                    : t('Cliente', 'Customer')}
              </Badge>
            </div>
            <Separator />
            <div className="p-2">
              <button
                onClick={async () => {
                  await signOut();
                  navigate('/login', { replace: true });
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                {t('Cerrar Sesión', 'Sign Out')}
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
