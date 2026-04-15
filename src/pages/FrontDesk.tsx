import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useOrdersFeed } from '@/hooks/useOrdersFeed';
import { useNotificationState } from '@/hooks/useNotificationState';
import { api } from '@/lib/api';
import { useBusinessSettings, useBusinessHours } from '@/lib/hooks/useCMS';
import { toast } from 'sonner';
import { Order } from '@/types/order';
import { parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

// Components
import { KitchenRedesignedLayout } from '@/components/kitchen/KitchenRedesignedLayout';
import { KitchenNavTabs, KitchenTab } from '@/components/kitchen/KitchenNavTabs';
import { ModernOrderCard } from '@/components/kitchen/ModernOrderCard';
import { OrderScheduler } from '@/components/dashboard/OrderScheduler';
import { PrintPreviewModal } from '@/components/print/PrintPreviewModal';
import TodayScheduleSummary from '@/components/dashboard/TodayScheduleSummary';
import { FullScreenOrderAlert } from '@/components/kitchen/FullScreenOrderAlert';
import { NotificationPanel } from '@/components/kitchen/NotificationPanel';
import CancelOrderModal from '@/components/order/CancelOrderModal';
import { FrontDeskInventory } from '@/components/kitchen/FrontDeskInventory';
import { DeliveryManagementPanel } from '@/components/kitchen/DeliveryManagementPanel';
import { QuickStatsWidget } from '@/components/dashboard/QuickStatsWidget';
import { UrgentOrdersBanner } from '@/components/kitchen/UrgentOrdersBanner';
import { Package, AlertTriangle, ChevronLeft, ChevronRight, WifiOff, RefreshCw, PlusCircle, FlaskConical, Zap } from 'lucide-react';
import { WalkInOrderModal } from '@/components/kitchen/WalkInOrderModal';
import { AuthenticatorAssuranceCheck } from '@/components/auth/AuthenticatorAssuranceCheck';
import { useInactivityTimeout } from '@/hooks/useInactivityTimeout';
import { SessionTimeoutModal } from '@/components/auth/SessionTimeoutModal';

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
    isConnecting,
    connectionError,
    reconnect,
    updateOrderOptimistically,
    activityFeed,
    triggerTestAlert,
  } = useOrdersFeed(undefined, { soundEnabled: isSoundEnabled });

  // Notification State
  const { markAsRead, markAllAsRead, isUnread } = useNotificationState();
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);

  // Business Settings (for calendar capacity + auto-confirm)
  const { data: businessSettings } = useBusinessSettings();
  const maxDailyCapacity = businessSettings?.max_daily_capacity || 10;

  // Auto-Confirm Settings
  const [autoConfirmEnabled, setAutoConfirmEnabled] = useState(false);
  const [autoConfirmPrepMinutes, setAutoConfirmPrepMinutes] = useState(30);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Sync auto-confirm settings from DB on load
  useEffect(() => {
    if (businessSettings) {
      setAutoConfirmEnabled(businessSettings.auto_confirm_enabled ?? false);
      setAutoConfirmPrepMinutes(businessSettings.auto_confirm_prep_minutes ?? 30);
    }
  }, [businessSettings?.auto_confirm_enabled, businessSettings?.auto_confirm_prep_minutes]);

  // Business Hours (for calendar grid range)
  const { data: businessHours } = useBusinessHours();
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

  // Auto-confirm new orders when the feature is enabled
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!autoConfirmEnabled) return;
    if (!latestOrder || latestOrder.id === 999999) return; // skip test alerts
    if (latestOrder.status !== 'pending') return;
    const estimated_ready_at = new Date(Date.now() + autoConfirmPrepMinutes * 60 * 1000).toISOString();
    executeOrderAction(latestOrder.id, 'confirm', { estimated_ready_at });
  }, [latestOrder?.id]); // intentionally only fires on new order arrival

  const saveAutoConfirmSettings = async (enabled: boolean, prepMins: number) => {
    setSavingSettings(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      await supabase
        .from('business_settings')
        .update({ auto_confirm_enabled: enabled, auto_confirm_prep_minutes: prepMins })
        .eq('id', businessSettings?.id ?? 1);
      setAutoConfirmEnabled(enabled);
      setAutoConfirmPrepMinutes(prepMins);
      toast.success(t('Configuración guardada', 'Settings saved'));
      setShowSettingsPanel(false);
    } catch {
      toast.error(t('Error al guardar', 'Error saving settings'));
    } finally {
      setSavingSettings(false);
    }
  };

  // --- SESSION TIMEOUT ---
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(30);

  // Fetch session timeout setting from business_settings
  useEffect(() => {
    const fetchTimeoutSetting = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase
          .from('business_settings')
          .select('session_timeout_minutes')
          .single();
        if (data?.session_timeout_minutes) {
          setSessionTimeoutMinutes(data.session_timeout_minutes);
        }
      } catch {
        // Default to 30 minutes on error
      }
    };
    fetchTimeoutSetting();
  }, []);

  const resetTimers = useInactivityTimeout({
    timeoutMs: sessionTimeoutMinutes * 60 * 1000,
    warningMs: 2 * 60 * 1000,
    onWarn: () => {
      setSecondsLeft(120);
      setShowTimeoutWarning(true);
    },
    onExpire: async () => {
      setShowTimeoutWarning(false);
      await signOut();
      navigate('/login', { state: { sessionExpired: true } });
    },
  });

  // Countdown when warning modal is shown
  useEffect(() => {
    if (!showTimeoutWarning) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showTimeoutWarning]);

  const ACTIVE_STATUSES = ['pending', 'confirmed', 'in_progress', 'ready'];
  const unreadCount = orders.filter(o => ACTIVE_STATUSES.includes(o.status) && isUnread(o.id)).length;

  // Prep Time Modal (shown before confirming an order)
  const [prepTimeTarget, setPrepTimeTarget] = useState<number | null>(null);
  const [customPrepMinutes, setCustomPrepMinutes] = useState('');

  // Walk-In Order Modal
  const [showWalkInModal, setShowWalkInModal] = useState(false);

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
  const [activeView, setActiveView] = useState<'queue' | 'upcoming' | 'inventory' | 'deliveries' | 'reports'>('queue');
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

  const handleOrderAction = async (orderId: number, action: 'confirm' | 'start' | 'ready' | 'delivery' | 'complete' | 'markDelivered') => {
    // Intercept confirm — show prep time modal first
    if (action === 'confirm') {
      setPrepTimeTarget(orderId);
      return;
    }
    await executeOrderAction(orderId, action);
  };

  const executeOrderAction = async (orderId: number, action: 'confirm' | 'start' | 'ready' | 'delivery' | 'complete' | 'markDelivered', extraData?: { estimated_ready_at?: string }) => {
    let status = '';
    let successMsg = '';

    switch (action) {
      case 'delivery':
        status = 'out_for_delivery';
        successMsg = t('Enviada a domicilio', 'Dispatched for delivery');
        break;
      case 'complete':
        status = 'completed';
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
      case 'markDelivered':
        status = 'delivered';
        successMsg = t('Orden entregada', 'Order delivered');
        break;
    }

    if (!status) return;

    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return;
    const oldStatus = targetOrder.status;

    try {
      await api.updateOrderStatus(orderId, status, extraData);
      updateOrderOptimistically(orderId, status);
      toast.success(successMsg);

      // Send Email Notifications
      if (action === 'confirm') {
        // Send "order confirmed / in production queue" — distinct from the payment confirmation email
        toast.info(t('Enviando correo...', 'Sending email...'));
        api.sendStatusUpdate(targetOrder, 'pending', 'confirmed').then(({ success }) => {
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
        const finalStatus = action === 'delivery' ? 'out_for_delivery' : 'completed';
        toast.info(t('Enviando correo...', 'Sending email...'));
        api.sendStatusUpdate(targetOrder, oldStatus, finalStatus).then(({ success }) => {
          if (success) toast.success(t('Correo enviado', 'Email sent'));
          else toast.error(t('Error al enviar correo', 'Failed to send email'));
        });
      } else if (action === 'markDelivered') {
        toast.info(t('Enviando correo...', 'Sending email...'));
        api.sendStatusUpdate(targetOrder, oldStatus, 'delivered').then(({ success }) => {
          if (success) toast.success(t('Correo enviado', 'Email sent'));
          else toast.error(t('Error al enviar correo', 'Failed to send email'));
        });
      }

      refreshOrders();

      // Auto-advance delivery orders: delivered → completed after 1.5s
      if (action === 'markDelivered') {
        setTimeout(async () => {
          await api.updateOrderStatus(orderId, 'completed');
          refreshOrders();
        }, 1500);
      }
    } catch {
      toast.error(t('Error al actualizar', 'Error updating status'));
    }
  };

  const handleConfirmWithPrepTime = (minutes: number) => {
    if (!prepTimeTarget) return;
    const estimated_ready_at = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const orderId = prepTimeTarget;
    setPrepTimeTarget(null);
    setCustomPrepMinutes('');
    executeOrderAction(orderId, 'confirm', { estimated_ready_at });
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
  const filteredOrders = useMemo(() => {
    const filtered = orders.filter((order: Order) => {
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
    });

    // Pre-compute sort keys once — avoids O(n log n) Date constructions per comparison
    const sortKeys = new Map(
      filtered.map(o => [o.id, new Date(`${o.date_needed}T${o.time_needed || '00:00'}`).getTime()])
    );

    return filtered.sort((a, b) => (sortKeys.get(a.id) ?? 0) - (sortKeys.get(b.id) ?? 0));
  }, [orders, activeTab, searchQuery]);

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
  const todayOrderCount = orders.filter(o => o.date_needed === todayStr && o.status !== 'cancelled').length;
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
          <QuickStatsWidget orders={orders} />
        </div>
      );
    }

    if (activeView === 'upcoming') {
      return (
        <div className={cn("flex flex-col h-full overflow-hidden", isDarkMode ? 'dark' : '')}>
          <div className="flex-none pb-4">
            <TodayScheduleSummary orders={orders} darkMode={isDarkMode} maxDailyCapacity={maxDailyCapacity} />
          </div>
          <div className="flex-1 overflow-hidden">
            <OrderScheduler
              orders={orders}
              onOrderClick={(order) => setSelectedOrder(order)}
              darkMode={isDarkMode}
              businessStartHour={calendarHours.start}
              businessEndHour={calendarHours.end}
            />
          </div>
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
      isConnected={isConnected}
      connectionError={connectionError}
      todayOrderCount={todayOrderCount}
      maxDailyCapacity={maxDailyCapacity}
      headerAction={
        <div className="flex items-center gap-2">
          {/* Auto-Confirm Settings */}
          <div className="relative">
            <button
              onClick={() => setShowSettingsPanel(!showSettingsPanel)}
              title={t('Configuración de auto-confirmación', 'Auto-confirm settings')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium shadow-sm transition-colors relative',
                autoConfirmEnabled
                  ? isDarkMode
                    ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30'
                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300'
                  : isDarkMode
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
              )}
            >
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">{t('Auto', 'Auto')}</span>
              {autoConfirmEnabled && (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-400" />
              )}
            </button>

            {showSettingsPanel && (
              <div className={cn(
                'absolute right-0 top-full mt-2 w-72 rounded-2xl shadow-2xl p-4 z-50 border',
                isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'
              )}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm">{t('Auto-Confirmar Órdenes', 'Auto-Confirm Orders')}</h3>
                  <button
                    onClick={() => setShowSettingsPanel(false)}
                    className={cn('text-xs px-2 py-1 rounded-lg', isDarkMode ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-700')}
                  >✕</button>
                </div>

                <p className={cn('text-xs mb-4', isDarkMode ? 'text-slate-400' : 'text-gray-500')}>
                  {t(
                    'Acepta órdenes automáticamente cuando llegan. El tiempo de preparación se aplica a todas.',
                    'Automatically accept incoming orders. Prep time applies to all.'
                  )}
                </p>

                {/* Toggle */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium">{t('Activar', 'Enable')}</span>
                  <button
                    onClick={() => setAutoConfirmEnabled(!autoConfirmEnabled)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      autoConfirmEnabled ? 'bg-amber-500' : isDarkMode ? 'bg-slate-600' : 'bg-gray-300'
                    )}
                  >
                    <span className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform',
                      autoConfirmEnabled ? 'translate-x-6' : 'translate-x-1'
                    )} />
                  </button>
                </div>

                {/* Default Prep Time */}
                <div className={cn('mb-4', !autoConfirmEnabled && 'opacity-40 pointer-events-none')}>
                  <label className="text-xs font-medium block mb-2">
                    {t('Tiempo de preparación por defecto', 'Default prep time')}
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[15, 30, 45, 60].map(mins => (
                      <button
                        key={mins}
                        onClick={() => setAutoConfirmPrepMinutes(mins)}
                        className={cn(
                          'py-1.5 rounded-lg text-xs font-bold transition-colors',
                          autoConfirmPrepMinutes === mins
                            ? 'bg-amber-500 text-white'
                            : isDarkMode
                              ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        )}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => saveAutoConfirmSettings(autoConfirmEnabled, autoConfirmPrepMinutes)}
                  disabled={savingSettings}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors"
                >
                  {savingSettings ? t('Guardando…', 'Saving…') : t('Guardar', 'Save')}
                </button>
              </div>
            )}
          </div>

          <button
            onClick={triggerTestAlert}
            title={t('Probar notificación', 'Test notification')}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium shadow-sm transition-colors',
              isDarkMode
                ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
            )}
          >
            <FlaskConical className="h-4 w-4" />
            <span className="hidden sm:inline">{t('Prueba', 'Test Alert')}</span>
          </button>
          <button
            onClick={() => setShowWalkInModal(true)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold shadow-sm transition-colors',
              isDarkMode
                ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-500/30'
                : 'bg-green-600 text-white hover:bg-green-700'
            )}
          >
            <PlusCircle className="h-4 w-4" />
            <span className="hidden sm:inline">{t('Nueva Orden', 'Walk-In Order')}</span>
          </button>
        </div>
      }
    >
      {/* Connection Status Banner */}
      {!isConnected && !isConnecting && !feedLoading && (
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

      {/* Prep Time Modal */}
      {prepTimeTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={cn(
            "w-full max-w-sm mx-4 rounded-2xl p-6 shadow-2xl",
            isDarkMode ? "bg-[#1f2937] text-white" : "bg-white text-gray-900"
          )}>
            <h2 className="text-lg font-bold mb-1">{t('¿Cuánto tiempo necesitas?', 'How long do you need?')}</h2>
            <p className={cn("text-sm mb-5", isDarkMode ? "text-slate-400" : "text-gray-500")}>
              {t('Elige el tiempo estimado de preparación', 'Choose estimated prep time')}
            </p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[15, 30, 45, 60, 90].map(mins => (
                <button
                  key={mins}
                  onClick={() => handleConfirmWithPrepTime(mins)}
                  className={cn(
                    "py-3 rounded-xl font-bold text-sm transition-colors",
                    isDarkMode
                      ? "bg-slate-700 hover:bg-green-600 text-white"
                      : "bg-gray-100 hover:bg-green-500 hover:text-white text-gray-800"
                  )}
                >
                  {mins}m
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-4">
              <input
                type="number"
                min={1}
                max={480}
                placeholder={t('Personalizado (min)', 'Custom (min)')}
                value={customPrepMinutes}
                onChange={e => setCustomPrepMinutes(e.target.value)}
                className={cn(
                  "flex-1 px-3 py-2 rounded-xl text-sm border outline-none",
                  isDarkMode
                    ? "bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                    : "bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400"
                )}
              />
              <button
                onClick={() => {
                  const mins = parseInt(customPrepMinutes);
                  if (mins > 0) handleConfirmWithPrepTime(mins);
                }}
                disabled={!customPrepMinutes || parseInt(customPrepMinutes) <= 0}
                className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold text-sm disabled:opacity-40 hover:bg-green-700 transition-colors"
              >
                OK
              </button>
            </div>
            <button
              onClick={() => { setPrepTimeTarget(null); setCustomPrepMinutes(''); }}
              className={cn(
                "w-full py-2 rounded-xl text-sm font-medium transition-colors",
                isDarkMode ? "text-slate-400 hover:text-white hover:bg-slate-700" : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              )}
            >
              {t('Cancelar', 'Cancel')}
            </button>
          </div>
        </div>
      )}

      <WalkInOrderModal
        open={showWalkInModal}
        onClose={() => setShowWalkInModal(false)}
        onSuccess={refreshOrders}
        darkMode={isDarkMode}
      />

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
        activityFeed={activityFeed}
      />

      {renderContent()}

    </KitchenRedesignedLayout>

    <SessionTimeoutModal
      isOpen={showTimeoutWarning}
      secondsRemaining={secondsLeft}
      onStayLoggedIn={() => {
        setShowTimeoutWarning(false);
        resetTimers();
      }}
      onLogOut={async () => {
        await signOut();
        navigate('/login');
      }}
    />
    </AuthenticatorAssuranceCheck>
  );
};

export default FrontDesk;
