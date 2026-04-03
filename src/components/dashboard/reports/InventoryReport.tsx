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
import { Download, Package } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { generateCSV, downloadCSV } from './reportUtils';

interface InventoryReportProps {
  ingredients: any[];
}

export function exportInventoryReport(ingredients: any[]): void {
  const headers = ['Ingredient', 'Category', 'Quantity', 'Unit', 'Low Threshold', 'Supplier', 'Status', 'Last Updated'];
  const rows = ingredients.map(i => [
    i.name,
    i.category || '',
    i.quantity,
    i.unit,
    i.low_stock_threshold,
    i.supplier || '',
    i.quantity <= i.low_stock_threshold ? 'LOW STOCK' : 'OK',
    i.last_updated ? i.last_updated.split('T')[0] : '',
  ]);

  const csv = generateCSV(headers, rows);
  downloadCSV(csv, `inventory_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
}

const InventoryReport = ({ ingredients }: InventoryReportProps) => {
  const { t } = useLanguage();

  const inventoryReport = useMemo(() => {
    const lowStock = ingredients.filter(i => i.quantity <= i.low_stock_threshold);
    const totalItems = ingredients.length;
    const totalValue = ingredients.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

    const byCategory: Record<string, { count: number; totalQty: number }> = {};
    ingredients.forEach(i => {
      const cat = i.category || 'uncategorized';
      if (!byCategory[cat]) byCategory[cat] = { count: 0, totalQty: 0 };
      byCategory[cat].count += 1;
      byCategory[cat].totalQty += Number(i.quantity) || 0;
    });

    return { ingredients, lowStock, totalItems, totalValue, byCategory };
  }, [ingredients]);

  const handleExport = () => {
    exportInventoryReport(ingredients);
    toast.success(t('Reporte descargado', 'Report downloaded'));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-orange-500" />
            {t('Reporte de Inventario', 'Inventory Report')}
          </CardTitle>
          <CardDescription>
            {t('Estado actual del inventario y alertas de stock', 'Current inventory status and stock alerts')}
          </CardDescription>
        </div>
        <Button onClick={handleExport} size="sm">
          <Download className="mr-2 h-4 w-4" />
          {t('Exportar CSV', 'Export CSV')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Category summary */}
        <div>
          <h4 className="text-sm font-semibold mb-3">{t('Por Categoría', 'By Category')}</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(inventoryReport.byCategory).map(([cat, data]) => (
              <Badge key={cat} variant="outline" className="text-sm py-1 px-3">
                {cat}: {data.count} {t('items', 'items')} ({data.totalQty.toFixed(1)} {t('unidades', 'units')})
              </Badge>
            ))}
          </div>
        </div>

        {/* Low stock alerts */}
        {inventoryReport.lowStock.length > 0 && (
          <div className="rounded-lg bg-red-50 p-4">
            <h4 className="text-sm font-semibold text-red-800 mb-2">
              {t('Alertas de Stock Bajo', 'Low Stock Alerts')} ({inventoryReport.lowStock.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {inventoryReport.lowStock.map(i => (
                <Badge key={i.id} variant="destructive">
                  {i.name}: {i.quantity} {i.unit}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Full inventory table */}
        <div className="rounded-md border max-h-[400px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Ingrediente', 'Ingredient')}</TableHead>
                <TableHead>{t('Categoría', 'Category')}</TableHead>
                <TableHead className="text-right">{t('Cantidad', 'Quantity')}</TableHead>
                <TableHead>{t('Unidad', 'Unit')}</TableHead>
                <TableHead className="text-right">{t('Umbral', 'Threshold')}</TableHead>
                <TableHead>{t('Estado', 'Status')}</TableHead>
                <TableHead>{t('Proveedor', 'Supplier')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventoryReport.ingredients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {t('Sin ingredientes en inventario', 'No ingredients in inventory')}
                  </TableCell>
                </TableRow>
              ) : (
                inventoryReport.ingredients.map(i => (
                  <TableRow key={i.id} className={i.quantity <= i.low_stock_threshold ? 'bg-red-50' : ''}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell>{i.category || '-'}</TableCell>
                    <TableCell className="text-right font-semibold">{i.quantity}</TableCell>
                    <TableCell>{i.unit}</TableCell>
                    <TableCell className="text-right">{i.low_stock_threshold}</TableCell>
                    <TableCell>
                      {i.quantity <= i.low_stock_threshold ? (
                        <Badge variant="destructive">{t('Bajo', 'Low')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('OK', 'OK')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{i.supplier || '-'}</TableCell>
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

export default InventoryReport;
