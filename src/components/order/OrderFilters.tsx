/**
 * Order Filters Component
 * Multi-select filters for orders with active filter count
 */

import { useState, useEffect } from 'react';
import { X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { OrderStatus } from '@/types/orderState';

export interface OrderFilters {
  status?: OrderStatus[];
  paymentStatus?: ('paid' | 'pending' | 'refunded' | 'failed')[];
  deliveryOption?: 'pickup' | 'delivery' | 'all';
  cakeSize?: string[];
  dateRange?: {
    from?: string;
    to?: string;
  };
  dateNeededFilter?: 'today' | 'this_week' | 'this_month' | 'custom' | 'all';
}

interface OrderFiltersProps {
  filters: OrderFilters;
  onFiltersChange: (filters: OrderFilters) => void;
  onClearAll?: () => void;
  className?: string;
}

const STATUS_OPTIONS: { value: OrderStatus; label: { es: string; en: string } }[] = [
  { value: 'pending', label: { es: 'Pendiente', en: 'Pending' } },
  { value: 'confirmed', label: { es: 'Confirmado', en: 'Confirmed' } },
  { value: 'in_progress', label: { es: 'En Proceso', en: 'In Progress' } },
  { value: 'ready', label: { es: 'Listo', en: 'Ready' } },
  { value: 'completed', label: { es: 'Completado', en: 'Completed' } },
  { value: 'cancelled', label: { es: 'Cancelado', en: 'Cancelled' } },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: 'paid', label: { es: 'Pagado', en: 'Paid' } },
  { value: 'pending', label: { es: 'Pendiente', en: 'Pending' } },
  { value: 'refunded', label: { es: 'Reembolsado', en: 'Refunded' } },
  { value: 'failed', label: { es: 'Fallido', en: 'Failed' } },
];

const DATE_FILTER_OPTIONS = [
  { value: 'all', label: { es: 'Todas las fechas', en: 'All dates' } },
  { value: 'today', label: { es: 'Hoy', en: 'Today' } },
  { value: 'this_week', label: { es: 'Esta semana', en: 'This week' } },
  { value: 'this_month', label: { es: 'Este mes', en: 'This month' } },
  { value: 'custom', label: { es: 'Rango personalizado', en: 'Custom range' } },
];

