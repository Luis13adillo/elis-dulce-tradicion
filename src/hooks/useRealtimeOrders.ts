import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Order } from '@/types/order';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';

export interface RealtimeOrderEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  order: Order;
  oldOrder?: Order;
}

export interface UseRealtimeOrdersOptions {
  onOrderInsert?: (order: Order) => void;
  onOrderUpdate?: (order: Order, oldOrder?: Order) => void;
  onOrderDelete?: (order: Order) => void;
  // Fired when the channel re-subscribes after a genuine dropout (not on the
  // first connect). Use it to refetch the list so any INSERT/UPDATE that
  // landed while we were disconnected — and thus never arrived as an event —
  // is pulled in. Without this, a connection hiccup silently loses orders
  // until the next manual refresh / stale-time lapse.
  onReconnect?: () => void;
  filterByUserId?: boolean; // If true, only subscribe to orders for current user
  debounceMs?: number; // Debounce rapid updates
}

export interface UseRealtimeOrdersReturn {
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  reconnect: () => void;
}

/**
 * Hook for subscribing to real-time order updates using Supabase Realtime
 */
export function useRealtimeOrders(
  options: UseRealtimeOrdersOptions = {}
): UseRealtimeOrdersReturn {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<Map<number, number>>(new Map());
  const reconnectAttemptsRef = useRef(0);
  const debounceMs = options.debounceMs || 300;

  const {
    onOrderInsert,
    onOrderUpdate,
    onOrderDelete,
    onReconnect,
    filterByUserId = false,
  } = options;

  // Stable refs for callbacks — decouples them from the subscription effect
  // so the channel doesn't unsubscribe/resubscribe on every parent render
  const insertCallbackRef = useRef(onOrderInsert);
  const updateCallbackRef = useRef(onOrderUpdate);
  const deleteCallbackRef = useRef(onOrderDelete);
  const reconnectCallbackRef = useRef(onReconnect);

  // True once a genuine dropout (CHANNEL_ERROR / TIMED_OUT) has occurred, so
  // the next SUBSCRIBED is recognized as a re-subscribe and triggers a
  // catch-up refetch. Stays false through the initial connect and through
  // normal dependency-driven re-subscribes (no data was missed there).
  const pendingCatchUpRef = useRef(false);

  useEffect(() => { insertCallbackRef.current = onOrderInsert; }, [onOrderInsert]);
  useEffect(() => { updateCallbackRef.current = onOrderUpdate; }, [onOrderUpdate]);
  useEffect(() => { deleteCallbackRef.current = onOrderDelete; }, [onOrderDelete]);
  useEffect(() => { reconnectCallbackRef.current = onReconnect; }, [onReconnect]);

  // Debounce function
  const debounce = useCallback(
    (orderId: number, callback: () => void) => {
      const now = Date.now();
      const lastUpdate = lastUpdateRef.current.get(orderId) || 0;

      if (now - lastUpdate < debounceMs) {
        return;
      }

      lastUpdateRef.current.set(orderId, now);
      callback();
    },
    [debounceMs]
  );

  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Clean up existing channel
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(true);
    setConnectionError(null);

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
    reconnectAttemptsRef.current += 1;

    reconnectTimeoutRef.current = setTimeout(() => {
      setReconnectTrigger(t => t + 1);
    }, delay);
  }, []);

  useEffect(() => {
    setIsConnecting(true);

    if (!supabase) {
      setIsConnecting(false);
      setConnectionError('Supabase client not initialized');
      return;
    }

    if (filterByUserId && !user?.id) {
      // Wait for user to be loaded
      setIsConnecting(false);
      return;
    }

    // Build the channel name and filter
    let channelName = 'orders';
    let filterConfig: { column?: string; operator?: string; value?: string } | undefined = undefined;

    if (filterByUserId && user?.id) {
      // Filter by user_id for customers
      filterConfig = {
        column: 'user_id',
        operator: 'eq',
        value: user.id,
      };
      channelName = `orders:user_id=eq.${user.id}`;
    } else {
      // For admins/bakers, subscribe to all orders
      channelName = 'orders:all';
    }

    // Create channel
    const channel = supabase
      .channel(channelName, {
        config: {
          broadcast: { self: false },
          presence: { key: user?.id || 'anonymous' },
        },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          ...(filterConfig ? { filter: `${filterConfig.column}=eq.${filterConfig.value}` } : {}),
        },
        (payload) => {
          const order = payload.new as Order || payload.old as Order;

          if (!order) return;

          // Debounce rapid updates
          debounce(order.id, () => {
            if (payload.eventType === 'INSERT') {
              insertCallbackRef.current?.(order);
            } else if (payload.eventType === 'UPDATE') {
              const oldOrder = payload.old as Order;
              updateCallbackRef.current?.(order, oldOrder);
            } else if (payload.eventType === 'DELETE') {
              deleteCallbackRef.current?.(order);
            }
          });
        }
      )
      .subscribe((status) => {
        setIsConnecting(false);
        if (status === 'SUBSCRIBED') {
          reconnectAttemptsRef.current = 0; // Reset backoff on successful connect
          setIsConnected(true);
          setConnectionError(null);
          // If this SUBSCRIBED follows a real dropout, pull anything we missed
          // while offline. Runs once per reconnect, never on the first connect.
          if (pendingCatchUpRef.current) {
            pendingCatchUpRef.current = false;
            reconnectCallbackRef.current?.();
          }
        } else if (status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          setConnectionError('Channel subscription error');
          pendingCatchUpRef.current = true;
          reconnect();
        } else if (status === 'TIMED_OUT') {
          setIsConnected(false);
          setConnectionError('Connection timed out');
          pendingCatchUpRef.current = true;
          reconnect();
        } else if (status === 'CLOSED') {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    // Cleanup
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      setIsConnected(false);
      setIsConnecting(false);
    };
    // Callbacks intentionally omitted — accessed via stable refs above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, filterByUserId, debounce, reconnect, reconnectTrigger]);

  return {
    isConnected,
    isConnecting,
    connectionError,
    reconnect,
  };
}
