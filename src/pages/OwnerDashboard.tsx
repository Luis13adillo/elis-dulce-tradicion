/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { OwnerSidebar } from '@/components/dashboard/OwnerSidebar';
import { cn } from '@/lib/utils';
import { DashboardHeader, SearchResult } from '@/components/dashboard/DashboardHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  TrendingUp,
  DollarSign,
  Package,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Truck,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { formatPrice } from '@/lib/pricing';
import {
  DashboardMetrics,
  RevenueDataPoint,
  PopularItem,
  OrderStatusBreakdown
} from '@/lib/analytics';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import CancelOrderModal from '@/components/order/CancelOrderModal';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';
import { OrderListWithSearch } from '@/components/order/OrderListWithSearch';
import { OwnerCalendar } from '@/components/dashboard/OwnerCalendar';
import { PrintPreviewModal } from '@/components/print/PrintPreviewModal';
import MenuManager from '@/components/dashboard/MenuManager';
import InventoryManager from '@/components/dashboard/InventoryManager';
import ReportsManager from '@/components/dashboard/ReportsManager';
import TodayScheduleSummary from '@/components/dashboard/TodayScheduleSummary';
import { BusinessSettingsManager } from '@/components/admin/BusinessSettingsManager';
import { BusinessHoursManager } from '@/components/admin/BusinessHoursManager';
import ContactSubmissionsManager from '@/components/admin/ContactSubmissionsManager';
import OrderIssuesManager from '@/components/admin/OrderIssuesManager';
import { FAQManager } from '@/components/admin/FAQManager';
import { GalleryManager } from '@/components/admin/GalleryManager';
import { AnnouncementManager } from '@/components/admin/AnnouncementManager';
import { useBusinessSettings, useBusinessHours } from '@/lib/hooks/useCMS';
import { AuthenticatorAssuranceCheck } from '@/components/auth/AuthenticatorAssuranceCheck';
// MFA enforcement: Set 'Require MFA for owner role' in Supabase Auth dashboard → Users → owner@elisbakery.com → Settings

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const OwnerDashboard = () => {
  const { t } = useLanguage();
  const { user, isLoading: authLoading } = useAuth();
  const { data: businessSettings } = useBusinessSettings();
  const { data: businessHours } = useBusinessHours();

  // Derive earliest open and latest close from business hours
  const calendarHours = useMemo(() => {
    if (!businessHours || !Array.isArray(businessHours) || businessHours.length === 0) {
      return { start: undefined, end: undefined };
    }
    const openDays = businessHours.filter((h: any) => h.is_open && h.open_time && h.close_time);
    if (openDays.length === 0) return { start: undefined, end: undefined };

    const starts = openDays.map((h: any) => parseInt(h.open_time.split(':')[0]));
    const ends = openDays.map((h: any) => parseInt(h.close_time.split(':')[0]));
    return { start: Math.min(...starts), end: Math.max(...ends) };
  }, [businessHours]);

  // --- STATE ---
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [printOrder, setPrintOrder] = useState<any | null>(null);
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);

  // Raw Data (Single Source of Truth)
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);

  // Computed Metrics
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([]);
  const [popularItems, setPopularItems] = useState<PopularItem[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<OrderStatusBreakdown[]>([]);

  const [revenuePeriod, setRevenuePeriod] = useState<'today' | 'week' | 'month'>('today');
  const [settingsSubTab, setSettingsSubTab] = useState<'business' | 'hours' | 'contacts' | 'issues'>('business');
  const [websiteSubTab, setWebsiteSubTab] = useState<'gallery' | 'faq' | 'announcements'>('gallery');

  // Compute revenue trend: compare today vs yesterday
  const revenueTrend = useMemo(() => {
    if (allOrders.length === 0) return null;

    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    let todayRev = 0;
    let yesterdayRev = 0;

    allOrders.forEach(o => {
      if (!o.created_at) return;
      const d = o.created_at.split('T')[0];
      const amount = Number(o.total_amount) || 0;
      if (d === today) todayRev += amount;
      if (d === yesterday) yesterdayRev += amount;
    });

    if (yesterdayRev === 0) return todayRev > 0 ? { pct: 100, direction: 'up' as const } : null;

    const pct = Math.round(((todayRev - yesterdayRev) / yesterdayRev) * 100);
    return { pct: Math.abs(pct), direction: pct >= 0 ? 'up' as const : 'down' as const };
  }, [allOrders]);


  // --- 1. DATA LOADING (The "Brain") ---
  const loadDashboardData = async () => {
    try {
      setLoadError(null);

      // 1. Fetch Metrics (Optimized RPC)
      const freshMetrics = await api.getDashboardMetrics(revenuePeriod);
      setMetrics(freshMetrics as DashboardMetrics);

      // 2. Fetch RAW Orders (for Calendar/List)
      const orders = await api.getAllOrders();
      setAllOrders(Array.isArray(orders) ? orders : []);

      // 3. Status Breakdown (Offload to the component or API eventually)
      const breakdown = await api.getOrdersByStatus();
      setStatusBreakdown(breakdown as OrderStatusBreakdown[]);

      // 4. Fetch auxiliary data (Low Stock)
      const stock = await api.getLowStockItems();
      setLowStockItems(Array.isArray(stock) ? stock : []);

      // 5. Fetch Popular Items
      try {
        const popular = await api.getPopularItems();
        if (Array.isArray(popular) && popular.length > 0) {
          setPopularItems(popular.map((item: any) => ({
            itemType: 'size' as const,
            itemName: item.name || 'Unknown',
            orderCount: item.count || 0,
            totalRevenue: item.revenue || 0,
          })));
        }
      } catch {
        // Non-critical — overview still works without popular items
      }

    } catch (error) {
      setLoadError(t('Error al cargar datos. Intenta de nuevo.', 'Failed to load dashboard data. Please try again.'));
      toast.error(t('Error al sincronizar datos.', 'Error syncing dashboard data.'));
    } finally {
      setIsLoading(false);
    }
  };

  // Keep revenue chart computation client-side for now as it needs historical granularity
  // but we can optimize it in Phase 2


  // Re-compute revenue chart when period changes or orders update
  useEffect(() => {
    if (allOrders.length === 0 && !isLoading) {
      // Even if 0 orders, we should show empty chart
    }

    const daysMap = new Map<string, number>();
    const daysToLookBack = revenuePeriod === 'today' ? 7 : revenuePeriod === 'week' ? 30 : 90;

    // Init map with explicit 0s for previous days
    for (let i = daysToLookBack - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      daysMap.set(format(d, 'yyyy-MM-dd'), 0);
    }

    // Sum revenue
    allOrders.forEach(o => {
      if (!o.created_at) return;
      const d = o.created_at.split('T')[0]; // YYYY-MM-DD
      if (daysMap.has(d)) {
        daysMap.set(d, (daysMap.get(d) || 0) + (Number(o.total_amount) || 0));
      }
    });

    const chartData = Array.from(daysMap.entries()).map(([date, revenue]) => ({
      date,
      revenue,
      orderCount: 0,
      avgOrderValue: 0
    }));
    setRevenueData(chartData);

  }, [allOrders, revenuePeriod, isLoading]);


  // --- 2. LIFECYCLE & REALTIME ---

  // Initial Load (ProtectedRoute already enforces requiredRole="owner")
  useEffect(() => {
    if (!authLoading && user) {
      loadDashboardData();
    }
  }, [user, authLoading]);

  // Real-time Listener (Supabase)
  useRealtimeOrders({
    filterByUserId: false,
    onOrderInsert: () => {
      toast.info('New Order Received! 🔔');
      loadDashboardData();
    },
    onOrderUpdate: () => loadDashboardData(),
    onOrderDelete: () => loadDashboardData(),
  });

  // --- 3. GLOBAL SEARCH ---
  const searchCacheRef = useRef<{ products: any[]; ingredients: any[] } | null>(null);

  const handleGlobalSearch = useCallback(
    (query: string): SearchResult[] => {
      const q = query.toLowerCase();
      const results: SearchResult[] = [];

      // Search orders (already in state)
      allOrders
        .filter(
          (o) =>
            o.customer_name?.toLowerCase().includes(q) ||
            o.order_number?.toLowerCase().includes(q) ||
            o.customer_email?.toLowerCase().includes(q)
        )
        .slice(0, 5)
        .forEach((o) => {
          results.push({
            type: 'order',
            label: o.customer_name || o.order_number || `Order #${o.id}`,
            subtitle: `${o.order_number || ''} · ${o.status || ''} · $${Number(o.total_amount || 0).toFixed(2)}`,
            tabId: 'orders',
          });
        });

      // Search products (lazy-loaded cache)
      if (searchCacheRef.current?.products) {
        searchCacheRef.current.products
          .filter(
            (p: any) =>
              p.name_en?.toLowerCase().includes(q) ||
              p.name_es?.toLowerCase().includes(q)
          )
          .slice(0, 5)
          .forEach((p: any) => {
            results.push({
              type: 'product',
              label: p.name_en || p.name_es,
              subtitle: `${p.category || ''} · $${Number(p.price || 0).toFixed(2)}`,
              tabId: 'products',
            });
          });
      }

      // Search ingredients (lazy-loaded cache)
      if (searchCacheRef.current?.ingredients) {
        searchCacheRef.current.ingredients
          .filter((i: any) => i.name?.toLowerCase().includes(q))
          .slice(0, 5)
          .forEach((i: any) => {
            results.push({
              type: 'ingredient',
              label: i.name,
              subtitle: `${i.quantity} ${i.unit} · ${i.category || ''}`,
              tabId: 'inventory',
            });
          });
      }

      // Load products + ingredients on first search if not cached
      if (!searchCacheRef.current) {
        Promise.all([api.getAllProducts(), api.getInventory()])
          .then(([products, ingredients]) => {
            searchCacheRef.current = {
              products: Array.isArray(products) ? products : [],
              ingredients: Array.isArray(ingredients) ? ingredients : [],
            };
          })
          .catch(() => {
            searchCacheRef.current = { products: [], ingredients: [] };
          });
      }

      return results;
    },
    [allOrders]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-[#C6A649]" />
        <span className="ml-3 text-gray-400 font-medium">Loading Dashboard...</span>
      </div>
    );
  }

  if (loadError && allOrders.length === 0 && !metrics) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-orange-400 mx-auto" />
          <p className="text-gray-600 font-medium">{loadError}</p>
          <Button
            onClick={() => { setIsLoading(true); loadDashboardData(); }}
            className="bg-[#C6A649] hover:bg-[#b0933f] text-white gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {t('Reintentar', 'Retry')}
          </Button>
        </div>
      </div>
    );
  }

  // --- RENDER ---
  return (
    <AuthenticatorAssuranceCheck userRole="owner">
    <div className="flex h-screen w-full bg-[#F5F6FA] overflow-hidden">
      <PrintPreviewModal
        order={printOrder}
        isOpen={!!printOrder}
        onClose={() => setPrintOrder(null)}
      />

      <OwnerSidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader onSearch={handleGlobalSearch} onNavigateTab={setActiveTab} />

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">

            {/* --- TAB: OVERVIEW --- */}
            <TabsContent value="overview" className="outline-none">
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: { staggerChildren: 0.1 }
                  }
                }}
                className="space-y-6"
              >
                {/* METRIC CARDS */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: t('Ingresos Hoy', 'Revenue Today'), value: formatPrice(metrics?.todayRevenue || 0), sub: 'Live Data', icon: DollarSign, color: 'text-orange-600', bg: 'bg-orange-100', trend: revenueTrend ? `${revenueTrend.direction === 'up' ? '↑' : '↓'} ${revenueTrend.pct}%` : null, trendUp: revenueTrend?.direction === 'up' },
                    { label: t('Pedidos Hoy', 'Orders Today'), value: metrics?.todayOrders || 0, sub: `${metrics?.pendingOrders} pend`, icon: Package, color: 'text-blue-600', bg: 'bg-blue-100' },
                    { label: t('Ticket Promedio', 'Avg Ticket'), value: formatPrice(metrics?.averageOrderValue || 0), sub: t('por pedido', 'per order'), icon: BarChart3, color: 'text-indigo-600', bg: 'bg-indigo-100' },
                    { label: t('Entregas Hoy', "Today's Deliveries"), value: metrics?.todayDeliveries || 0, sub: `${metrics?.totalCustomers || 0} cli`, icon: Truck, color: 'text-emerald-600', bg: 'bg-emerald-100' }
                  ].map((card, idx) => (
                    <motion.div
                      key={idx}
                      variants={{
                        hidden: { opacity: 0, y: 20 },
                        visible: { opacity: 1, y: 0 }
                      }}
                    >
                      <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/70 backdrop-blur-xl hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] transition-all duration-500 rounded-3xl group overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">{card.label}</p>
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl transition-transform group-hover:scale-110", card.bg, card.color)}>
                            <card.icon className="h-5 w-5" />
                          </div>
                        </CardHeader>
                        <CardContent>
                          <h3 className="text-3xl font-black text-gray-900 tracking-tighter">{card.value}</h3>
                          <div className="flex items-center gap-2 mt-2">
                            {card.trend && (
                              <span className={cn(
                                "text-[10px] font-black px-2 py-0.5 rounded-full",
                                card.trendUp !== false ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10"
                              )}>{card.trend}</span>
                            )}
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{card.sub}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* TODAY'S SCHEDULE SUMMARY */}
              <TodayScheduleSummary orders={allOrders} maxDailyCapacity={businessSettings?.max_daily_capacity || 10} />

              {/* CHARTS ROW */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Revenue Graph */}
                <div className="lg:col-span-2">
                  <Card className="border-none shadow-sm h-[400px]">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>{t('Tendencias', 'Trends')}</CardTitle>
                      <div className="flex bg-gray-100 rounded-lg p-1">
                        <button onClick={() => setRevenuePeriod('today')} className={`px-3 py-1 text-xs rounded-md ${revenuePeriod === 'today' ? 'bg-white shadow' : ''}`}>{t('Hoy', '7D')}</button>
                        <button onClick={() => setRevenuePeriod('week')} className={`px-3 py-1 text-xs rounded-md ${revenuePeriod === 'week' ? 'bg-white shadow' : ''}`}>30D</button>
                      </div>
                    </CardHeader>
                    <CardContent className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={revenueData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                          <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                          <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                          <Line type="monotone" dataKey="revenue" stroke="#C6A649" strokeWidth={3} dot={{ fill: '#fff', stroke: '#C6A649', strokeWidth: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Status Pie */}
                <div>
                  <Card className="border-none shadow-sm h-[400px]">
                    <CardHeader>
                      <CardTitle>{t('Estado de Pedidos', 'Order Status')}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                          <Pie
                            data={statusBreakdown}
                            dataKey="count"
                            nameKey="status"
                            cx="50%" cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                          >
                            {statusBreakdown.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend verticalAlign="bottom" />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* POPULAR ITEMS + LOW STOCK ROW */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Popular Items */}
                <Card className="border-none shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{t('Más Pedidos', 'Most Ordered')}</CardTitle>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {popularItems.length === 0 ? (
                      <p className="text-center py-6 text-gray-400 text-sm">{t('Sin datos aún', 'No data yet')}</p>
                    ) : (
                      <div className="space-y-3">
                        {popularItems.map((item, i) => (
                          <div key={item.itemName} className="flex items-center gap-3">
                            <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-medium text-gray-700 truncate">{item.itemName}</p>
                                <span className="text-xs font-bold text-gray-500 ml-2">{item.orderCount}</span>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#C6A649] rounded-full transition-all"
                                  style={{ width: `${(item.orderCount / (popularItems[0]?.orderCount || 1)) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Low Stock Alerts */}
                <Card className="border-none shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{t('Alertas de Stock', 'Stock Alerts')}</CardTitle>
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${lowStockItems.length > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {lowStockItems.length > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {lowStockItems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6">
                        <CheckCircle2 className="h-10 w-10 text-green-400 mb-2" />
                        <p className="text-sm text-gray-400">{t('Todo abastecido', 'All stocked')}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {lowStockItems.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                              <p className="text-sm font-medium text-gray-700">{item.name || item.title}</p>
                            </div>
                            <Badge variant="destructive" className="text-[10px]">
                              {t('Bajo', 'Low')}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* RECENT ORDERS TABLE (Preview) */}
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{t('Pedidos Recientes', 'Recent Orders')}</CardTitle>
                  <Button variant="ghost" onClick={() => setActiveTab('orders')} className="text-sm text-blue-600">Ver Todo</Button>
                </CardHeader>
                <CardContent>
                  {allOrders.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">No recent orders.</div>
                  ) : (
                    <div className="space-y-4">
                      {allOrders.slice(0, 5).map(order => (
                        <div key={order.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer" onClick={() => setPrintOrder(order)}>
                          <div className="flex items-center gap-4">
                            <div className={`w-2 h-12 rounded-full ${order.status === 'pending' ? 'bg-orange-400' : order.status === 'ready' ? 'bg-green-400' : 'bg-blue-400'}`}></div>
                            <div>
                              <p className="font-bold text-gray-800">{order.customer_name}</p>
                              <p className="text-sm text-gray-500">#{order.order_number} • {order.cake_size}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">{formatPrice(order.total_amount)}</p>
                            <Badge variant="outline" className="text-[10px]">{order.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* --- TAB: ORDERS (FULL LIST) --- */}
            <TabsContent value="orders">
              <OrderListWithSearch
                userRole="owner"
                onOrderClick={(order) => setPrintOrder(order)}
                showExport={true}
              // We verified OrderListWithSearch uses our robust api.getAllOrders() too.
              />
            </TabsContent>

            {/* --- TAB: CALENDAR --- */}
            <TabsContent value="calendar">
              <div className="h-[calc(100vh-140px)]">
                <OwnerCalendar
                  orders={allOrders}
                  onOrderClick={(order) => setPrintOrder(order)}
                  businessStartHour={calendarHours.start}
                  businessEndHour={calendarHours.end}
                  maxDailyCapacity={businessSettings?.max_daily_capacity || 10}
                />
              </div>
            </TabsContent>

            {/* --- TAB: PRODUCTS --- */}
            <TabsContent value="products" className="animate-in fade-in slide-in-from-bottom-5 duration-500">
              <MenuManager />
            </TabsContent>

            {/* --- TAB: INVENTORY --- */}
            <TabsContent value="inventory" className="animate-in fade-in slide-in-from-bottom-5 duration-500">
              <InventoryManager />
            </TabsContent>

            {/* --- TAB: REPORTS --- */}
            <TabsContent value="reports" className="animate-in fade-in slide-in-from-bottom-5 duration-500">
              <ReportsManager />
            </TabsContent>

            {/* --- TAB: SETTINGS --- */}
            <TabsContent value="settings" className="animate-in fade-in slide-in-from-bottom-5 duration-500">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{t('Configuración', 'Settings')}</h2>
                  <p className="text-sm text-gray-500 mt-1">{t('Administra tu negocio', 'Manage your business')}</p>
                </div>
                <div className="flex gap-2 border-b border-gray-200 pb-1">
                  {([
                    { id: 'business' as const, label: t('Negocio', 'Business') },
                    { id: 'hours' as const, label: t('Horarios', 'Hours') },
                    { id: 'contacts' as const, label: t('Contactos', 'Contacts') },
                    { id: 'issues' as const, label: t('Problemas', 'Issues') },
                  ]).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setSettingsSubTab(tab.id)}
                      className={cn(
                        "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors",
                        settingsSubTab === tab.id
                          ? "bg-white text-gray-900 border border-b-white border-gray-200 -mb-[1px]"
                          : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  {settingsSubTab === 'business' && <BusinessSettingsManager />}
                  {settingsSubTab === 'hours' && <BusinessHoursManager />}
                  {settingsSubTab === 'contacts' && <ContactSubmissionsManager />}
                  {settingsSubTab === 'issues' && <OrderIssuesManager />}
                </div>
              </div>
            </TabsContent>

            {/* --- TAB: WEBSITE CONTENT --- */}
            <TabsContent value="website" className="animate-in fade-in slide-in-from-bottom-5 duration-500">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{t('Contenido del Sitio', 'Website Content')}</h2>
                  <p className="text-sm text-gray-500 mt-1">{t('Gestiona el contenido público', 'Manage public-facing content')}</p>
                </div>
                <div className="flex gap-2 border-b border-gray-200 pb-1">
                  {([
                    { id: 'gallery' as const, label: t('Galería', 'Gallery') },
                    { id: 'faq' as const, label: t('Preguntas Frecuentes', 'FAQ') },
                    { id: 'announcements' as const, label: t('Anuncios', 'Announcements') },
                  ]).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setWebsiteSubTab(tab.id)}
                      className={cn(
                        "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors",
                        websiteSubTab === tab.id
                          ? "bg-white text-gray-900 border border-b-white border-gray-200 -mb-[1px]"
                          : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  {websiteSubTab === 'gallery' && <GalleryManager />}
                  {websiteSubTab === 'faq' && <FAQManager />}
                  {websiteSubTab === 'announcements' && <AnnouncementManager />}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {cancelOrderId && (
        <CancelOrderModal
          order={allOrders.find(o => o.id === cancelOrderId)}
          open={!!cancelOrderId}
          onClose={() => setCancelOrderId(null)}
          onSuccess={() => { loadDashboardData(); setCancelOrderId(null); }}
          isAdmin={true}
        />
      )}
    </div>
    </AuthenticatorAssuranceCheck>
  );
};

export default OwnerDashboard;
