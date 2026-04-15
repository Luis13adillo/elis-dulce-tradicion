import { BaseApiClient } from '../base';
import { getAvailableTransitions as getStateMachineTransitions, validateTransition, type OrderStatus, type UserRole } from '../../orderStateMachine';

export class OrdersApi extends BaseApiClient {
    async getAllOrders() {
        const sb = this.ensureSupabase();
        let dbOrders: any[] = [];

        if (sb) {
            const { data, error } = await sb
                .from('orders')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching orders:', error);
            } else {
                dbOrders = data || [];
            }
        }

        return dbOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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

        const { data, error } = await sb.rpc('create_new_order', { payload: orderPayload });

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
            const { data: { user } } = await sb.auth.getUser();

            const { data, error } = await sb.rpc('transition_order_status', {
                p_order_id: id,
                p_new_status: status,
                p_user_id: user?.id || null,
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

    async verifyPayment(paymentId: string): Promise<{ verified: boolean; orderNumber: string }> {
        const sb = this.ensureSupabase();
        if (!sb) return { verified: false, orderNumber: '' };

        const { data, error } = await sb.rpc('verify_stripe_payment', { p_payment_id: paymentId });

        if (error || !data) return { verified: false, orderNumber: '' };
        return { verified: data.verified, orderNumber: data.order_number };
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
}
