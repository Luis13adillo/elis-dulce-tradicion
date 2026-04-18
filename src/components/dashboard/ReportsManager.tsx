/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Download,
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  RefreshCw,
  Calendar,
  FileSpreadsheet,
  Mail,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseISO, isWithinInterval } from 'date-fns';

import { DatePreset, getDateRange } from './reports/reportUtils';
import RevenueReport, { exportRevenueSummary } from './reports/RevenueReport';
import OrderVolumeReport, { exportOrderVolume } from './reports/OrderVolumeReport';
import CustomerReport, { exportCustomerReport } from './reports/CustomerReport';
import InventoryReport, { exportInventoryReport } from './reports/InventoryReport';

const ReportsManager = () => {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DatePreset>('last_30');
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [isSendingReport, setIsSendingReport] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [orderData, inventoryData] = await Promise.all([
        // Reports needs the full history, not the dashboard's recent window.
        api.getAllOrders({ limit: 10000 }),
        api.getInventory(),
      ]);
      setOrders(Array.isArray(orderData) ? orderData : []);
      setIngredients(Array.isArray(inventoryData) ? inventoryData : []);
    } catch (error) {
      console.error('Error loading report data:', error);
      toast.error(t('Error al cargar datos', 'Error loading report data'));
    } finally {
      setIsLoading(false);
    }
  };

  const { start, end } = getDateRange(datePreset);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (!o.created_at) return false;
      try {
        const d = parseISO(o.created_at);
        return isWithinInterval(d, { start, end });
      } catch {
        return false;
      }
    });
  }, [orders, start, end]);

  // Summary stats for cards (lightweight, computed from filteredOrders)
  const totalRevenue = useMemo(() => filteredOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0), [filteredOrders]);
  const orderCount = filteredOrders.length;
  const avgOrder = orderCount > 0 ? totalRevenue / orderCount : 0;
  const deliveryCount = filteredOrders.filter(o => o.delivery_option === 'delivery').length;
  const pickupCount = filteredOrders.filter(o => o.delivery_option === 'pickup').length;
  const uniqueCustomers = useMemo(() => new Set(filteredOrders.map(o => o.customer_email || o.customer_name || 'Unknown')).size, [filteredOrders]);
  const repeatCustomers = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredOrders.forEach(o => { const k = o.customer_email || o.customer_name || 'Unknown'; counts[k] = (counts[k] || 0) + 1; });
    return Object.values(counts).filter(c => c > 1).length;
  }, [filteredOrders]);
  const lowStockCount = ingredients.filter(i => i.quantity <= i.low_stock_threshold).length;

  const sendEmailReport = async () => {
    setIsSendingReport(true);
    try {
      const result = await api.sendDailyReport(datePreset);
      if (result.success) {
        toast.success(t('Reporte enviado al correo del propietario', 'Report emailed to owner'));
      } else {
        toast.error(t('Error al enviar reporte', 'Failed to send report'));
        console.error('Send report error:', result.error);
      }
    } catch (error) {
      toast.error(t('Error al enviar reporte', 'Failed to send report'));
      console.error('Send report exception:', error);
    } finally {
      setIsSendingReport(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const dateRange = getDateRange(datePreset);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-3xl font-bold">{t('Centro de Reportes', 'Reports Center')}</h2>
          <p className="text-muted-foreground mt-1">
            {t('Genera y descarga reportes de tu negocio', 'Generate and download business reports')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{t('Hoy', 'Today')}</SelectItem>
              <SelectItem value="this_week">{t('Esta Semana', 'This Week')}</SelectItem>
              <SelectItem value="this_month">{t('Este Mes', 'This Month')}</SelectItem>
              <SelectItem value="last_30">{t('Últimos 30 Días', 'Last 30 Days')}</SelectItem>
              <SelectItem value="last_90">{t('Últimos 90 Días', 'Last 90 Days')}</SelectItem>
              <SelectItem value="all_time">{t('Todo el Tiempo', 'All Time')}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('Actualizar', 'Refresh')}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveReport(activeReport === 'revenue' ? null : 'revenue')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>{t('Ingresos', 'Revenue')}</CardDescription>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              {orderCount} {t('pedidos', 'orders')} · ${avgOrder.toFixed(2)} {t('promedio', 'avg')}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveReport(activeReport === 'volume' ? null : 'volume')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>{t('Volumen de Pedidos', 'Order Volume')}</CardDescription>
            <ShoppingCart className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orderCount}</div>
            <p className="text-xs text-muted-foreground">
              {deliveryCount} {t('entregas', 'deliveries')} · {pickupCount} {t('recolecciones', 'pickups')}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveReport(activeReport === 'customers' ? null : 'customers')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>{t('Clientes', 'Customers')}</CardDescription>
            <Users className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueCustomers}</div>
            <p className="text-xs text-muted-foreground">
              {repeatCustomers} {t('recurrentes', 'repeat')} · {uniqueCustomers > 0 ? (orderCount / uniqueCustomers).toFixed(1) : '0.0'} {t('pedidos/cliente', 'orders/customer')}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveReport(activeReport === 'inventory' ? null : 'inventory')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>{t('Inventario', 'Inventory')}</CardDescription>
            <Package className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ingredients.length}</div>
            <p className="text-xs text-muted-foreground">
              {lowStockCount} {t('stock bajo', 'low stock')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Report Detail */}
      {activeReport === 'revenue' && (
        <RevenueReport filteredOrders={filteredOrders} dateRange={dateRange} />
      )}
      {activeReport === 'volume' && (
        <OrderVolumeReport filteredOrders={filteredOrders} dateRange={dateRange} />
      )}
      {activeReport === 'customers' && (
        <CustomerReport filteredOrders={filteredOrders} dateRange={dateRange} />
      )}
      {activeReport === 'inventory' && (
        <InventoryReport ingredients={ingredients} />
      )}

      {/* Quick Export Section */}
      {!activeReport && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              {t('Exportación Rápida', 'Quick Export')}
            </CardTitle>
            <CardDescription>
              {t('Haz clic en una tarjeta arriba para ver detalles, o exporta directamente', 'Click a card above for details, or export directly')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => { exportRevenueSummary(filteredOrders, dateRange); toast.success(t('Reporte descargado', 'Report downloaded')); }}>
                <DollarSign className="h-5 w-5 text-green-500" />
                <span className="text-xs">{t('Ingresos CSV', 'Revenue CSV')}</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => { exportOrderVolume(filteredOrders, dateRange); toast.success(t('Reporte descargado', 'Report downloaded')); }}>
                <ShoppingCart className="h-5 w-5 text-blue-500" />
                <span className="text-xs">{t('Pedidos CSV', 'Orders CSV')}</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => { exportCustomerReport(filteredOrders, dateRange); toast.success(t('Reporte descargado', 'Report downloaded')); }}>
                <Users className="h-5 w-5 text-purple-500" />
                <span className="text-xs">{t('Clientes CSV', 'Customers CSV')}</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => { exportInventoryReport(ingredients); toast.success(t('Reporte descargado', 'Report downloaded')); }}>
                <Package className="h-5 w-5 text-orange-500" />
                <span className="text-xs">{t('Inventario CSV', 'Inventory CSV')}</span>
              </Button>
              <Button
                variant="outline"
                className="h-20 flex-col gap-2"
                onClick={sendEmailReport}
                disabled={isSendingReport}
              >
                {isSendingReport ? (
                  <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                ) : (
                  <Mail className="h-5 w-5 text-amber-500" />
                )}
                <span className="text-xs">
                  {isSendingReport
                    ? t('Enviando...', 'Sending...')
                    : t('Enviar Reporte', 'Email Report')}
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ReportsManager;
