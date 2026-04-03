import { BaseApiClient } from './base';
import { OrdersApi } from './modules/orders';
import { ProductsApi } from './modules/products';
import { InventoryApi } from './modules/inventory';
import { AnalyticsApi } from './modules/analytics';
import { NotificationsApi } from './modules/notifications';
import { OrderOptionsApi } from './modules/orderOptions';
import { supabase, STORAGE_BUCKET } from '../supabase';
import { getBusinessHours as cmsGetBusinessHours, type BusinessHours } from '../cms';

// Apply Mixins or Composition to rebuild the monolith interface
class ApiClient extends BaseApiClient {
    private ordersModule = new OrdersApi();
    private productsModule = new ProductsApi();
    private inventoryModule = new InventoryApi();
    private analyticsModule = new AnalyticsApi();
    private notificationsModule = new NotificationsApi();
    private orderOptionsModule = new OrderOptionsApi();

    // --- Re-exporting all methods to maintain backward compatibility ---

    // Orders
    getAllOrders = this.ordersModule.getAllOrders.bind(this.ordersModule);
    getOrder = this.ordersModule.getOrder.bind(this.ordersModule);
    getOrderByNumber = this.ordersModule.getOrderByNumber.bind(this.ordersModule);
    createOrder = this.ordersModule.createOrder.bind(this.ordersModule);
    updateOrderStatus = this.ordersModule.updateOrderStatus.bind(this.ordersModule);
    checkOrderExists = this.ordersModule.checkOrderExists.bind(this.ordersModule);
    getAvailableTransitions = this.ordersModule.getAvailableTransitions.bind(this.ordersModule);
    transitionOrderStatus = this.ordersModule.transitionOrderStatus.bind(this.ordersModule);
    getTransitionHistory = this.ordersModule.getTransitionHistory.bind(this.ordersModule);
    searchOrders = this.ordersModule.searchOrders.bind(this.ordersModule);
    verifyPayment = this.ordersModule.verifyPayment.bind(this.ordersModule);

    // Products
    getProducts = this.productsModule.getProducts.bind(this.productsModule);
    getAllProducts = this.productsModule.getAllProducts.bind(this.productsModule);
    createProduct = this.productsModule.createProduct.bind(this.productsModule);
    updateProduct = this.productsModule.updateProduct.bind(this.productsModule);
    deleteProduct = this.productsModule.deleteProduct.bind(this.productsModule);

    // Inventory
    getInventory = this.inventoryModule.getInventory.bind(this.inventoryModule);
    updateIngredient = this.inventoryModule.updateIngredient.bind(this.inventoryModule);
    logIngredientUsage = this.inventoryModule.logIngredientUsage.bind(this.inventoryModule);
    getLowStockItems = this.inventoryModule.getLowStockItems.bind(this.inventoryModule);

    // Analytics
    getDashboardMetrics = this.analyticsModule.getDashboardMetrics.bind(this.analyticsModule);
    getRevenueByPeriod = this.analyticsModule.getRevenueByPeriod.bind(this.analyticsModule);
    getPopularItems = this.analyticsModule.getPopularItems.bind(this.analyticsModule);
    getOrdersByStatus = this.analyticsModule.getOrdersByStatus.bind(this.analyticsModule);
    trackEvent = this.analyticsModule.trackEvent.bind(this.analyticsModule);

    // Notifications
    sendReadyNotification = this.notificationsModule.sendReadyNotification.bind(this.notificationsModule);
    sendOrderConfirmation = this.notificationsModule.sendOrderConfirmation.bind(this.notificationsModule);
    sendStatusUpdate = this.notificationsModule.sendStatusUpdate.bind(this.notificationsModule);
    sendOrderIssueNotification = this.notificationsModule.sendOrderIssueNotification.bind(this.notificationsModule);
    sendDailyReport = this.notificationsModule.sendDailyReport.bind(this.notificationsModule);

    // Order Form Options
    getOrderFormOptions = this.orderOptionsModule.getOrderFormOptions.bind(this.orderOptionsModule);

    // Remaining shared methods / Helpers (Carrying over from original api.ts)

    async uploadFile(file: File) {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Supabase not available');

        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `uploads/${fileName}`;

        const { error: uploadError } = await sb.storage
            .from(STORAGE_BUCKET)
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
        return { url: data.publicUrl };
    }

    // --- Stubs & Misc (to be moved later or kept here if too small) ---
    async getOrderNotes(orderId: number) {
        const sb = this.ensureSupabase();
        if (!sb) return { success: false, data: [] as any[] };
        const { data, error } = await sb.from('order_notes').select('*').eq('order_id', orderId).order('created_at', { ascending: false });
        if (error) throw error;
        return { success: true, data: data || [] };
    }

    async addOrderNote(orderId: number, content: string) {
        const sb = this.ensureSupabase();
        if (!sb) return { success: false };
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return { success: false };
        const { data, error } = await sb.from('order_notes').insert({ order_id: orderId, created_by: user.id, content: content.trim() }).select().single();
        if (error) throw error;
        return { success: true, data };
    }

    async getBusinessHours(): Promise<BusinessHours[]> {
        return cmsGetBusinessHours();
    }

    async getStaffMembers(): Promise<{ id: string; full_name: string; role: string }[]> {
        const sb = this.ensureSupabase();
        if (!sb) return [];
        const { data, error } = await sb
            .from('user_profiles')
            .select('user_id, full_name, role')
            .in('role', ['owner', 'baker']);
        if (error) throw error;
        return (data || []).map(p => ({ id: p.user_id, full_name: p.full_name, role: p.role }));
    }

    async createPaymentIntent(amount: number, metadata?: any) {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Supabase not available');
        const { data, error } = await sb.functions.invoke('create-payment-intent', { body: { amount, currency: 'usd', metadata } });
        if (error) throw error;
        return data;
    }
}

export const api = new ApiClient();
export default api;
