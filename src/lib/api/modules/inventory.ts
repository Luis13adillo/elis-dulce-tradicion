import { BaseApiClient } from '../base';

export class InventoryApi extends BaseApiClient {
    async getInventory() {
        const sb = this.ensureSupabase();
        if (!sb) return [];

        const { data, error } = await sb
            .from('ingredients')
            .select('*')
            .order('category')
            .order('name');

        if (error) {
            console.error('Error fetching inventory:', error);
            throw error;
        }
        return data || [];
    }

    async updateIngredient(id: number, quantity: number, notes?: string) {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Database not available');

        const { data, error } = await sb
            .from('ingredients')
            .update({
                quantity,
                last_updated: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deductInventoryForOrder(orderId: number) {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Database not available');

        // 1. Fetch order details
        const { data: order, error: orderError } = await sb
            .from('orders')
            .select('id, cake_size, filling, cake_flavor')
            .eq('id', orderId)
            .single();

        if (orderError || !order) throw new Error(`Could not find order ${orderId}`);

        // 2. Fetch recipes for this order's components
        // We look for 'size' and 'filling' components
        const components = [
            { type: 'size', value: order.cake_size },
            { type: 'filling', value: order.filling }
        ].filter(c => c.value);

        for (const comp of components) {
            const { data: recipes, error: recipeError } = await sb
                .from('order_component_recipes')
                .select('ingredient_id, quantity_required')
                .eq('component_type', comp.type)
                .eq('component_value', comp.value);

            if (recipeError) {
                console.warn(`No recipe found for component ${comp.type}:${comp.value}`);
                continue;
            }

            // 3. Deduct each ingredient
            for (const recipe of (recipes || [])) {
                await this.logIngredientUsage(
                    recipe.ingredient_id,
                    recipe.quantity_required,
                    orderId,
                    `Auto-deduction for ${comp.type}: ${comp.value}`
                );
            }
        }

        return { success: true };
    }

    async logIngredientUsage(ingredientId: number, quantityUsed: number, orderId?: number, notes?: string) {
        const sb = this.ensureSupabase();
        if (!sb) throw new Error('Database not available');

        const { error: usageError } = await sb
            .from('ingredient_usage')
            .insert({
                ingredient_id: ingredientId,
                quantity_used: quantityUsed,
                order_id: orderId || null,
                notes: notes || null,
            });

        if (usageError) throw usageError;

        const { data: current } = await sb
            .from('ingredients')
            .select('quantity')
            .eq('id', ingredientId)
            .single();

        if (current) {
            const newQty = Math.max(0, current.quantity - quantityUsed);
            await sb
                .from('ingredients')
                .update({ quantity: newQty, last_updated: new Date().toISOString() })
                .eq('id', ingredientId);
        }

        return { success: true };
    }

    async getLowStockItems() {
        const sb = this.ensureSupabase();
        if (!sb) return [];

        try {
            // DB-side filter via RPC — stops pulling the full ingredients
            // table into the browser just to filter in JS.
            const { data, error } = await sb.rpc('get_low_stock_ingredients');
            if (error) throw error;
            return data || [];
        } catch (e) {
            console.warn('Error fetching low stock items:', e);
            return [];
        }
    }
}
