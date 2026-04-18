// Order status types
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled';

// Delivery status types
export type DeliveryStatus =
  | 'pending'
  | 'assigned'
  | 'in_transit'
  | 'delivered'
  | 'failed';

// Refund status types
export type RefundStatus =
  | 'pending'
  | 'processed'
  | 'failed';

// Payment status types
export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

// Front-desk action triggered by an order card's primary CTA
export type OrderAction =
  | 'confirm'
  | 'start'
  | 'ready'
  | 'delivery'
  | 'complete'
  | 'markDelivered';

export type Order = {
  id: number;
  order_number: string;
  status: OrderStatus | string;

  // Customer information
  user_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_language?: string;

  // Order details
  date_needed?: string;
  time_needed?: string;
  cake_size?: string;
  filling?: string;
  theme?: string;
  dedication?: string;
  special_instructions?: string;
  reference_image_path?: string;

  stripe_payment_id?: string;
  items?: any[];

  // Delivery information
  delivery_option?: 'pickup' | 'delivery';
  delivery_address?: string;
  delivery_apartment?: string;
  delivery_zone?: string;
  delivery_status?: DeliveryStatus | string;
  driver_notes?: string;
  estimated_delivery_time?: string;

  // Pricing
  total_amount?: number | string;
  subtotal?: number;
  delivery_fee?: number;
  tax_amount?: number;
  discount_amount?: number;

  // Payment
  payment_status?: PaymentStatus | string;
  payment_method?: string;
  payment_intent_id?: string;

  // Cancellation
  cancelled_at?: string;
  cancelled_by?: string;
  cancellation_reason?: string;
  refund_amount?: number;
  refund_status?: RefundStatus | string;

  // Timestamps
  created_at?: string;
  updated_at?: string;
  confirmed_at?: string;
  ready_at?: string;
  estimated_ready_at?: string;
  completed_at?: string;
};

// Order summary for list views
export type OrderSummary = Pick<Order,
  | 'id'
  | 'order_number'
  | 'status'
  | 'customer_name'
  | 'date_needed'
  | 'time_needed'
  | 'cake_size'
  | 'total_amount'
  | 'delivery_option'
  | 'created_at'
>;

// Internal staff note on an order
export interface OrderNote {
  id: number;
  order_id: number;
  created_by: string;
  author_name: string;
  content: string;
  created_at: string;
}
