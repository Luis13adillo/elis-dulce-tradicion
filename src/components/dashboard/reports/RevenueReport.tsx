/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { generateCSV, downloadCSV } from './reportUtils';

interface RevenueReportProps {
  filteredOrders: any[];
  dateRange: { start: Date; end: Date };
}

export function exportRevenueSummary(filteredOrders: any[], dateRange: { start: Date; end: Date }): void {
  const byDay: Record<string, { revenue: number; count: number }> = {};
  filteredOrders.forEach(o => {
    const day = o.created_at?.split('T')[0] || 'unknown';
    if (!byDay[day]) byDay[day] = { revenue: 0, count: 0 };
    byDay[day].revenue += Number(o.total_amount) || 0;
    byDay[day].count += 1;
  });

  const byProduct: Record<string, { revenue: number; count: number }> = {};
  filteredOrders.forEach(o => {
    const product = o.cake_size || 'Unknown';
    if (!byProduct[product]) byProduct[product] = { revenue: 0, count: 0 };
    byProduct[product].revenue += Number(o.total_amount) || 0;
    byProduct[product].count += 1;
  });

  const dailyData = Object.entries(byDay)
    .map(([date, d]) => ({ date, ...d }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const productData = Object.entries(byProduct)
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = filteredOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  const orderCount = filteredOrders.length;
  const avgOrder = orderCount > 0 ? totalRevenue / orderCount : 0;

  const headers = ['Date', 'Orders', 'Revenue ($)', 'Avg Order ($)'];
  const rows: (string | number)[][] = dailyData.map(d => [
    d.date,
    d.count,
    d.revenue.toFixed(2),
    d.count > 0 ? (d.revenue / d.count).toFixed(2) : '0.00',
  ]);

  rows.push(['', '', '', '']);
  rows.push(['Product/Size', 'Orders', 'Revenue ($)', 'Avg ($)']);
  productData.forEach(p => {
    rows.push([p.name, p.count, p.revenue.toFixed(2), p.count > 0 ? (p.revenue / p.count).toFixed(2) : '0.00']);
  });
  rows.push(['', '', '', '']);
  rows.push(['TOTAL', orderCount, totalRevenue.toFixed(2), avgOrder.toFixed(2)]);

  const csv = generateCSV(headers, rows);
  downloadCSV(csv, `revenue_summary_${format(dateRange.start, 'yyyy-MM-dd')}_to_${format(dateRange.end, 'yyyy-MM-dd')}.csv`);
}

const RevenueReport = ({ filteredOrders, dateRange }: RevenueReportProps) => {
  const { t } = useLanguage();

  const revenueSummary = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const orderCount = filteredOrders.length;
    const avgOrder = orderCount > 0 ? totalRevenue / orderCount : 0;

    const byDay: Record<string, { revenue: number; count: number }> = {};
    filteredOrders.forEach(o => {
      const day = o.created_at?.split('T')[0] || 'unknown';
      if (!byDay[day]) byDay[day] = { revenue: 0, count: 0 };
      byDay[day].revenue += Number(o.total_amount) || 0;
      byDay[day].count += 1;
    });

    const byProduct: Record<string, { revenue: number; count: number }> = {};
    filteredOrders.forEach(o => {
      const product = o.cake_size || 'Unknown';
      if (!byProduct[product]) byProduct[product] = { revenue: 0, count: 0 };
      byProduct[product].revenue += Number(o.total_amount) || 0;
      byProduct[product].count += 1;
    });

    const dailyData = Object.entries(byDay)
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const productData = Object.entries(byProduct)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue);

    return { totalRevenue, orderCount, avgOrder, dailyData, productData };
  }, [filteredOrders]);

  const handleExport = () => {
    exportRevenueSummary(filteredOrders, dateRange);
    toast.success(t('Reporte descargado', 'Report downloaded'));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            {t('Resumen de Ingresos', 'Revenue Summary')}
          </CardTitle>
          <CardDescription>
            {t('Desglose por día y producto', 'Breakdown by day and product')}
          </CardDescription>
        </div>
        <Button onClick={handleExport} size="sm">
          <Download className="mr-2 h-4 w-4" />
          {t('Exportar CSV', 'Export CSV')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Daily breakdown */}
        <div>
          <h4 className="text-sm font-semibold mb-3">{t('Por Día', 'By Day')}</h4>
          <div className="rounded-md border max-h-[300px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Fecha', 'Date')}</TableHead>
                  <TableHead className="text-right">{t('Pedidos', 'Orders')}</TableHead>
                  <TableHead className="text-right">{t('Ingresos', 'Revenue')}</TableHead>
                  <TableHead className="text-right">{t('Promedio', 'Average')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenueSummary.dailyData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {t('Sin datos para este período', 'No data for this period')}
                    </TableCell>
                  </TableRow>
                ) : (
                  revenueSummary.dailyData.map(d => (
                    <TableRow key={d.date}>
                      <TableCell className="font-medium">{d.date}</TableCell>
                      <TableCell className="text-right">{d.count}</TableCell>
                      <TableCell className="text-right">${d.revenue.toFixed(2)}</TableCell>
                      <TableCell className="text-right">${d.count > 0 ? (d.revenue / d.count).toFixed(2) : '0.00'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Product breakdown */}
        <div>
          <h4 className="text-sm font-semibold mb-3">{t('Por Producto/Tamaño', 'By Product/Size')}</h4>
          <div className="rounded-md border max-h-[300px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Producto', 'Product')}</TableHead>
                  <TableHead className="text-right">{t('Pedidos', 'Orders')}</TableHead>
                  <TableHead className="text-right">{t('Ingresos', 'Revenue')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenueSummary.productData.map(p => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">{p.count}</TableCell>
                    <TableCell className="text-right">${p.revenue.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RevenueReport;
