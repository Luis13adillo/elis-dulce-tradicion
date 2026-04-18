import { QueryClient } from '@tanstack/react-query';

/**
 * Optimized React Query client configuration
 * Implements caching strategies, stale-while-revalidate, and performance optimizations
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale-while-revalidate: use cached data immediately, then refetch in background
      staleTime: 1000 * 60 * 5, // 5 minutes - data is fresh for 5 min
      gcTime: 1000 * 60 * 30, // 30 minutes - cache garbage collection (formerly cacheTime)
      refetchOnWindowFocus: false, // Don't refetch on window focus (better UX)
      refetchOnMount: false, // Data is fresh for 5 min — don't double-fetch on mount
      refetchOnReconnect: true, // Refetch when network reconnects
      retry: 1, // Retry failed requests once
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    },
    mutations: {
      retry: 0, // Don't retry mutations
      // Invalidate related queries on mutation success
      onSuccess: () => {
        // This will be handled per-mutation
      },
    },
  },
});

// Query key factories for type-safe cache invalidation
export const queryKeys = {
  // Orders
  orders: {
    all: ['orders'] as const,
    lists: () => [...queryKeys.orders.all, 'list'] as const,
    list: (filters?: { status?: string; limit?: number; offset?: number }) =>
      [...queryKeys.orders.lists(), filters] as const,
    details: () => [...queryKeys.orders.all, 'detail'] as const,
    detail: (id: number | string) => [...queryKeys.orders.details(), id] as const,
    byNumber: (orderNumber: string) => [...queryKeys.orders.all, 'number', orderNumber] as const,
  },
  // Products
  products: {
    all: ['products'] as const,
    lists: () => [...queryKeys.products.all, 'list'] as const,
    list: (filters?: { category?: string; search?: string }) =>
      [...queryKeys.products.lists(), filters] as const,
    details: () => [...queryKeys.products.all, 'detail'] as const,
    detail: (id: number) => [...queryKeys.products.details(), id] as const,
  },
  // Pricing
  pricing: {
    all: ['pricing'] as const,
    calculate: (params: any) => [...queryKeys.pricing.all, 'calculate', params] as const,
    current: () => [...queryKeys.pricing.all, 'current'] as const,
  },
  // Capacity
  capacity: {
    all: ['capacity'] as const,
    availableDates: (days?: number) => [...queryKeys.capacity.all, 'dates', days] as const,
    date: (date: string) => [...queryKeys.capacity.all, 'date', date] as const,
    businessHours: () => [...queryKeys.capacity.all, 'hours'] as const,
    holidays: () => [...queryKeys.capacity.all, 'holidays'] as const,
  },
  // Customers
  customers: {
    all: ['customers'] as const,
    addresses: (userId?: string) => [...queryKeys.customers.all, 'addresses', userId] as const,
    profile: (userId?: string) => [...queryKeys.customers.all, 'profile', userId] as const,
  },
  // Analytics
  analytics: {
    all: ['analytics'] as const,
    revenue: (params?: any) => [...queryKeys.analytics.all, 'revenue', params] as const,
    orders: (params?: any) => [...queryKeys.analytics.all, 'orders', params] as const,
    dashboard: (period: 'today' | 'week' | 'month') =>
      [...queryKeys.analytics.all, 'dashboard', period] as const,
    statusBreakdown: () => [...queryKeys.analytics.all, 'statusBreakdown'] as const,
    popularItems: () => [...queryKeys.analytics.all, 'popularItems'] as const,
  },
  // Inventory
  inventory: {
    all: ['inventory'] as const,
    lowStock: () => [...queryKeys.inventory.all, 'lowStock'] as const,
    ingredients: () => [...queryKeys.inventory.all, 'ingredients'] as const,
  },
} as const;
