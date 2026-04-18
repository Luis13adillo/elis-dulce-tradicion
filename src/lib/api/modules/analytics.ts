import { BaseApiClient } from '../base';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export class AnalyticsApi extends BaseApiClient {
    async getDashboardMetrics(dateRange: 'today' | 'week' | 'month') {
        const sb = this.ensureSupabase();
        if (!sb) return this.getFallbackMetrics();

        try {
            const { data: { session } } = await sb.auth.getSession();
            if (session?.access_token) {
                const response = await fetch(
                    `${API_BASE_URL}/api/analytics/dashboard?dateRange=${dateRange}`,
                    { headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } }
                );
                if (response.ok) {
                    const metrics = await response.json();
                    return { ...metrics, capacityUtilization: (metrics.capacityUtilization || 0) / 100 };
                }
            }
        } catch (e) {
            console.warn('Backend metrics failed, using RPC fallback');
        }

        const today = new Date().toLocaleDateString('en-CA');
        const { data: summary, error } = await sb.rpc('get_dashboard_summary', { p_start_date: today });

        if (error) {
            console.error('Dashboard RPC error:', error);
            return this.getFallbackMetrics();
        }

        return {
            ...summary,
            capacityUtilization: 0,
            averageOrderValue: summary.todayRevenue / (summary.todayOrders || 1),
            totalCustomers: 0,
            lowStockItems: 0
        };
    }

    private getFallbackMetrics() {
        return {
            todayOrders: 0,
            todayRevenue: 0,
            pendingOrders: 0,
            capacityUtilization: 0,
            averageOrderValue: 0,
            totalCustomers: 0,
            lowStockItems: 0,
            todayDeliveries: 0
        };
    }

    async getRevenueByPeriod(startDate: string, endDate: string) {
        const sb = this.ensureSupabase();
        let dbOrders: any[] = [];
        if (sb) {
            const { data } = await sb.from('orders')
                .select('created_at, total_amount')
                .gte('created_at', startDate)
                .lte('created_at', `${endDate}T23:59:59`);
            dbOrders = data || [];
        }

        const grouped = dbOrders.reduce((acc: any, order) => {
            const date = order.created_at.split('T')[0];
            if (!acc[date]) {
                acc[date] = { revenue: 0, count: 0 };
            }
            acc[date].revenue += Number(order.total_amount) || 0;
            acc[date].count += 1;
            return acc;
        }, {});

        return Object.entries(grouped).map(([date, stats]: [string, any]) => ({
            date,
            revenue: stats.revenue,
            orderCount: stats.count,
            avgOrderValue: stats.count > 0 ? stats.revenue / stats.count : 0
        })).sort((a, b) => a.date.localeCompare(b.date));
    }

    async getPopularItems() {
        const sb = this.ensureSupabase();
        if (!sb) return [];

        try {
            const { data, error } = await sb
                .from('v_popular_items')
                .select('item_type, item_name, order_count, total_revenue')
                .order('order_count', { ascending: false })
                .limit(10);

            if (error) {
                // v_popular_items may not exist in production (backend/db/ files are reference-only)
                // If view doesn't exist (42P01), return empty gracefully
                if (error.code === '42P01') {
                    console.warn('v_popular_items view does not exist — run analytics-views.sql migration');
                    return [];
                }
                throw error;
            }
            if (!data || data.length === 0) return [];

            return data.map((item: any) => ({
                name: item.item_name,
                count: item.order_count,
                revenue: item.total_revenue,
                type: item.item_type,  // 'size' | 'filling' | 'theme'
            }));
        } catch (err) {
            console.warn('Could not fetch popular items:', err);
            return [];
        }
    }

    async getOrdersByStatus() {
        const sb = this.ensureSupabase();
        if (!sb) return [];

        // Delegates grouping to Postgres. The RPC returns one row per
        // distinct status; we only need to compute percentages client-side.
        const { data, error } = await sb.rpc('get_orders_by_status');
        if (error) {
            console.warn('get_orders_by_status RPC failed:', error);
            return [];
        }

        const rows = (data || []) as Array<{ status: string; count: number; revenue: number }>;
        const totalCount = rows.reduce((sum, r) => sum + Number(r.count || 0), 0);
        if (totalCount === 0) return [];

        return rows
            .map((r) => ({
                status: r.status,
                count: Number(r.count) || 0,
                totalRevenue: Number(r.revenue) || 0,
                percentage: (Number(r.count) / totalCount) * 100,
            }))
            .sort((a, b) => b.count - a.count);
    }

    async trackEvent(name: string, properties?: Record<string, any>) {
        if (import.meta.env.DEV) {
            console.log(`[Analytics] ${name}`, properties);
        }

        const sb = this.ensureSupabase();
        if (!sb) return { success: true };

        try {
            await sb.rpc('track_analytics_event', {
                p_event_name: name,
                p_properties: {
                    ...properties,
                    timestamp: new Date().toISOString(),
                    url: typeof window !== 'undefined' ? window.location.href : undefined,
                }
            });
            return { success: true };
        } catch (error) {
            console.warn('Analytics tracking failed:', error);
            return { success: true };
        }
    }
}
