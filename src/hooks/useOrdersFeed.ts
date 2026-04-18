import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Order } from '@/types/order';
import { UserRole } from '@/types/auth';
import { useRealtimeOrders } from './useRealtimeOrders';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { useOrders } from '@/lib/queries/orders';
import { queryKeys } from '@/lib/queryClient';

export interface StatusChangeEvent {
  orderId: number;
  orderNumber: string;
  customerName: string;
  fromStatus: string;
  toStatus: string;
  timestamp: Date;
}

const SLASH = String.fromCharCode(47);

export const useOrdersFeed = (role?: UserRole, options?: { soundEnabled?: boolean }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Single source of truth for order list: React Query cache, shared with
  // OwnerDashboard so navigating between views doesn't re-download orders.
  // NOTE: api.getAllOrders now throws on error (previously returned []), which
  // lets React Query preserve the last-good cache during a transient failure
  // instead of blanking the UI.
  const ordersQuery = useOrders();
  const orders = useMemo(
    () => (ordersQuery.data as Order[] | undefined) ?? [],
    [ordersQuery.data]
  );

  // Surface refetch errors to the operator so a silent backend failure is
  // never invisible. Dedupes by error identity to avoid repeating toasts on
  // every render while an error persists.
  const lastErrorRef = useRef<unknown>(null);
  useEffect(() => {
    if (ordersQuery.isError && ordersQuery.error !== lastErrorRef.current) {
      lastErrorRef.current = ordersQuery.error;
      const message =
        ordersQuery.error instanceof Error ? ordersQuery.error.message : 'Unknown error';
      toast.error(`Error loading orders: ${message}`);
    }
    if (!ordersQuery.isError) {
      lastErrorRef.current = null;
    }
  }, [ordersQuery.isError, ordersQuery.error]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [latestOrder, setLatestOrder] = useState<Order | null>(null);
  const [newOrderAlert, setNewOrderAlert] = useState(false);
  const [activityFeed, setActivityFeed] = useState<StatusChangeEvent[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Snapshot of the last-seen order map — used only to detect status
  // changes in realtime updates so we can push entries into activityFeed.
  // NOT the source of truth for rendering.
  const ordersMapRef = useRef<Map<number, Order>>(new Map());
  useEffect(() => {
    ordersMapRef.current = new Map(orders.map((o) => [o.id, o]));
  }, [orders]);

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio(SLASH + 'notification.mp3');
  }, []);

  const refreshOrders = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    } catch (error) {
      toast.error(
        `Error loading orders: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  // Helper: patch every cached orders-list query in place without
  // re-fetching. Covers both `useOrders()` and any filtered variants.
  const patchOrdersCache = useCallback(
    (updater: (prev: Order[]) => Order[]) => {
      queryClient.setQueriesData<Order[]>(
        { queryKey: queryKeys.orders.lists() },
        (prev) => updater(prev ?? [])
      );
    },
    [queryClient]
  );

  // Real-time subscription
  const isAdmin =
    role === 'owner' ||
    role === 'baker' ||
    user?.profile?.role === 'owner' ||
    user?.profile?.role === 'baker';

  const handleOrderInsert = useCallback(
    (newOrder: Order) => {
      patchOrdersCache((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) return prev;
        return [newOrder, ...prev];
      });

      if (isAdmin) {
        setLatestOrder(newOrder);
        setNewOrderAlert(true);
        if (audioRef.current && options?.soundEnabled !== false) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {
            /* autoplay blocked by browser policy */
          });
        }
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('🎂 New Order!', {
            body: `#${newOrder.order_number} - ${newOrder.customer_name}`,
            icon: SLASH + 'favicon.ico',
          });
        }
        toast.success('🎂 New Order!', {
          description: `#${newOrder.order_number} - ${newOrder.customer_name}`,
        });
      }

      setActivityFeed((prev) =>
        [
          {
            orderId: newOrder.id,
            orderNumber: newOrder.order_number,
            customerName: newOrder.customer_name,
            fromStatus: '',
            toStatus: 'pending',
            timestamp: new Date(),
          },
          ...prev,
        ].slice(0, 20)
      );
    },
    [isAdmin, options?.soundEnabled, patchOrdersCache]
  );

  const handleOrderUpdate = useCallback(
    (updatedOrder: Order) => {
      const prevOrder = ordersMapRef.current.get(updatedOrder.id);
      if (prevOrder && prevOrder.status !== updatedOrder.status) {
        setActivityFeed((feed) =>
          [
            {
              orderId: updatedOrder.id,
              orderNumber: updatedOrder.order_number,
              customerName: updatedOrder.customer_name,
              fromStatus: prevOrder.status,
              toStatus: updatedOrder.status,
              timestamp: new Date(),
            },
            ...feed,
          ].slice(0, 20)
        );
      }

      patchOrdersCache((prev) => {
        const index = prev.findIndex((o) => o.id === updatedOrder.id);
        if (index === -1) return [updatedOrder, ...prev];
        const next = prev.slice();
        next[index] = updatedOrder;
        return next;
      });
    },
    [patchOrdersCache]
  );

  const updateOrderOptimistically = useCallback(
    (orderId: number, newStatus: string) => {
      patchOrdersCache((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: newStatus as Order['status'] } : o
        )
      );
    },
    [patchOrdersCache]
  );

  const handleOrderDelete = useCallback(
    (deletedOrder: Order) => {
      patchOrdersCache((prev) => prev.filter((o) => o.id !== deletedOrder.id));
    },
    [patchOrdersCache]
  );

  const { isConnected, isConnecting, connectionError, reconnect } = useRealtimeOrders({
    filterByUserId: !isAdmin, // Customers only see their orders, admins see all
    onOrderInsert: handleOrderInsert,
    onOrderUpdate: handleOrderUpdate,
    onOrderDelete: handleOrderDelete,
  });

  // Dismiss Alert
  const dismissAlert = () => setNewOrderAlert(false);

  // Trigger a demo/test notification without a real order
  const triggerTestAlert = useCallback(() => {
    const mockOrder: Order = {
      id: 999999,
      order_number: 'TEST-001',
      status: 'pending',
      customer_name: 'Demo Customer',
      customer_phone: '(555) 000-0000',
      cake_size: '10"',
      filling: 'Fresa / Strawberry',
      theme: 'Birthday',
      date_needed: new Date().toISOString().split('T')[0],
      time_needed: '3:00 PM',
      delivery_option: 'pickup',
      total_amount: 85,
      created_at: new Date().toISOString(),
    };
    setLatestOrder(mockOrder);
    setNewOrderAlert(true);
    if (audioRef.current && options?.soundEnabled !== false) {
      audioRef.current.loop = true;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, [options?.soundEnabled]);

  // Computed Stats
  const stats = {
    total: orders.length,
    pending: orders.filter((o: Order) => o.status === 'pending').length,
    confirmed: orders.filter((o: Order) => o.status === 'confirmed').length,
    inProgress: orders.filter((o: Order) => o.status === 'in_progress').length,
    ready: orders.filter((o: Order) => o.status === 'ready').length,
    outForDelivery: orders.filter((o: Order) => o.status === 'out_for_delivery').length,
    delivered: orders.filter((o: Order) => o.status === 'delivered').length,
    completed: orders.filter((o: Order) => o.status === 'completed').length,
  };

  return {
    orders,
    stats,
    isLoading: ordersQuery.isLoading && !ordersQuery.data,
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
  };
};
