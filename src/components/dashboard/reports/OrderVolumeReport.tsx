/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { generateCSV, downloadCSV } from './reportUtils';

interface OrderVolumeReportProps {
  filteredOrders: any[];
  dateRange: { start: Date; end: Date };
}

export function exportOrderVolume(filteredOrders: any[], dateRange: { start: Date; end: Date }): void {
  const byStatus: Record<string, number> = {};
  filteredOrders.forEach(o => {
    const s = o.status || 'unknown';
    byStatus[s] = (byStatus[s] || 0) + 1;
  });

  const byDayOfWeek: Record<string, number> = {
    Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0,
    Thursday: 0, Friday: 0, Saturday: 0
  };
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  filteredOrders.forEach(o => {
    if (!o.created_at) return;
    try {
      const d = parseISO(o.created_at);
      byDayOfWeek[dayNames[d.getDay()]] += 1;
    } catch { /* skip */ }
  });

  const peakDay = Object.entries(byDayOfWeek).sort((a, b) => b[1] - a[1])[0];
  const deliveryCount = filteredOrders.filter(o => o.delivery_option === 'delivery').length;
  const pickupCount = filteredOrders.filter(o => o.delivery_option === 'pickup').length;

  const headers = ['Metric', 'Value'];
  const rows: (string | number)[][] = [
    ['Total Orders', filteredOrders.length],
    ['Delivery Orders', deliveryCount],
    ['Pickup Orders', pickupCount],
    ['Peak Day', peakDay ? `${peakDay[0]} (${peakDay[1]} orders)` : 'N/A'],
    ['', ''],
    ['Status', 'Count'],
  ];
  Object.entries(byStatus).forEach(([status, count]) => {
    rows.push([status, count]);
  });
  rows.push(['', '']);
  rows.push(['Day of Week', 'Orders']);
  Object.entries(byDayOfWeek).forEach(([day, count]) => {
    rows.push([day, count]);
  });

  const csv = generateCSV(headers, rows);
  downloadCSV(csv, `order_volume_${format(dateRange.start, 'yyyy-MM-dd')}_to_${format(dateRange.end, 'yyyy-MM-dd')}.csv`);
}

const OrderVolumeReport = ({ filteredOrders, dateRange }: OrderVolumeReportProps) => {
  const { t } = useLanguage();

  const orderVolume = useMemo(() => {
    const byStatus: Record<string, number> = {};
    filteredOrders.forEach(o => {
      const s = o.status || 'unknown';
      byStatus[s] = (byStatus[s] || 0) + 1;
    });

    const byDayOfWeek: Record<string, number> = {
      Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0,
      Thursday: 0, Friday: 0, Saturday: 0
    };
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    filteredOrders.forEach(o => {
      if (!o.created_at) return;
      try {
        const d = parseISO(o.created_at);
        byDayOfWeek[dayNames[d.getDay()]] += 1;
      } catch { /* skip */ }
    });

    const peakDay = Object.entries(byDayOfWeek).sort((a, b) => b[1] - a[1])[0];
    const deliveryCount = filteredOrders.filter(o => o.delivery_option === 'delivery').length;
    const pickupCount = filteredOrders.filter(o => o.delivery_option === 'pickup').length;

    return {
      total: filteredOrders.length,
      byStatus,
      byDayOfWeek,
      peakDay: peakDay ? { day: peakDay[0], count: peakDay[1] } : null,
      deliveryCount,
      pickupCount,
    };
  }, [filteredOrders]);

  const handleExport = () => {
    exportOrderVolume(filteredOrders, dateRange);
    toast.success(t('Reporte descargado', 'Report downloaded'));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-blue-500" />
            {t('Volumen de Pedidos', 'Order Volume')}
          </CardTitle>
          <CardDescription>
            {t('Análisis de pedidos por estado, día y tipo', 'Order analysis by status, day, and type')}
          </CardDescription>
        </div>
        <Button onClick={handleExport} size="sm">
          <Download className="mr-2 h-4 w-4" />
          {t('Exportar CSV', 'Export CSV')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status breakdown */}
        <div>
          <h4 className="text-sm font-semibold mb-3">{t('Por Estado', 'By Status')}</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(orderVolume.byStatus).map(([status, count]) => (
              <Badge key={status} variant="outline" className="text-sm py-1 px-3">
                {status}: {count}
              </Badge>
            ))}
          </div>
        </div>

        {/* Day of week */}
        <div>
          <h4 className="text-sm font-semibold mb-3">{t('Por Día de la Semana', 'By Day of Week')}</h4>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Día', 'Day')}</TableHead>
                  <TableHead className="text-right">{t('Pedidos', 'Orders')}</TableHead>
                  <TableHead>{t('Distribución', 'Distribution')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(orderVolume.byDayOfWeek).map(([day, count]) => {
                  const max = Math.max(...Object.values(orderVolume.byDayOfWeek), 1);
                  const pct = (count / max) * 100;
                  return (
                    <TableRow key={day}>
                      <TableCell className="font-medium">{day}</TableCell>
                      <TableCell className="text-right">{count}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Delivery vs Pickup */}
        <div>
          <h4 className="text-sm font-semibold mb-3">{t('Tipo de Entrega', 'Delivery Type')}</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 text-center">
              <div className="text-2xl font-bold">{orderVolume.deliveryCount}</div>
              <p className="text-sm text-muted-foreground">{t('Entregas', 'Deliveries')}</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <div className="text-2xl font-bold">{orderVolume.pickupCount}</div>
              <p className="text-sm text-muted-foreground">{t('Recolecciones', 'Pickups')}</p>
            </div>
          </div>
        </div>

        {orderVolume.peakDay && (
          <div className="rounded-lg bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-800">
              {t('Día con más pedidos', 'Peak day')}: <strong>{orderVolume.peakDay.day}</strong> ({orderVolume.peakDay.count} {t('pedidos', 'orders')})
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderVolumeReport;
