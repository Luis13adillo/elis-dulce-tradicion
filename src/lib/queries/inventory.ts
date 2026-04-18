/**
 * React Query hooks for inventory endpoints.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

// Low-stock alerts widget. Stock levels don't change in real-time; the
// owner will manually refresh or the 5-minute window is sufficient.
export const useLowStockItems = () => {
  return useQuery({
    queryKey: queryKeys.inventory.lowStock(),
    queryFn: () => api.getLowStockItems(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
