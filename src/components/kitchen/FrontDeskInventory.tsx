import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Boxes,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  RefreshCw,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface Ingredient {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  low_stock_threshold: number;
  category: string | null;
  supplier: string | null;
  last_updated: string;
}

interface FrontDeskInventoryProps {
  darkMode: boolean;
}

type FilterTab = 'all' | 'low-stock';

export function FrontDeskInventory({ darkMode }: FrontDeskInventoryProps) {
  const { t } = useLanguage();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lowStockItems, setLowStockItems] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const loadInventory = async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const [allItems, lowStock] = await Promise.all([
        api.getInventory(),
        api.getLowStockItems(),
      ]);
      setIngredients(Array.isArray(allItems) ? allItems : []);
      setLowStockItems(Array.isArray(lowStock) ? lowStock : []);
    } catch (error) {
      setIsError(true);
      toast.error(t('Error al cargar inventario', 'Error loading inventory'), {
        action: {
          label: t('Reintentar', 'Retry'),
          onClick: () => loadInventory(),
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();

    // FIX-08: Monitor realtime channel for disconnects
    // Inventory itself is fetch-only (no realtime rows), but the channel health
    // indicates overall Supabase connectivity. CHANNEL_ERROR means the connection dropped.
    if (supabase) {
      const channel = supabase.channel('inventory-health-monitor');
      channel
        .on('system', { event: 'disconnect' }, () => {
          setIsError(true);
          toast.error(t('Conexión perdida', 'Connection lost'), {
            action: {
              label: t('Reintentar', 'Retry'),
              onClick: () => {
                channel.unsubscribe();
                loadInventory();
              },
            },
          });
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            setIsError(true);
            toast.error(t('Error de conexión en tiempo real', 'Real-time connection error'), {
              action: {
                label: t('Reintentar', 'Retry'),
                onClick: () => loadInventory(),
              },
            });
          }
        });

      return () => {
        channel.unsubscribe();
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLowStock = (ingredient: Ingredient) =>
    ingredient.quantity <= ingredient.low_stock_threshold;

  const displayItems = useMemo(() => {
    const source = activeFilter === 'low-stock' ? lowStockItems : ingredients;
    if (!searchQuery.trim()) return source;
    const q = searchQuery.toLowerCase();
    return source.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q)
    );
  }, [ingredients, lowStockItems, activeFilter, searchQuery]);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "h-16 rounded-lg animate-pulse",
              darkMode ? "bg-slate-700" : "bg-gray-200"
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className={cn(
            "text-2xl font-bold",
            darkMode ? "text-white" : "text-gray-900"
          )}>
            {t('Inventario', 'Inventory')}
          </h2>
          <p className={cn(
            "text-sm mt-1",
            darkMode ? "text-slate-400" : "text-gray-500"
          )}>
            {t('Consulta la disponibilidad de ingredientes', 'Check ingredient availability')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadInventory}
          className={cn(
            "gap-2",
            darkMode
              ? "text-slate-300 hover:bg-slate-700 hover:text-white"
              : "text-gray-600 hover:bg-gray-100"
          )}
        >
          <RefreshCw className="h-4 w-4" />
          {t('Actualizar', 'Refresh')}
        </Button>
      </div>

      {/* Error Banner */}
      {isError && (
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg mb-4 text-sm",
          darkMode ? "bg-red-900/20 text-red-400 border border-red-500/30" : "bg-red-50 text-red-600 border border-red-200"
        )}>
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {t('No se pudo cargar el inventario', 'Could not load inventory')}
          </span>
          <button
            onClick={() => loadInventory()}
            className={cn(
              "flex items-center gap-1 px-3 py-1 rounded text-xs font-bold",
              darkMode ? "bg-red-500/20 hover:bg-red-500/30" : "bg-red-100 hover:bg-red-200"
            )}
          >
            <RefreshCw className="h-3 w-3" />
            {t('Reintentar', 'Retry')}
          </button>
        </div>
      )}

      {/* Low Stock Alert Banner */}
      {lowStockItems.length > 0 && (
        <div className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl border mb-6",
          darkMode
            ? "bg-red-900/20 border-red-500/30 text-red-400"
            : "bg-red-50 border-red-200 text-red-700"
        )}>
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span className="font-medium text-sm">
            {t(
              `${lowStockItems.length} ingrediente(s) con stock bajo`,
              `${lowStockItems.length} ingredient(s) low on stock`
            )}
          </span>
        </div>
      )}

      {/* Search + Filter Row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4",
            darkMode ? "text-slate-500" : "text-gray-400"
          )} />
          <input
            type="text"
            placeholder={t('Buscar ingrediente...', 'Search ingredient...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full pl-10 pr-4 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-green-500",
              darkMode
                ? "bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                : "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
            )}
          />
        </div>

        {/* Filter Tabs */}
        <div className={cn(
          "flex rounded-xl p-1",
          darkMode ? "bg-slate-800" : "bg-gray-100"
        )}>
          <button
            onClick={() => setActiveFilter('all')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
              activeFilter === 'all'
                ? (darkMode ? "bg-slate-700 text-white" : "bg-white text-gray-900 shadow-sm")
                : (darkMode ? "text-slate-400 hover:text-slate-200" : "text-gray-500 hover:text-gray-700")
            )}
          >
            {t('Todos', 'All')} ({ingredients.length})
          </button>
          <button
            onClick={() => setActiveFilter('low-stock')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
              activeFilter === 'low-stock'
                ? (darkMode ? "bg-red-900/40 text-red-400" : "bg-red-50 text-red-700 shadow-sm")
                : (darkMode ? "text-slate-400 hover:text-slate-200" : "text-gray-500 hover:text-gray-700")
            )}
          >
            {t('Stock Bajo', 'Low Stock')} ({lowStockItems.length})
          </button>
        </div>
      </div>

      {/* Ingredient Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-20">
        {displayItems.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-20">
            <Boxes className={cn(
              "h-16 w-16 mb-4 opacity-50",
              darkMode ? "text-slate-600" : "text-gray-300"
            )} />
            <p className={cn(
              "text-lg font-medium",
              darkMode ? "text-slate-500" : "text-gray-400"
            )}>
              {searchQuery.trim()
                ? t('Sin resultados', 'No results found')
                : t('Sin ingredientes registrados', 'No ingredients registered')}
            </p>
          </div>
        ) : (
          displayItems.map((ingredient) => {
            const low = isLowStock(ingredient);
            return (
              <div
                key={ingredient.id}
                className={cn(
                  "rounded-2xl border p-5 transition-colors",
                  darkMode
                    ? cn("bg-slate-800/60 border-slate-700/50", low && "border-red-500/40")
                    : cn("bg-white border-gray-200", low && "border-red-300")
                )}
              >
                {/* Top: Name + Badge */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className={cn(
                      "font-semibold text-base truncate",
                      darkMode ? "text-white" : "text-gray-900"
                    )}>
                      {ingredient.name}
                    </h3>
                    {ingredient.category && (
                      <span className={cn(
                        "text-xs",
                        darkMode ? "text-slate-400" : "text-gray-500"
                      )}>
                        {ingredient.category}
                      </span>
                    )}
                  </div>
                  <Badge
                    variant={low ? 'destructive' : 'default'}
                    className={cn(
                      "flex-shrink-0",
                      !low && (darkMode
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : "bg-green-50 text-green-700 border-green-200")
                    )}
                  >
                    {low ? (
                      <><AlertTriangle className="mr-1 h-3 w-3" />{t('Bajo', 'Low')}</>
                    ) : (
                      <><CheckCircle2 className="mr-1 h-3 w-3" />{t('OK', 'OK')}</>
                    )}
                  </Badge>
                </div>

                {/* Quantity */}
                <div className="flex items-baseline justify-between mb-2">
                  <span className={cn(
                    "text-sm",
                    darkMode ? "text-slate-400" : "text-gray-500"
                  )}>
                    {t('Cantidad', 'Quantity')}
                  </span>
                  <span className={cn(
                    "font-bold text-lg",
                    low
                      ? "text-red-500"
                      : (darkMode ? "text-white" : "text-gray-900")
                  )}>
                    {ingredient.quantity} <span className="text-sm font-normal">{ingredient.unit}</span>
                  </span>
                </div>

                {/* Threshold */}
                <div className="flex items-center justify-between mb-3">
                  <span className={cn(
                    "text-xs",
                    darkMode ? "text-slate-500" : "text-gray-400"
                  )}>
                    {t('Umbral', 'Threshold')}: {ingredient.low_stock_threshold} {ingredient.unit}
                  </span>
                  {low && <TrendingDown className="h-4 w-4 text-red-500" />}
                </div>

                {/* Supplier */}
                {ingredient.supplier && (
                  <div className={cn(
                    "text-xs mb-2",
                    darkMode ? "text-slate-400" : "text-gray-500"
                  )}>
                    {t('Proveedor', 'Supplier')}: {ingredient.supplier}
                  </div>
                )}

                {/* Last Updated */}
                <div className={cn(
                  "text-xs",
                  darkMode ? "text-slate-500" : "text-gray-400"
                )}>
                  {t('Actualizado', 'Updated')}: {formatDate(ingredient.last_updated)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
