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
    createPendingOrder = this.ordersModule.createPendingOrder.bind(this.ordersModule);
    getPendingOrder = this.ordersModule.getPendingOrder.bind(this.ordersModule);
    reviewOrderImage = this.ordersModule.reviewOrderImage.bind(this.ordersModule);
    getReviewQueue = this.ordersModule.getReviewQueue.bind(this.ordersModule);
    resolveImageReview = this.ordersModule.resolveImageReview.bind(this.ordersModule);
    verifyPaymentByPending = this.ordersModule.verifyPaymentByPending.bind(this.ordersModule);
    getDeliveryQuoteQueue = this.ordersModule.getDeliveryQuoteQueue.bind(this.ordersModule);
    resolveDeliveryQuote = this.ordersModule.resolveDeliveryQuote.bind(this.ordersModule);
    cancelOrder = this.ordersModule.cancelOrder.bind(this.ordersModule);
    adminCancelOrder = this.ordersModule.adminCancelOrder.bind(this.ordersModule);
    getCancellationPolicy = this.ordersModule.getCancellationPolicy.bind(this.ordersModule);

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
        const { data: profile } = await sb.from('user_profiles').select('full_name').eq('user_id', user.id).single();
        const authorName = profile?.full_name || user.email?.split('@')[0] || 'Staff';
        const { data, error } = await sb.from('order_notes').insert({ order_id: orderId, created_by: user.id, author_name: authorName, content: content.trim() }).select().single();
        if (error) throw error;
        return { success: true, data };
    }

    async deleteOrderNote(noteId: number) {
        const sb = this.ensureSupabase();
        if (!sb) return { success: false, error: 'Not initialized' };
        const { error } = await sb.from('order_notes').delete().eq('id', noteId);
        if (error) return { success: false, error: error.message };
        return { success: true };
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

    // Tier A: prefer passing pending_order_id; server reads amount from DB.
    async createPaymentIntent(input: { pending_order_id: string } | { amount: number; metadata?: Record<string, unknown> }) {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Supabase not available');
        const body =
            'pending_order_id' in input
                ? { pending_order_id: input.pending_order_id }
                : { amount: input.amount, currency: 'usd', metadata: input.metadata };
        const { data, error } = await sb.functions.invoke('create-payment-intent', { body });
        if (error) {
            // FunctionsHttpError hides the function's JSON body behind
            // error.context — surface { error, code } so callers can branch
            // (e.g. code 'image_review_required' redirects to the holding page).
            const ctx = (error as { context?: Response }).context;
            let parsed: { error?: string; code?: string } | null = null;
            if (ctx && typeof ctx.json === 'function') {
                try { parsed = await ctx.json(); } catch { /* body not JSON */ }
            }
            const surfaced = new Error(parsed?.error || error.message) as Error & { code?: string };
            if (parsed?.code) surfaced.code = parsed.code;
            throw surfaced;
        }
        return data as { clientSecret: string; id: string };
    }

    /**
     * Display-only delivery pre-check for the order wizard, served by the
     * delivery-quote Edge Function (which measures driving distance from the
     * Norristown bakery). 'flat' = $5 fee within 5 miles; anything else is
     * 'quote_required' — the order is still accepted, payment waits for a
     * staff quote. The authoritative verdict is recomputed server-side at
     * submit time; this result only drives what the wizard shows.
     * Replaced the old localhost/Express endpoint (never deployed) 2026-07-29.
     */
    async getDeliveryQuote(address: string): Promise<{
        status: 'flat' | 'quote_required';
        fee: number;
        distance_miles: number | null;
        flat_fee: number;
        flat_radius_miles: number;
    }> {
        const fallback = {
            status: 'quote_required' as const, fee: 0, distance_miles: null,
            flat_fee: 5, flat_radius_miles: 5,
        };
        const sb = this.ensureSupabase();
        if (!sb) return fallback;
        try {
            const { data, error } = await sb.functions.invoke('delivery-quote', { body: { address } });
            if (error || !data?.status) return fallback;
            return data as {
                status: 'flat' | 'quote_required'; fee: number; distance_miles: number | null;
                flat_fee: number; flat_radius_miles: number;
            };
        } catch {
            return fallback;
        }
    }
}

export const api = new ApiClient();
export default api;
