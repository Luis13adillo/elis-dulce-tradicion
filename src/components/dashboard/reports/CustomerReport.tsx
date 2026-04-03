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
import { Download, Users } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { generateCSV, downloadCSV } from './reportUtils';

interface CustomerReportProps {
  filteredOrders: any[];
  dateRange: { start: Date; end: Date };
}

export function exportCustomerReport(filteredOrders: any[], dateRange: { start: Date; end: Date }): void {
  const customers: Record<string, { name: string; email: string; orders: number; totalSpent: number; lastOrder: string }> = {};
  filteredOrders.forEach(o => {
    const key = o.customer_email || o.customer_name || 'Unknown';
    if (!customers[key]) {
      customers[key] = {
        name: o.customer_name || 'Unknown',
        email: o.customer_email || '',
        orders: 0,
        totalSpent: 0,
        lastOrder: o.created_at || '',
      };
    }
    customers[key].orders += 1;
    customers[key].totalSpent += Number(o.total_amount) || 0;
    if (o.created_at > customers[key].lastOrder) {
      customers[key].lastOrder = o.created_at;
    }
  });

  const list = Object.values(customers).sort((a, b) => b.totalSpent - a.totalSpent);

  const headers = ['Customer', 'Email', 'Orders', 'Total Spent ($)', 'Avg Order ($)', 'Last Order'];
  const rows = list.map(c => [
    c.name,
    c.email,
    c.orders,
    c.totalSpent.toFixed(2),
    c.orders > 0 ? (c.totalSpent / c.orders).toFixed(2) : '0.00',
    c.lastOrder ? c.lastOrder.split('T')[0] : '',
  ]);

  const csv = generateCSV(headers, rows);
  downloadCSV(csv, `customer_report_${format(dateRange.start, 'yyyy-MM-dd')}_to_${format(dateRange.end, 'yyyy-MM-dd')}.csv`);
}

const CustomerReport = ({ filteredOrders, dateRange }: CustomerReportProps) => {
  const { t } = useLanguage();

  const customerReport = useMemo(() => {
    const customers: Record<string, { name: string; email: string; orders: number; totalSpent: number; lastOrder: string }> = {};
    filteredOrders.forEach(o => {
      const key = o.customer_email || o.customer_name || 'Unknown';
      if (!customers[key]) {
        customers[key] = {
          name: o.customer_name || 'Unknown',
          email: o.customer_email || '',
          orders: 0,
          totalSpent: 0,
          lastOrder: o.created_at || '',
        };
      }
      customers[key].orders += 1;
      customers[key].totalSpent += Number(o.total_amount) || 0;
      if (o.created_at > customers[key].lastOrder) {
        customers[key].lastOrder = o.created_at;
      }
    });

    const list = Object.values(customers).sort((a, b) => b.totalSpent - a.totalSpent);
    const totalCustomers = list.length;
    const repeatCustomers = list.filter(c => c.orders > 1).length;
    const avgOrdersPerCustomer = totalCustomers > 0 ? filteredOrders.length / totalCustomers : 0;

    return { list, totalCustomers, repeatCustomers, avgOrdersPerCustomer };
  }, [filteredOrders]);

  const handleExport = () => {
    exportCustomerReport(filteredOrders, dateRange);
    toast.success(t('Reporte descargado', 'Report downloaded'));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-500" />
            {t('Reporte de Clientes', 'Customer Report')}
          </CardTitle>
          <CardDescription>
            {t('Clientes recurrentes y frecuencia de pedidos', 'Repeat customers and order frequency')}
          </CardDescription>
        </div>
        <Button onClick={handleExport} size="sm">
          <Download className="mr-2 h-4 w-4" />
          {t('Exportar CSV', 'Export CSV')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold">{customerReport.totalCustomers}</div>
            <p className="text-sm text-muted-foreground">{t('Total Clientes', 'Total Customers')}</p>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold">{customerReport.repeatCustomers}</div>
            <p className="text-sm text-muted-foreground">{t('Recurrentes', 'Repeat')}</p>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold">{customerReport.avgOrdersPerCustomer.toFixed(1)}</div>
            <p className="text-sm text-muted-foreground">{t('Pedidos/Cliente', 'Orders/Customer')}</p>
          </div>
        </div>

        {/* Customer table */}
        <div className="rounded-md border max-h-[400px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Cliente', 'Customer')}</TableHead>
                <TableHead>{t('Email', 'Email')}</TableHead>
                <TableHead className="text-right">{t('Pedidos', 'Orders')}</TableHead>
                <TableHead className="text-right">{t('Total Gastado', 'Total Spent')}</TableHead>
                <TableHead className="text-right">{t('Promedio', 'Average')}</TableHead>
                <TableHead>{t('Último Pedido', 'Last Order')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customerReport.list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {t('Sin datos para este período', 'No data for this period')}
                  </TableCell>
                </TableRow>
              ) : (
                customerReport.list.slice(0, 50).map((c, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email}</TableCell>
                    <TableCell className="text-right">
                      {c.orders}
                      {c.orders > 1 && <Badge variant="secondary" className="ml-2 text-xs">{t('Recurrente', 'Repeat')}</Badge>}
                    </TableCell>
                    <TableCell className="text-right">${c.totalSpent.toFixed(2)}</TableCell>
                    <TableCell className="text-right">${c.orders > 0 ? (c.totalSpent / c.orders).toFixed(2) : '0.00'}</TableCell>
                    <TableCell>{c.lastOrder ? c.lastOrder.split('T')[0] : ''}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default CustomerReport;
