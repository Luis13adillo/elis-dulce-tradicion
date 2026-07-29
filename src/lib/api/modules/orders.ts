import { BaseApiClient } from '../base';
import { getAvailableTransitions as getStateMachineTransitions, validateTransition, type OrderStatus, type UserRole } from '../../orderStateMachine';

export class OrdersApi extends BaseApiClient {
    // Default row cap. The dashboard/front-desk only ever render a recent
    // window — fetching the entire orders table every real-time event was
    // the largest per-event bandwidth cost. Callers that need everything
    // can pass a higher limit explicitly.
    async getAllOrders(opts?: { limit?: number; status?: string }) {
        const sb = this.ensureSupabase();
        if (!sb) return [];

        const limit = opts?.limit ?? 500;
        let query = sb
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (opts?.status) {
            query = query.eq('status', opts.status);
        }

        const { data, error } = await query;
        if (error) {
            // Throw instead of silently returning [] — otherwise React Query
            // overwrites the existing cache with an empty list on any transient
            // failure (auth blip, RLS miss, rate limit) and the Front Desk grid
            // goes blank with no surfaced error.
            console.error('Error fetching orders:', error);
            throw new Error(error.message || 'Failed to fetch orders');
        }
        // Already sorted server-side; no need to re-sort in JS.
        return data || [];
    }

    async getOrder(id: string | number) {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Database connection not available.');

        const { data, error } = await sb
            .from('orders')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error(`Error fetching order ${id}:`, error);
            throw error;
        }

