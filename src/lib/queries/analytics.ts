/**
 * React Query hooks for analytics endpoints.
 * Each hook is a thin wrapper around the existing api.* method with a
 * tuned staleTime matching how fresh the data needs to be on the dashboard.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import type {
  DashboardMetrics,
  OrderStatusBreakdown,
  PopularItem,
} from '@/lib/analytics';

// Core KPI cards on the overview tab
export const useDashboardMetrics = (period: 'today' | 'week' | 'month') => {
  return useQuery({
    queryKey: queryKeys.analytics.dashboard(period),
    queryFn: () => api.getDashboardMetrics(period) as Promise<DashboardMetrics>,
    // 2 minutes — KPIs are informational. A 30s window was causing every
    // realtime order event to refetch metrics, which gated the dashboard's
    // isLoading spinner mid-session.
    staleTime: 1000 * 60 * 2,
  });
};

// Pie chart of order statuses
export const useOrdersByStatus = () => {
  return useQuery({
    queryKey: queryKeys.analytics.statusBreakdown(),
    queryFn: () => api.getOrdersByStatus() as Promise<OrderStatusBreakdown[]>,
    staleTime: 1000 * 60 * 2,
  });
};

// "Most ordered" widget — changes slowly, long staleTime is fine
export const usePopularItems = () => {
  return useQuery({
    queryKey: queryKeys.analytics.popularItems(),
    queryFn: async (): Promise<PopularItem[]> => {
      const raw = (await api.getPopularItems()) as Array<{
        name?: string;
        count?: number;
        revenue?: number;
        type?: 'size' | 'filling' | 'theme';
      }>;
      return (raw || []).map((item) => ({
        itemType: (item.type || 'size') as 'size' | 'filling' | 'theme',
        itemName: item.name || 'Unknown',
        orderCount: item.count || 0,
        totalRevenue: item.revenue || 0,
      }));
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
