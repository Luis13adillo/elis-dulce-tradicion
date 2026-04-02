import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Order } from '@/types/order';
import { UserRole } from '@/types/auth';
import { useRealtimeOrders } from './useRealtimeOrders';
import { useAuth } from '@/contexts/AuthContext';

const SLASH = String.fromCharCode(47);

export const useOrdersFeed = (role?: UserRole, options?: { soundEnabled?: boolean }) => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [latestOrder, setLatestOrder] = useState<Order | null>(null);
  const [newOrderAlert, setNewOrderAlert] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ordersMapRef = useRef<Map<number, Order>>(new Map());

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio(SLASH + 'notification.mp3');
  }, []);

  const loadOrders = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setIsRefreshing(true);
      const data = await api.getAllOrders();

      if (Array.isArray(data)) {
        setOrders(data);
        // Update map
        ordersMapRef.current = new Map(data.map((o: Order) => [o.id, o]));
      }
    } catch (error) {
      toast.error(`Error loading orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      if (showLoading) setIsRefreshing(false);
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Real-time subscription
  const isAdmin = role === 'owner' || role === 'baker' || user?.profile?.role === 'owner' || user?.profile?.role === 'baker';

  const { isConnected, connectionError, reconnect } = useRealtimeOrders({
    filterByUserId: !isAdmin, // Customers only see their orders, admins see all
    onOrderInsert: (newOrder) => {
      setOrders((prev) => {
        // Check if order already exists
        if (ordersMapRef.current.has(newOrder.id)) {
          return prev;
        }

        // Add new order
        ordersMapRef.current.set(newOrder.id, newOrder);
        const updated = [newOrder, ...prev];

        // Show alert for admins/bakers
        if (isAdmin) {
          setLatestOrder(newOrder);
          setNewOrderAlert(true);

          // Play sound (unless muted)
          if (audioRef.current && options?.soundEnabled !== false) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => { /* autoplay blocked by browser policy */ });
          }

          // Browser Notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('🎂 New Order!', {
              body: `#${newOrder.order_number} - ${newOrder.customer_name}`,
              icon: SLASH + 'favicon.ico'
            });
          }

          toast.success('🎂 New Order!', {
            description: `#${newOrder.order_number} - ${newOrder.customer_name}`,
          });
        }

        return updated;
      });
    },
    onOrderUpdate: (updatedOrder, oldOrder) => {
      setOrders((prev) => {
        const index = prev.findIndex((o) => o.id === updatedOrder.id);
        if (index === -1) {
          // Order not in list, add it
          ordersMapRef.current.set(updatedOrder.id, updatedOrder);
          return [updatedOrder, ...prev];
        }

        // Update existing order
        ordersMapRef.current.set(updatedOrder.id, updatedOrder);
        const updated = [...prev];
        updated[index] = updatedOrder;
        return updated;
      });
    },
    onOrderDelete: (deletedOrder) => {
      setOrders((prev) => {
        ordersMapRef.current.delete(deletedOrder.id);
        return prev.filter((o) => o.id !== deletedOrder.id);
      });
    },
  });

  // Mock Data Event Listener

  // Real-time updates handled by useRealtimeOrders
  // No mock listeners needed as we are fully synced with Supabase


  // Dismiss Alert
  const dismissAlert = () => setNewOrderAlert(false);

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
    isLoading,
    isRefreshing,
    refreshOrders: () => loadOrders(true),
    newOrderAlert,
    latestOrder,
    dismissAlert,
    isConnected,
    connectionError,
    reconnect
  };
};