        return data;
    }

    async getOrderByNumber(orderNumber: string) {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Database connection not available.');

        const { data, error } = await sb.rpc('get_public_order', { p_order_number: orderNumber });

        if (error) {
            console.error(`Error fetching order by number ${orderNumber}:`, error);
            throw error;
        }

        return data;
    }

    async createOrder(orderData: any) {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Database connection not available.');

        const orderPayload = {
            ...orderData,
            status: orderData.status || 'pending',
            payment_status: orderData.payment_status || 'pending',
        };

        // staff_create_new_order (not create_new_order): the raw RPC trusts the
        // payload completely — it can set status, payment_status and
        // total_amount — and was reachable by anonymous callers until the
        // 2026-07-28 lockdown. The staff_ wrapper enforces owner/baker.
        const { data, error } = await sb.rpc('staff_create_new_order', { payload: orderPayload });

        if (error) {
            console.error('Error creating order:', error);
            throw error;
        }

        return { success: true, order: data };
    }

    async updateOrderStatus(id: number, status: string, metadata?: { reason?: string;[key: string]: any }) {
        const sb = this.ensureSupabase();
        if (!sb) return { success: false, error: 'Database connection not available.' };

        try {
            // staff_transition_order_status (not transition_order_status):
            // enforces owner/baker, and derives order_status_history.changed_by
            // from auth.uid() server-side. p_user_id is deliberately NOT sent —
            // it was client-supplied and therefore forgeable, which let a caller
            // stamp someone else's UUID on their own action.
            const { data, error } = await sb.rpc('staff_transition_order_status', {
                p_order_id: id,
                p_new_status: status,
                p_reason: metadata?.reason || null,
                p_metadata: metadata || {}
            });

            if (error) {
                console.error(`Error updating order ${id} status:`, error);
                return { success: false, error: error.message };
            }

            // Persist estimated_ready_at if provided (RPC doesn't handle custom fields)
            if (metadata?.estimated_ready_at) {
                await sb.from('orders')
                    .update({ estimated_ready_at: metadata.estimated_ready_at })
                    .eq('id', id);
            }

            return data as { success: boolean; error?: string };
        } catch (err: any) {
            console.error(`Error updating order ${id} status:`, err);
            return { success: false, error: err.message };
        }
    }

    async checkOrderExists(orderId: number): Promise<boolean> {
        const sb = this.ensureSupabase();
        if (!sb) return false;
        const { count, error } = await sb
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('id', orderId);

        if (error || count === null) return false;
        return count > 0;
    }

    async getAvailableTransitions(orderId: number) {
        const sb = this.ensureSupabase();
        if (!sb) return { success: false, transitions: [] as OrderStatus[], error: 'Database not available' };

        try {
            const { data: order, error } = await sb
                .from('orders')
                .select('*')
                .eq('id', orderId)
                .single();

            if (error || !order) return { success: false, transitions: [] as OrderStatus[], error: 'Order not found' };

            const { data: { user } } = await sb.auth.getUser();
            let userRole: UserRole = 'customer';
            if (user) {
                const { data: profile } = await sb
                    .from('user_profiles')
                    .select('role')
                    .eq('user_id', user.id)
                    .single();
                if (profile?.role) userRole = profile.role as UserRole;
            }

            const transitions = getStateMachineTransitions(order.status as OrderStatus, order, userRole);
            return { success: true, transitions };
        } catch (err: any) {
            console.error('Error getting available transitions:', err);
            return { success: false, transitions: [] as OrderStatus[], error: err.message };
        }
    }

    async transitionOrderStatus(orderId: number, newStatus: string, reason?: string) {
        const sb = this.ensureSupabase();
        if (!sb) return { success: false, error: 'Database not available' };

        try {
            const { data: order, error: fetchError } = await sb
                .from('orders')
                .select('*')
                .eq('id', orderId)
                .single();

            if (fetchError || !order) return { success: false, error: 'Order not found' };

            const { data: { user } } = await sb.auth.getUser();
            let userRole: UserRole = 'customer';
            if (user) {
                const { data: profile } = await sb
                    .from('user_profiles')
                    .select('role')
                    .eq('user_id', user.id)
                    .single();
                if (profile?.role) userRole = profile.role as UserRole;
            }

            const validation = validateTransition(
                order.status as OrderStatus,
                newStatus as OrderStatus,
                order,
                { orderId, userRole, reason }
            );

            if (!validation.valid) {
                return { success: false, error: validation.error };
            }

            const previousStatus = order.status;
            const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
            if (newStatus === 'ready') updates.ready_at = new Date().toISOString();
            if (newStatus === 'completed') updates.completed_at = new Date().toISOString();
            if (newStatus === 'cancelled') {
                updates.cancelled_at = new Date().toISOString();
                if (reason) updates.cancellation_reason = reason;
            }

            const { error: updateError } = await sb
                .from('orders')
                .update(updates)
                .eq('id', orderId);

            if (updateError) throw updateError;

            // --- AUTOMATED INVENTORY DEPLETION ---
            if (newStatus === 'in_progress') {
                try {
                    // Import dynamically to avoid potential circular dependency
                    const { InventoryApi } = await import('./inventory');
                    const inventory = new InventoryApi();
                    await inventory.deductInventoryForOrder(orderId);
                } catch (invError) {
                    console.error('Failed to auto-deduct inventory:', invError);
                    // We don't block the status change if inventory fails, but we log it
                }
            }

            sb.from('order_status_history').insert({
                order_id: orderId,
                previous_status: previousStatus,
                new_status: newStatus,
                changed_by: user?.id || null,
                reason: reason || null,
            }).then(({ error: histError }) => {
                if (histError) console.error('Error inserting status history:', histError);
            });

            return { success: true };
        } catch (err: any) {
            console.error('Error transitioning order status:', err);
            return { success: false, error: err.message };
        }
    }

    async getTransitionHistory(orderId: number) {
        const sb = this.ensureSupabase();
        if (!sb) return { success: false, history: [], error: 'Database not available' };

        try {
            const { data, error } = await sb
                .from('order_status_history')
                .select('*')
                .eq('order_id', orderId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            return { success: true, history: data || [] };
        } catch (err: any) {
            console.error('Error fetching transition history:', err);
            return { success: false, history: [], error: err.message };
        }
    }

    // --- Tier A: pending-order lifecycle (save-before-pay) ---

    async createPendingOrder(payload: Record<string, unknown>): Promise<{
        pending_order_id: string;
        order_number: string;
        total_amount: number;
        expires_at: string;
        delivery_quote_status?: string;
        delivery_fee?: number;
        delivery_distance_miles?: number | null;
    }> {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Database connection not available.');

        // Goes through the create-pending-order Edge Function (not the RPC
        // directly) so the server computes the delivery verdict: flat $5
        // within 5 driving miles of the bakery, otherwise quote_required.
        const { data, error } = await sb.functions.invoke('create-pending-order', { body: payload });
        if (error) {
            // Surface the server's validation message (capacity full, pricing
            // mismatch, holiday closure…) hidden behind FunctionsHttpError.
            const ctx = (error as { context?: Response }).context;
            let parsed: { error?: string } | null = null;
            if (ctx && typeof ctx.json === 'function') {
                try { parsed = await ctx.json(); } catch { /* body not JSON */ }
            }
            throw new Error(parsed?.error || error.message);
        }
        if (!data || !data.pending_order_id) {
            throw new Error('create-pending-order returned no id');
        }
        return data as {
            pending_order_id: string; order_number: string; total_amount: number;
            expires_at: string; delivery_quote_status?: string; delivery_fee?: number;
            delivery_distance_miles?: number | null;
        };
    }

    async getPendingOrder(pendingId: string): Promise<Record<string, unknown> | null> {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Database connection not available.');

        const { data, error } = await sb.rpc('get_pending_order', { p_pending_id: pendingId });
        if (error) throw error;
        return data as Record<string, unknown> | null;
    }

    /**
     * Staff photo-review queue (owner/baker only — table grant + RLS).
     * Includes held, approved-awaiting-payment, and reopenable rows.
     */
    async getReviewQueue(): Promise<Record<string, unknown>[]> {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Database connection not available.');

        const { data, error } = await sb
            .from('pending_orders')
            .select('id, order_number, status, image_review_status, image_review_result, image_reviewed_at, customer_name, customer_email, customer_phone, customer_language, date_needed, time_needed, cake_size, servings, filling, theme, dedication, recipient_name, total_amount, original_total_amount, price_revision, delivery_option, delivery_address, delivery_fee, reference_image_path, expires_at, payment_link_sent_at, payment_reminder_sent_at, created_at')
            .in('image_review_status', ['needs_review', 'approved', 'review_expired', 'declined'])
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) throw error;
        return data ?? [];
    }

    /** Staff resolution of a held photo review via the review-resolve Edge Function. */
    async resolveImageReview(input: {
        pending_order_id: string;
        action: 'approve' | 'decline' | 'expire' | 'reopen';
        updates?: Record<string, unknown>;
        final_total?: number;
        notes?: string;
        contacted_customer?: boolean;
    }): Promise<Record<string, unknown>> {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Database connection not available.');

        const { data, error } = await sb.functions.invoke('review-resolve', { body: input });
        if (error) {
            const ctx = (error as { context?: Response }).context;
            let parsed: { error?: string; code?: string; details?: unknown } | null = null;
            if (ctx && typeof ctx.json === 'function') {
                try { parsed = await ctx.json(); } catch { /* body not JSON */ }
            }
            const surfaced = new Error(parsed?.error || error.message) as Error & { code?: string; details?: unknown };
            if (parsed?.code) surfaced.code = parsed.code;
            if (parsed?.details) surfaced.details = parsed.details;
            throw surfaced;
        }
        return data as Record<string, unknown>;
    }

    /**
     * Staff delivery-quote queue (owner/baker only — table grant + RLS).
     * quote_required rows block payment until staff enters the fee.
     */
    async getDeliveryQuoteQueue(): Promise<Record<string, unknown>[]> {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Database connection not available.');

        const { data, error } = await sb
            .from('pending_orders')
            .select('id, order_number, status, delivery_quote_status, delivery_distance_miles, delivery_verify_method, customer_name, customer_email, customer_phone, customer_language, date_needed, time_needed, cake_size, filling, theme, delivery_address, delivery_apartment, delivery_instructions, delivery_fee, total_amount, original_total_amount, price_revision, expires_at, payment_link_sent_at, created_at')
            .in('delivery_quote_status', ['quote_required', 'quoted'])
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) throw error;
        return data ?? [];
    }

    /** Staff enters the final delivery fee via the resolve-delivery-quote Edge Function. */
    async resolveDeliveryQuote(input: {
        pending_order_id: string;
        delivery_fee: number;
        notes?: string;
    }): Promise<Record<string, unknown>> {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Database connection not available.');

        const { data, error } = await sb.functions.invoke('resolve-delivery-quote', { body: input });
        if (error) {
            const ctx = (error as { context?: Response }).context;
            let parsed: { error?: string; details?: unknown } | null = null;
            if (ctx && typeof ctx.json === 'function') {
                try { parsed = await ctx.json(); } catch { /* body not JSON */ }
            }
            const surfaced = new Error(parsed?.error || error.message) as Error & { details?: unknown };
            if (parsed?.details) surfaced.details = parsed.details;
            throw surfaced;
        }
        return data as Record<string, unknown>;
    }

    /**
     * Pre-payment AI photo review. Returns only the routing decision — the
     * verdict itself never reaches the browser. Fail-closed at the caller:
     * if this invoke fails for an order that has a photo, route to the
     * holding page; the create-payment-intent gate is the real protection.
     */
    async reviewOrderImage(pendingId: string): Promise<{ held: boolean }> {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Database connection not available.');

        const { data, error } = await sb.functions.invoke('review-order-image', {
            body: { pending_order_id: pendingId },
        });
        if (error) throw error;
        return { held: Boolean((data as { held?: boolean })?.held) };
    }

    async verifyPaymentByPending(pendingId: string): Promise<{
        verified: boolean;
        status: string;
        order?: Record<string, unknown>;
        error_message?: string;
    }> {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Database connection not available.');

        const { data, error } = await sb.functions.invoke('verify-payment', {
            body: { pending_order_id: pendingId },
        });
        if (error) throw error;
        return data as { verified: boolean; status: string; order?: Record<string, unknown>; error_message?: string };
    }

    async searchOrders(query: string) {
        const sb = this.ensureSupabase();
        if (!sb) return { success: false, error: 'Database connection not available.' };

        try {
            const { data, error } = await sb
                .from('orders')
                .select('*')
                .or(`id.eq.${query},customer_name.ilike.%${query}%,email.ilike.%${query}%,order_number.ilike.%${query}%`)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            return { success: true, data };
        } catch (err: any) {
            console.error('Search order error:', err);
            return { success: false, error: err.message };
        }
    }

    // --- Cancellation (frontend bridge to Express /api/orders/:id/... routes) ---

    private async getAuthHeaders(): Promise<Record<string, string>> {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Supabase not available');
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');
        return {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
        };
    }

    async getCancellationPolicy(_orderId: number, hoursBefore: number) {
        try {
            const sb = this.ensureSupabase();
            if (!sb) return null;
            const { data, error } = await sb.rpc('get_cancellation_policy', { hours_before: Math.floor(hoursBefore) });
            if (error) {
                console.error('getCancellationPolicy rpc failed:', error);
                return null;
            }
            const row = Array.isArray(data) ? data[0] : data;
            return row ?? { hours_before_needed: 0, refund_percentage: 0, description: 'No refund available' };
        } catch (err) {
            console.error('getCancellationPolicy failed:', err);
            return null;
        }
    }

    async cancelOrder(
        orderId: number,
        request: { reason: string; reasonDetails?: string }
    ): Promise<{ success: boolean; refund?: { refundAmount: number; refundPercentage: number; refundStatus: 'pending' | 'processed' | 'failed' | 'not_applicable'; stripeRefundId?: string | null }; error?: string }> {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Supabase client unavailable');
        const { data, error } = await sb.functions.invoke('order-cancel', {
            body: { orderId, ...request },
        });
        if (error) throw new Error((data as { error?: string })?.error || error.message || 'Cancel failed');
        if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
        return data as { success: boolean; refund?: { refundAmount: number; refundPercentage: number; refundStatus: 'pending' | 'processed' | 'failed' | 'not_applicable'; stripeRefundId?: string | null } };
    }

    async adminCancelOrder(
        orderId: number,
        request: { reason: string; reasonDetails?: string; overrideRefundAmount?: number; adminNotes?: string }
    ): Promise<{ success: boolean; refund?: { refundAmount: number; refundPercentage: number; refundStatus: 'pending' | 'processed' | 'failed' | 'not_applicable'; stripeRefundId?: string | null }; error?: string }> {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Supabase client unavailable');
        const { data, error } = await sb.functions.invoke('order-cancel', {
            body: { orderId, ...request },
        });
        if (error) throw new Error((data as { error?: string })?.error || error.message || 'Admin cancel failed');
        if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
        return data as { success: boolean; refund?: { refundAmount: number; refundPercentage: number; refundStatus: 'pending' | 'processed' | 'failed' | 'not_applicable'; stripeRefundId?: string | null } };
    }
}
