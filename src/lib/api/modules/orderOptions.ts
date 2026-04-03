import { BaseApiClient } from '../base';

export interface CakeSize {
  id: number;
  value: string;
  label_en: string;
  label_es: string;
  price: number;
  serves: string;
  featured: boolean;
  active: boolean;
  sort_order: number;
}

export interface BreadType {
  id: number;
  value: string;
  label_en: string;
  description: string;
  active: boolean;
  sort_order: number;
}

export interface CakeFilling {
  id: number;
  value: string;
  label_en: string;
  sub_label: string;
  is_premium: boolean;
  active: boolean;
  sort_order: number;
}

export interface PremiumFillingUpcharge {
  id: number;
  size_value: string;
  label_en: string;
  label_es: string;
  upcharge: number;
  active: boolean;
}

export interface OrderFormOptions {
  cakeSizes: CakeSize[];
  breadTypes: BreadType[];
  fillings: CakeFilling[];
  premiumUpcharges: PremiumFillingUpcharge[];
}

export class OrderOptionsApi extends BaseApiClient {
  async getOrderFormOptions(): Promise<OrderFormOptions> {
    const sb = this.ensureSupabase();
    if (!sb) {
      return { cakeSizes: [], breadTypes: [], fillings: [], premiumUpcharges: [] };
    }

    const [sizesResult, breadResult, fillingsResult, upchargesResult] = await Promise.all([
      sb.from('cake_sizes').select('*').eq('active', true).order('sort_order'),
      sb.from('bread_types').select('*').eq('active', true).order('sort_order'),
      sb.from('cake_fillings').select('*').eq('active', true).order('sort_order'),
      sb.from('premium_filling_upcharges').select('*').eq('active', true),
    ]);

    if (sizesResult.error) throw sizesResult.error;
    if (breadResult.error) throw breadResult.error;
    if (fillingsResult.error) throw fillingsResult.error;
    if (upchargesResult.error) throw upchargesResult.error;

    return {
      cakeSizes: sizesResult.data || [],
      breadTypes: breadResult.data || [],
      fillings: fillingsResult.data || [],
      premiumUpcharges: upchargesResult.data || [],
    };
  }
}
