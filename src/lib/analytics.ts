/* eslint-disable @typescript-eslint/no-explicit-any */
import { api } from './api';

export interface DashboardMetrics {
  todayOrders: number;
  todayRevenue: number;
  pendingOrders: number;
  capacityUtilization: number;
  averageOrderValue: number;
  totalCustomers: number;
  lowStockItems: number;
  todayDeliveries: number;
}

export interface RevenueDataPoint {
  date: string;
  revenue: number;
  orderCount: number;
  avgOrderValue?: number;

}

export interface PopularItem {
  itemType: 'size' | 'filling' | 'theme';
  itemName: string;
  orderCount: number;
  totalRevenue?: number; // Optional for compatibility, made required by dashboard use

}

export interface OrderStatusBreakdown {
  status: string;
  count: number;
  totalRevenue: number;
  percentage: number;
}

export interface PeakOrderingTime {
  hour: number;
  orderCount: number;
  revenue: number;
}

export interface CapacityUtilization {
  date: string;
  maxOrders: number;
  currentOrders: number;
  utilizationPercentage: number;
  capacityStatus: 'full' | 'high' | 'medium' | 'low';
}

export interface CustomerRetention {
  period: string;
  newCustomers: number;
  returningCustomers: number;
  retentionRate: number;
}

/**
 * Get dashboard metrics for a date range
 */
export async function getDashboardMetrics(
  dateRange: 'today' | 'week' | 'month' = 'today'
): Promise<DashboardMetrics> {
  return api.getDashboardMetrics(dateRange);
}

/**
 * Get revenue data by period
 */

export async function getRevenueByPeriod(
  startDate: string,
  endDate: string,
  groupBy: 'day' | 'week' | 'month' = 'day'
): Promise<RevenueDataPoint[]> {
  // api.getRevenueByPeriod only takes 2 args now
  return api.getRevenueByPeriod(startDate, endDate);
}

export async function getPopularItems(
  period: 'week' | 'month' | 'year' = 'month'
): Promise<PopularItem[]> {
  return api.getPopularItems();
}

export async function getOrdersByStatus(): Promise<OrderStatusBreakdown[]> {
  return api.getOrdersByStatus();
}

/**
 * Get low stock items
 */
export async function getLowStockItems(): Promise<any[]> {
  return api.getLowStockItems();
}

/**
 * Generate daily sales report
 */
