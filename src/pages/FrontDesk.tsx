import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useOrdersFeed } from '@/hooks/useOrdersFeed';
import { useNotificationState } from '@/hooks/useNotificationState';
import { api } from '@/lib/api';
import { useBusinessSettings } from '@/lib/hooks/useCMS';
import { toast } from 'sonner';
import { Order } from '@/types/order';
import { parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

// Components
import { KitchenRedesignedLayout } from '@/components/kitchen/KitchenRedesignedLayout';
import { KitchenNavTabs, KitchenTab } from '@/components/kitchen/KitchenNavTabs';
import { ModernOrderCard } from '@/components/kitchen/ModernOrderCard';
import { OrderScheduler } from '@/components/dashboard/OrderScheduler';
import { OwnerCalendar } from '@/components/dashboard/OwnerCalendar';
import { PrintPreviewModal } from '@/components/print/PrintPreviewModal';
import TodayScheduleSummary from '@/components/dashboard/TodayScheduleSummary';
import { FullScreenOrderAlert } from '@/components/kitchen/FullScreenOrderAlert';
import { NotificationPanel } from '@/components/kitchen/NotificationPanel';
import CancelOrderModal from '@/components/order/CancelOrderModal';
import { FrontDeskInventory } from '@/components/kitchen/FrontDeskInventory';
import { DeliveryManagementPanel } from '@/components/kitchen/DeliveryManagementPanel';
import ReportsManager from '@/components/dashboard/ReportsManager';
import { QuickStatsWidget } from '@/components/dashboard/QuickStatsWidget';
import { UrgentOrdersBanner } from '@/components/kitchen/UrgentOrdersBanner';
import { Package, AlertTriangle, ChevronLeft, ChevronRight, WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { AuthenticatorAssuranceCheck } from '@/components/auth/AuthenticatorAssuranceCheck';

const FrontDesk = () => {
  const { t } = useLanguage();
  const { user, isLoading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();

  const [isSoundEnabled, setIsSoundEnabled] = useState(true);

  // Data Hooks
  const {
    orders,
    isLoading: feedLoading,
    isRefreshing,
    refreshOrders,
    newOrderAlert,
    latestOrder,
    dismissAlert,
    isConnected,
    connectionError,
    reconnect
  } = useOrdersFeed(undefined, { soundEnabled: isSoundEnabled });

  // Notification State
  const { markAsRead, markAllAsRead, isUnread } = useNotificationState();
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);

  // Business Settings (for calendar capacity)
  const { data: businessSettings } = useBusinessSettings();
  const maxDailyCapacity = businessSettings?.max_daily_capacity || 10;

  const ACTIVE_STATUSES = ['pending', 'confirmed', 'in_progress', 'ready'];
  const unreadCount = orders.filter(o => ACTIVE_STATUSES.includes(o.status) && isUnread(o.id)).length;

  // Cancel Order State
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  const handleCancelSuccess = () => {
    if (cancelTarget) {
      // Send cancellation email notification (non-blocking)
      toast.info(t('Enviando correo...', 'Sending email...'));
      api.sendStatusUpdate(cancelTarget, cancelTarget.status, 'cancelled')
        .then(({ success }) => {
          if (success) toast.success(t('Correo de cancelación enviado', 'Cancellation email sent'));
        });
    }
    setCancelTarget(null);
    refreshOrders();
  };

  // State
  const [activeTab, setActiveTab] = useState<KitchenTab>('active');
  const [activeView, setActiveView] = useState<'queue' | 'upcoming' | 'calendar' | 'inventory' | 'deliveries' | 'reports'>('queue');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true); // Theme State
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 12;

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  // Auth is enforced by ProtectedRoute (requiredRole={['baker', 'owner']})

  const handleOrderAction = async (orderId: number, action: 'confirm' | 'start' | 'ready' | 'delivery' | 'complete') => {
    let status = '';
    let successMsg = '';

    switch (action) {
      case 'delivery':
        status = 'out_for_delivery';
        successMsg = t('Enviada a domicilio', 'Dispatched for delivery');
        break;
      case 'complete':
        status = 'delivered';
        successMsg = t('Orden completada', 'Order completed');
        break;
      case 'confirm':
        status = 'confirmed';
        successMsg = t('Orden aceptada', 'Order accepted');
        break;
      case 'start':
        status = 'in_progress';
        successMsg = t('Comenzando preparación', 'Started preparing');
        break;
      case 'ready':
        status = 'ready';
        successMsg = t('Orden lista', 'Order marked ready');
        break;
    }

    if (!status) return;

    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return;
    const oldStatus = targetOrder.status;

    try {
      await api.updateOrderStatus(orderId, status);
      toast.success(successMsg);

      // Send Email Notifications
      if (action === 'confirm') {
        toast.info(t('Enviando correo...', 'Sending email...'));
        api.sendOrderConfirmation(targetOrder).then(({ success }) => {
          if (success) toast.success(t('Correo enviado', 'Email sent'));
          else toast.error(t('Error al enviar correo', 'Failed to send email'));
        });
      } else if (action === 'ready') {
        toast.info(t('Enviando correo...', 'Sending email...'));
        api.sendReadyNotification(targetOrder).then(({ success }) => {
          if (success) toast.success(t('Correo enviado', 'Email sent'));
          else toast.error(t('Error al enviar correo', 'Failed to send email'));
        });
      } else if (action === 'delivery' || action === 'complete') {
        const finalStatus = action === 'delivery' ? 'delivered' : 'completed';
        toast.info(t('Enviando correo...', 'Sending email...'));
        api.sendStatusUpdate(targetOrder, oldStatus, finalStatus).then(({ success }) => {
          if (success) toast.success(t('Correo enviado', 'Email sent'));
          else toast.error(t('Error al enviar correo', 'Failed to send email'));
        });
      }

      refreshOrders();
    } catch {
      toast.error(t('Error al actualizar', 'Error updating status'));
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch {
      toast.error(t('Error al cerrar sesión', 'Error signing out'));
    }
  };

  // Filter Logic logic...
  const filteredOrders = useMemo(() => orders.filter((order: Order) => {
    // 1. Tab Filter
    if (activeTab === 'active' && !['pending', 'confirmed', 'in_progress', 'ready'].includes(order.status)) return false;
    if (activeTab === 'today') {
      if (['delivered', 'completed', 'cancelled'].includes(order.status)) return false;
      const todayStr = new Date().toISOString().split('T')[0];
      if (order.date_needed !== todayStr) return false;
    }
    if (activeTab === 'pickup' && (order.status !== 'ready' || order.delivery_option !== 'pickup')) return false;
    if (activeTab === 'delivery' && (order.status !== 'ready' || order.delivery_option !== 'delivery')) return false;
    if (activeTab === 'done' && !['delivered', 'completed', 'cancelled'].includes(order.status)) return false;
    if (activeTab === 'new' && order.status !== 'pending') return false;
    if (activeTab === 'preparing' && !['confirmed', 'in_progress'].includes(order.status)) return false;

    // 2. Search Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return (
        order.customer_name?.toLowerCase().includes(query) ||
        order.order_number?.toLowerCase().includes(query) ||
        order.customer_phone?.toLowerCase().includes(query) ||
        order.customer_email?.toLowerCase().includes(query)
      );
    }
    return true;
  }).sort((a, b) => {
    // Sort by Due Date/Time (Ascending - Earliest due first)
    const dateA = new Date(`${a.date_needed}T${a.time_needed}`);
    const dateB = new Date(`${b.date_needed}T${b.time_needed}`);
    return dateA.getTime() - dateB.getTime();
  }), [orders, activeTab, searchQuery]);

  // Separate current orders from overdue orders
  // Memoize these derived lists to prevent recalculation on every render (e.g. clock ticks)
  const { currentOrders, overdueOrders } = useMemo(() => {
    const now = new Date();
    const isCompletedStatus = (status: string) =>
      ['delivered', 'completed', 'cancelled'].includes(status);

    const current = filteredOrders.filter((order) => {
      if (isCompletedStatus(order.status)) return true;
      try {
        const dueDateTime = parseISO(`${order.date_needed}T${order.time_needed}`);
        return dueDateTime >= now;
      } catch {
        return true;
      }
    });

    const overdue = filteredOrders.filter((order) => {
      if (isCompletedStatus(order.status)) return false;
      try {
        const dueDateTime = parseISO(`${order.date_needed}T${order.time_needed}`);
        return dueDateTime < now;
      } catch {
        return false;
      }
    });

    return { currentOrders: current, overdueOrders: overdue };
  }, [filteredOrders]);

  // Pagination: combine current + overdue into a single ordered list for slicing
  const combinedOrders = [...currentOrders, ...overdueOrders];
  const totalOrders = combinedOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalOrders);
  const pageOrders = combinedOrders.slice(startIndex, endIndex);

  // Split the page slice back into current vs overdue for rendering with the divider
  const currentOrderCount = currentOrders.length;
  const pageCurrentOrders = pageOrders.filter((_, i) => (startIndex + i) < currentOrderCount);
  const pageOverdueOrders = pageOrders.filter((_, i) => (startIndex + i) >= currentOrderCount);

  const getCount = (statusCheck: (o: Order) => boolean) => orders.filter(statusCheck).length;
  const todayStr = new Date().toISOString().split('T')[0];
  const counts = {
    all: orders.length,
    active: getCount(o => ['pending', 'confirmed', 'in_progress', 'ready'].includes(o.status)),
    today: orders.filter(o =>
      !['delivered', 'completed', 'cancelled'].includes(o.status) && o.date_needed === todayStr
    ).length,
    new: getCount(o => o.status === 'pending'),
    preparing: getCount(o => ['confirmed', 'in_progress'].includes(o.status)),
    pickup: getCount(o => o.status === 'ready' && o.delivery_option === 'pickup'),
    delivery: getCount(o => o.status === 'ready' && o.delivery_option === 'delivery'),
    done: getCount(o => ['delivered', 'completed'].includes(o.status)),
  };

  // Keyboard shortcut: navigate between orders in the modal
  const navigateOrder = (direction: 1 | -1) => {
    if (!selectedOrder) return;
    const idx = filteredOrders.findIndex(o => o.id === selectedOrder.id);
    if (idx === -1) return;
    const nextIdx = idx + direction;
    if (nextIdx >= 0 && nextIdx < filteredOrders.length) {
      setSelectedOrder(filteredOrders[nextIdx]);
    }
  };

  // Keyboard shortcuts when PrintPreviewModal is open
  useEffect(() => {
    if (!selectedOrder) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case 'a':
        case 'A':
          if (selectedOrder.status === 'pending') {
            handleOrderAction(selectedOrder.id, 'confirm');
            setSelectedOrder(null);
          }
          break;
        case 'r':
        case 'R':
          if (['confirmed', 'in_progress'].includes(selectedOrder.status)) {
            handleOrderAction(selectedOrder.id, 'ready');
            setSelectedOrder(null);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          navigateOrder(1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          navigateOrder(-1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOrder, filteredOrders]);

  const renderContent = () => {
    if (activeView === 'inventory') {
      return <FrontDeskInventory darkMode={isDarkMode} />;
    }

    if (activeView === 'deliveries') {
      return (
        <DeliveryManagementPanel
          orders={orders}
          darkMode={isDarkMode}
          onRefresh={refreshOrders}
          onShowDetails={(order) => setSelectedOrder(order)}
        />
      );
    }

    if (activeView === 'reports') {
      return (
        <div className={isDarkMode ? 'dark' : ''}>
          <div className="mb-6">
            <QuickStatsWidget orders={orders} />
          </div>
          <ReportsManager />
        </div>
      );
    }

    if (activeView === 'upcoming') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex-none pb-4">
            <TodayScheduleSummary orders={orders} />
          </div>
          <div className="flex-1 overflow-hidden">
            <OrderScheduler
              orders={orders}
              onOrderClick={(order) => setSelectedOrder(order)}
              darkMode={isDarkMode}
            />
          </div>
        </div>
      );
    }

    if (activeView === 'calendar') {
      return (
        <div className={cn("flex flex-col h-full overflow-hidden", isDarkMode ? 'dark' : '')}>
          <OwnerCalendar
            orders={orders}
            onOrderClick={(order) => setSelectedOrder(order)}
            maxDailyCapacity={maxDailyCapacity}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        {/* Urgent Orders Banner */}
        <UrgentOrdersBanner
          orders={orders}
          variant={isDarkMode ? 'dark' : 'light'}
          onOrderClick={(order) => setSelectedOrder(order)}
        />



        {/* FullScreen Alert */}
        <FullScreenOrderAlert
          isOpen={newOrderAlert}
          order={latestOrder}
          onClose={() => {
            dismissAlert();
          }}
          onViewOrder={(order) => {
            setSelectedOrder(order);
            markAsRead(order.id);
            dismissAlert();
          }}
        />

        {/* Tabs & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <KitchenNavTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            counts={counts as any}
            darkMode={isDarkMode}
          />
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto min-h-0 pb-4 pr-1">
          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
            {totalOrders === 0 && connectionError ? (
              <div className={cn(
                "col-span-full flex flex-col items-center justify-center py-20 rounded-xl border",
                isDarkMode
                  ? "bg-red-900/10 border-red-500/20 text-red-400"
                  : "bg-red-50 border-red-200 text-red-600"
              )}>
                <WifiOff className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">
                  {t('No se pudieron cargar las ordenes', 'Could not load orders')}
                </p>
                <p className={cn("text-sm mb-4", isDarkMode ? "text-red-400/70" : "text-red-500/70")}>
                  {connectionError}
                </p>
                <button
                  onClick={() => refreshOrders()}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors",
                    isDarkMode
                      ? "bg-red-500/20 hover:bg-red-500/30 text-red-300"
                      : "bg-red-100 hover:bg-red-200 text-red-700"
                  )}
                >
                  <RefreshCw className="h-4 w-4" />
                  {t('Intentar de nuevo', 'Try Again')}
                </button>
              </div>
            ) : totalOrders === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400">
                <Package className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">{t('Sin ordenes en esta vista', 'No orders in this view')}</p>
              </div>
            ) : (
              <>
                {/* Current / Upcoming orders on this page */}
                {pageCurrentOrders.map((order) => (
                  <ModernOrderCard
                    key={order.id}
                    order={order}
                    onAction={handleOrderAction}
                    onShowDetails={(o) => setSelectedOrder(o)}
                    onCancel={(o) => setCancelTarget(o)}
                    isFrontDesk={true}
                    variant={isDarkMode ? 'dark' : 'default'}
                  />
                ))}

                {/* Overdue Section Divider */}
                {pageOverdueOrders.length > 0 && (
                  <div className="col-span-full mt-4 mb-2">
                    <div className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl border",
                      isDarkMode
                        ? "bg-red-900/20 border-red-500/30 text-red-400"
                        : "bg-red-50 border-red-200 text-red-700"
                    )}>
                      <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                      <span className="font-bold text-sm">
                        {t('Ordenes atrasadas', 'Overdue Orders')} ({overdueOrders.length})
                      </span>
                      <div className={cn(
                        "flex-1 h-px",
                        isDarkMode ? "bg-red-500/20" : "bg-red-200"
                      )} />
                    </div>
                  </div>
                )}

                {/* Overdue orders on this page */}
                {pageOverdueOrders.map((order) => (
                  <ModernOrderCard
                    key={order.id}
                    order={order}
                    onAction={handleOrderAction}
                    onShowDetails={(o) => setSelectedOrder(o)}
                    onCancel={(o) => setCancelTarget(o)}
                    isFrontDesk={true}
                    variant={isDarkMode ? 'dark' : 'default'}
                  />
                ))}
              </>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 px-2 pb-20">
              <p className={cn(
                "text-sm",
                isDarkMode ? "text-slate-400" : "text-gray-500"
              )}>
                {t(
                  `Mostrando ${startIndex + 1}-${endIndex} de ${totalOrders} ordenes`,
                  `Showing ${startIndex + 1}-${endIndex} of ${totalOrders} orders`
                )}
              </p>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                  disabled={safePage <= 1}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                    isDarkMode
                      ? "text-slate-300 hover:bg-slate-700 disabled:hover:bg-transparent"
                      : "text-gray-600 hover:bg-gray-100 disabled:hover:bg-transparent"
                  )}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('Anterior', 'Prev')}</span>
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((pageNum) => {
                    if (pageNum === 1 || pageNum === totalPages) return true;
                    if (Math.abs(pageNum - safePage) <= 1) return true;
                    return false;
                  })
                  .reduce<(number | 'ellipsis')[]>((acc, pageNum, idx, arr) => {
                    if (idx > 0 && pageNum - arr[idx - 1] > 1) {
                      acc.push('ellipsis');
                    }
                    acc.push(pageNum);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === 'ellipsis' ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className={cn(
                          "px-2 text-sm",
                          isDarkMode ? "text-slate-500" : "text-gray-400"
                        )}
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => setCurrentPage(item)}
                        className={cn(
                          "h-9 w-9 rounded-lg text-sm font-medium transition-colors",
                          item === safePage
                            ? isDarkMode
                              ? "bg-slate-700 text-white shadow-md"
                              : "bg-white text-gray-900 shadow-sm border border-gray-200"
                            : isDarkMode
                              ? "text-slate-400 hover:text-white hover:bg-slate-700/50"
                              : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                        )}
                      >
                        {item}
                      </button>
                    )
                  )}

                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage >= totalPages}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                    isDarkMode
                      ? "text-slate-300 hover:bg-slate-700 disabled:hover:bg-transparent"
                      : "text-gray-600 hover:bg-gray-100 disabled:hover:bg-transparent"
                  )}
                >
                  <span className="hidden sm:inline">{t('Siguiente', 'Next')}</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (authLoading || (feedLoading && orders.length === 0)) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <AuthenticatorAssuranceCheck userRole="baker">
    <KitchenRedesignedLayout
      activeView={activeView}
      onChangeView={setActiveView}
      onLogout={handleLogout}
      title="Front Desk"
      darkMode={isDarkMode}
      onToggleTheme={() => setIsDarkMode(!isDarkMode)}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      notificationCount={unreadCount}
      onNotificationClick={() => setIsNotificationPanelOpen(true)}
      onRefresh={refreshOrders}
      isRefreshing={isRefreshing}
      badgeCounts={{ queue: counts.new }}
      soundEnabled={isSoundEnabled}
      onToggleSound={() => setIsSoundEnabled(!isSoundEnabled)}
      userName={user?.profile?.full_name || user?.email?.split('@')[0] || 'Staff'}
    >
      {/* Connection Status Banner */}
      {!isConnected && !feedLoading && (
        <div className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl border mb-4",
          isDarkMode
            ? "bg-amber-900/20 border-amber-500/30 text-amber-400"
            : "bg-amber-50 border-amber-200 text-amber-700"
        )}>
          <WifiOff className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm font-medium flex-1">
            {t(
              'Conexion en tiempo real perdida — puedes perder nuevas ordenes',
              'Real-time feed disconnected — you may miss new orders'
            )}
          </span>
          <button
            onClick={reconnect}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
              isDarkMode
                ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300"
                : "bg-amber-100 hover:bg-amber-200 text-amber-800"
            )}
          >
            {t('Reconectar', 'Reconnect')}
          </button>
          <button
            onClick={() => refreshOrders()}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
              isDarkMode
                ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300"
                : "bg-amber-100 hover:bg-amber-200 text-amber-800"
            )}
          >
            {t('Actualizar', 'Refresh')}
          </button>
        </div>
      )}

      <PrintPreviewModal
        isOpen={!!selectedOrder}
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onCancelOrder={(order) => {
          setSelectedOrder(null);
          setCancelTarget(order);
        }}
      />

      <CancelOrderModal
        order={cancelTarget}
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onSuccess={handleCancelSuccess}
        isAdmin={true}
      />

      <NotificationPanel
        isOpen={isNotificationPanelOpen}
        onOpenChange={setIsNotificationPanelOpen}
        orders={orders}
        onSelectOrder={(order) => {
          setSelectedOrder(order);
          setIsNotificationPanelOpen(false);
        }}
        darkMode={isDarkMode}
        markAsRead={markAsRead}
        markAllAsRead={markAllAsRead}
        isUnread={isUnread}
      />

      {renderContent()}

    </KitchenRedesignedLayout>
    </AuthenticatorAssuranceCheck>
  );
};

export default FrontDesk;
