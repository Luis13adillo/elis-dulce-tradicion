import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/pricing';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Search, Users, Mail, Phone, ShoppingBag, Star } from 'lucide-react';

export interface CustomerStats {
  name: string;
  email: string;
  phone: string;
  orders: any[];
  totalSpent: number;
}

interface CustomerListViewProps {
  customers: CustomerStats[];
  onOrderClick?: (order: any) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700',
  confirmed: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-purple-100 text-purple-700',
  ready: 'bg-green-100 text-green-700',
  out_for_delivery: 'bg-cyan-100 text-cyan-700',
  delivered: 'bg-teal-100 text-teal-700',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
};

function getFavoriteProduct(orders: any[]): string {
  if (orders.length === 0) return '—';
  const freq = new Map<string, number>();
  orders.forEach(o => {
    const label = [o.cake_size, o.cake_flavor].filter(Boolean).join(' · ') || o.cake_type || '—';
    freq.set(label, (freq.get(label) || 0) + 1);
  });
  let best = '—';
  let max = 0;
  freq.forEach((count, label) => {
    if (count > max) { max = count; best = label; }
  });
  return best;
}

export const CustomerListView = ({ customers, onOrderClick }: CustomerListViewProps) => {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerStats | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    );
  }, [customers, search]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('Clientes', 'Customers')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {customers.length} {t('clientes únicos', 'unique customers')}
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={t('Buscar cliente...', 'Search customer...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Users className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm">{t('Sin clientes todavía', 'No customers yet')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-400">
                  {t('Cliente', 'Customer')}
                </th>
                <th className="text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-400 hidden md:table-cell">
                  {t('Contacto', 'Contact')}
                </th>
                <th className="text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-400">
                  {t('Pedidos', 'Orders')}
                </th>
                <th className="text-right px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-400">
                  {t('Total Gastado', 'Total Spent')}
                </th>
                <th className="text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-400 hidden lg:table-cell">
                  {t('Favorito', 'Favorite')}
                </th>
                <th className="text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-400 hidden lg:table-cell">
                  {t('Último Pedido', 'Last Order')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((customer, idx) => {
                const lastOrder = customer.orders
                  .slice()
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
                const isRepeat = customer.orders.length > 1;

                return (
                  <tr
                    key={`${customer.email || customer.name}-${idx}`}
                    className="hover:bg-amber-50/40 cursor-pointer transition-colors"
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    {/* Name */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#C6A649]/10 text-[#C6A649] font-bold text-xs">
                          {(customer.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 leading-tight">{customer.name || '—'}</p>
                          {isRepeat && (
                            <Badge className="text-[9px] px-1.5 py-0 bg-amber-100 text-amber-700 border-0 mt-0.5">
                              <Star className="h-2.5 w-2.5 mr-0.5 fill-current" />
                              {t('Recurrente', 'Repeat')}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <div className="space-y-0.5">
                        {customer.email && (
                          <a
                            href={`mailto:${customer.email}`}
                            className="flex items-center gap-1 text-blue-600 hover:underline text-xs"
                            onClick={e => e.stopPropagation()}
                          >
                            <Mail className="h-3 w-3" />
                            {customer.email}
                          </a>
                        )}
                        {customer.phone && (
                          <a
                            href={`tel:${customer.phone}`}
                            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-xs"
                            onClick={e => e.stopPropagation()}
                          >
                            <Phone className="h-3 w-3" />
                            {customer.phone}
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Orders count */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <ShoppingBag className="h-3.5 w-3.5 text-gray-400" />
                        <span className="font-bold text-gray-800">{customer.orders.length}</span>
                      </div>
                      {lastOrder && (
                        <p className="text-[10px] text-gray-400 mt-0.5 hidden lg:block">
                          {t('Último', 'Last')}: {format(new Date(lastOrder.created_at), 'MMM d')}
                        </p>
                      )}
                    </td>

                    {/* Total spent */}
                    <td className="px-5 py-3.5 text-right">
                      <span className="font-bold text-gray-900">{formatPrice(customer.totalSpent)}</span>
                    </td>

                    {/* Favorite */}
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <span className="text-xs text-gray-600 max-w-[140px] block truncate">
                        {getFavoriteProduct(customer.orders)}
                      </span>
                    </td>

                    {/* Last order */}
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      {lastOrder ? (
                        <div>
                          <p className="text-xs text-gray-600">
                            {format(new Date(lastOrder.created_at), 'MMM d, yyyy')}
                          </p>
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full font-semibold mt-0.5 inline-block',
                            STATUS_COLORS[lastOrder.status] || 'bg-gray-100 text-gray-600'
                          )}>
                            {lastOrder.status}
                          </span>
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-out Customer Panel */}
      <Sheet open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedCustomer && (
            <>
              <SheetHeader className="pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C6A649]/10 text-[#C6A649] font-bold text-lg">
                    {(selectedCustomer.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <SheetTitle className="text-lg font-bold">{selectedCustomer.name}</SheetTitle>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {selectedCustomer.orders.length} {t('pedidos', 'orders')} · {formatPrice(selectedCustomer.totalSpent)} {t('total', 'total')}
                    </p>
                  </div>
                </div>

                {/* Contact Info */}
                <div className="flex flex-wrap gap-3 mt-3">
                  {selectedCustomer.email && (
                    <a href={`mailto:${selectedCustomer.email}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                      <Mail className="h-4 w-4" />
                      {selectedCustomer.email}
                    </a>
                  )}
                  {selectedCustomer.phone && (
                    <a href={`tel:${selectedCustomer.phone}`} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
                      <Phone className="h-4 w-4" />
                      {selectedCustomer.phone}
                    </a>
                  )}
                </div>
              </SheetHeader>

              {/* Order History */}
              <div className="mt-5 space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">
                  {t('Historial de Pedidos', 'Order History')}
                </h3>
                {selectedCustomer.orders
                  .slice()
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((order) => (
                    <div
                      key={order.id}
                      className="rounded-xl border border-gray-100 bg-gray-50 p-4 hover:bg-amber-50/30 cursor-pointer transition-colors"
                      onClick={() => { onOrderClick?.(order); setSelectedCustomer(null); }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-bold text-gray-900">
                              #{order.order_number || order.id}
                            </p>
                            <span className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
                              STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'
                            )}>
                              {order.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            {[order.cake_size, order.cake_flavor, order.cake_type]
                              .filter(Boolean)
                              .join(' · ') || t('Sin detalles', 'No details')}
                          </p>
                          {order.delivery_option && (
                            <p className="text-[10px] text-gray-400 mt-0.5 capitalize">{order.delivery_option}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-gray-900">{formatPrice(order.total_amount)}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {order.created_at ? format(new Date(order.created_at), 'MMM d, yyyy') : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
