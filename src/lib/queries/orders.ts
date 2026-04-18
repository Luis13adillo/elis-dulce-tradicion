/**
 * React Query hooks for orders
 * Optimized with proper caching and invalidation
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

// Get all orders
export const useOrders = (filters?: { status?: string; limit?: number; offset?: number }) => {
  return useQuery({
    queryKey: queryKeys.orders.list(filters),
    queryFn: () => api.getAllOrders({ status: filters?.status, limit: filters?.limit }),
    // 2 minutes — realtime subscriptions patch the cache in place for inserts/
    // updates/deletes, so we don't need aggressive refetching. A shorter window
    // just causes the dashboard's isLoading gate to flip true on every tab
    // focus and blanks the UI into a fullscreen spinner.
    staleTime: 1000 * 60 * 2,
    enabled: true,
  });
};

// Get single order by ID
export const useOrder = (id: number | string | null) => {
  return useQuery({
    queryKey: queryKeys.orders.detail(id!),
    queryFn: () => api.getOrder(id!),
    enabled: !!id,
    staleTime: 1000 * 60, // 1 minute
  });
};

// Get order by order number (public, for tracking)
export const useOrderByNumber = (orderNumber: string | null) => {
  return useQuery({
    queryKey: queryKeys.orders.byNumber(orderNumber!),
    queryFn: () => api.getOrderByNumber(orderNumber!),
    enabled: !!orderNumber,
    staleTime: 1000 * 60, // 1 minute
  });
};

// Create order mutation
export const useCreateOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderData: any) => api.createOrder(orderData),
    onSuccess: () => {
      // Invalidate orders list to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.lists() });
    },
  });
};

// Update order status mutation
export const useUpdateOrderStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status, notes }: { id: number | string; status: string; notes?: string }) =>
      api.updateOrderStatus(id, status, notes),
    onSuccess: (data, variables) => {
      // Invalidate specific order
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(variables.id) });
      // Invalidate orders list
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.lists() });
      // Optimistic update
      queryClient.setQueryData(queryKeys.orders.detail(variables.id), (old: any) => ({
        ...old,
        status: variables.status,
      }));
    },
  });
};