export const OrderFilters = ({
  filters,
  onFiltersChange,
  onClearAll,
  className,
}: OrderFiltersProps) => {
  const { t, language } = useLanguage();
  const [localFilters, setLocalFilters] = useState<OrderFilters>(filters);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const updateFilter = (key: keyof OrderFilters, value: any) => {
    const updated = { ...localFilters, [key]: value };
    setLocalFilters(updated);
    onFiltersChange(updated);
  };

  const toggleStatus = (status: OrderStatus) => {
    const current = localFilters.status || [];
    const updated = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];
    updateFilter('status', updated.length > 0 ? updated : undefined);
  };

  const togglePaymentStatus = (status: string) => {
    const current = localFilters.paymentStatus || [];
    const updated = current.includes(status as any)
      ? current.filter((s) => s !== status)
      : [...current, status as any];
    updateFilter('paymentStatus', updated.length > 0 ? updated : undefined);
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (localFilters.status && localFilters.status.length > 0) count++;
    if (localFilters.paymentStatus && localFilters.paymentStatus.length > 0) count++;
    if (localFilters.deliveryOption && localFilters.deliveryOption !== 'all') count++;
    if (localFilters.cakeSize && localFilters.cakeSize.length > 0) count++;
    if (localFilters.dateNeededFilter && localFilters.dateNeededFilter !== 'all') count++;
    if (localFilters.dateRange?.from || localFilters.dateRange?.to) count++;
    return count;
  };

  const activeCount = getActiveFilterCount();

  const handleClearAll = () => {
    const cleared: OrderFilters = {};
    setLocalFilters(cleared);
    onFiltersChange(cleared);
    onClearAll?.();
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Active Filters Display */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Filter className="h-3 w-3" />
            {activeCount} {t('filtros activos', 'active filters')}
          </Badge>
          {localFilters.status?.map((status) => (
            <Badge
              key={status}
              variant="outline"
              className="gap-1"
            >
              {t(
                STATUS_OPTIONS.find((o) => o.value === status)?.label.es || status,
                STATUS_OPTIONS.find((o) => o.value === status)?.label.en || status
              )}
              <button
                onClick={() => toggleStatus(status)}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {localFilters.paymentStatus?.map((status) => (
            <Badge
              key={status}
              variant="outline"
              className="gap-1"
            >
              {t(
                PAYMENT_STATUS_OPTIONS.find((o) => o.value === status)?.label.es || status,
                PAYMENT_STATUS_OPTIONS.find((o) => o.value === status)?.label.en || status
              )}
              <button
                onClick={() => togglePaymentStatus(status)}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {localFilters.deliveryOption &&
            localFilters.deliveryOption !== 'all' && (
              <Badge variant="outline" className="gap-1">
                {t(
                  localFilters.deliveryOption === 'pickup'
                    ? 'Recoger'
                    : 'Entrega',
                  localFilters.deliveryOption === 'pickup'
                    ? 'Pickup'
                    : 'Delivery'
                )}
                <button
                  onClick={() => updateFilter('deliveryOption', 'all')}
                  className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="h-6 text-xs"
          >
            {t('Limpiar todo', 'Clear all')}
          </Button>
        </div>
      )}

      {/* Filter Controls */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Status Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start">
              <Filter className="mr-2 h-4 w-4" />
              {t('Estado', 'Status')}
              {localFilters.status && localFilters.status.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {localFilters.status.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="space-y-2">
              <Label>{t('Filtrar por estado', 'Filter by status')}</Label>
              {STATUS_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`status-${option.value}`}
                    checked={localFilters.status?.includes(option.value) || false}
                    onCheckedChange={() => toggleStatus(option.value)}
                  />
                  <Label
                    htmlFor={`status-${option.value}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {t(option.label.es, option.label.en)}
                  </Label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Payment Status Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start">
              <Filter className="mr-2 h-4 w-4" />
              {t('Pago', 'Payment')}
              {localFilters.paymentStatus &&
                localFilters.paymentStatus.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {localFilters.paymentStatus.length}
                  </Badge>
                )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="space-y-2">
              <Label>{t('Filtrar por estado de pago', 'Filter by payment status')}</Label>
              {PAYMENT_STATUS_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`payment-${option.value}`}
                    checked={
                      localFilters.paymentStatus?.includes(option.value as any) ||
                      false
                    }
                    onCheckedChange={() => togglePaymentStatus(option.value)}
                  />
                  <Label
                    htmlFor={`payment-${option.value}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {t(option.label.es, option.label.en)}
                  </Label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Delivery Option Filter */}
        <div className="space-y-2">
          <Label>{t('Entrega', 'Delivery')}</Label>
          <RadioGroup
            value={localFilters.deliveryOption || 'all'}
            onValueChange={(value) =>
              updateFilter('deliveryOption', value as any)
            }
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="delivery-all" />
              <Label htmlFor="delivery-all" className="cursor-pointer">
                {t('Todos', 'All')}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="pickup" id="delivery-pickup" />
              <Label htmlFor="delivery-pickup" className="cursor-pointer">
                {t('Recoger', 'Pickup')}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="delivery" id="delivery-delivery" />
              <Label htmlFor="delivery-delivery" className="cursor-pointer">
                {t('Entrega', 'Delivery')}
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Date Filter */}
        <div className="space-y-2">
          <Label>{t('Fecha Necesaria', 'Date Needed')}</Label>
          <select
            value={localFilters.dateNeededFilter || 'all'}
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'custom') {
                // Open date picker
                updateFilter('dateNeededFilter', 'custom');
              } else {
                updateFilter('dateNeededFilter', value as any);
                // Calculate date range based on selection
                const today = new Date();
                let from: string | undefined;
                let to: string | undefined;

                if (value === 'today') {
                  from = today.toISOString().split('T')[0];
                  to = today.toISOString().split('T')[0];
                } else if (value === 'this_week') {
                  const weekStart = new Date(today);
                  weekStart.setDate(today.getDate() - today.getDay());
                  from = weekStart.toISOString().split('T')[0];
                  to = today.toISOString().split('T')[0];
                } else if (value === 'this_month') {
                  from = new Date(today.getFullYear(), today.getMonth(), 1)
                    .toISOString()
                    .split('T')[0];
                  to = today.toISOString().split('T')[0];
                }

                updateFilter('dateRange', { from, to });
              }
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {DATE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label.es, option.label.en)}
              </option>
            ))}
          </select>
          {localFilters.dateNeededFilter === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={localFilters.dateRange?.from || ''}
                onChange={(e) =>
                  updateFilter('dateRange', {
                    ...localFilters.dateRange,
                    from: e.target.value,
                  })
                }
                placeholder={t('Desde', 'From')}
              />
              <Input
                type="date"
                value={localFilters.dateRange?.to || ''}
                onChange={(e) =>
                  updateFilter('dateRange', {
                    ...localFilters.dateRange,
                    to: e.target.value,
                  })
                }
                placeholder={t('Hasta', 'To')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
