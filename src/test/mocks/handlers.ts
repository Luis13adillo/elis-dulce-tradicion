import { http, HttpResponse } from 'msw';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const handlers = [
  // Mock orders API
  http.get(`${API_BASE}/orders`, () => {
    return HttpResponse.json({
      orders: [],
      total: 0,
    });
  }),

  http.post(`${API_BASE}/orders`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      id: 1,
      order_number: 'ORD-2024-001',
      ...(body as Record<string, unknown>),
      status: 'pending',
      created_at: new Date().toISOString(),
    });
  }),

  http.get(`${API_BASE}/orders/:id`, ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      order_number: 'ORD-2024-001',
      status: 'confirmed',
      customer_name: 'Test Customer',
      total_amount: 50.00,
    });
  }),

  http.patch(`${API_BASE}/orders/:id/status`, async ({ params, request }) => {
    const body = await request.json() as { status: string };
    return HttpResponse.json({
      id: params.id,
      status: body.status,
      updated_at: new Date().toISOString(),
    });
  }),

  // Mock products API
  http.get(`${API_BASE}/products`, () => {
    return HttpResponse.json([
      {
        id: 1,
        name_es: 'Pastel de Chocolate',
        name_en: 'Chocolate Cake',
        price: 45.99,
        category: 'cakes',
      },
    ]);
  }),

  // Mock pricing API
  http.post(`${API_BASE}/pricing/calculate`, async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
      basePrice: 50,
      fillingCost: body.filling ? 5 : 0,
      themeCost: body.theme ? 10 : 0,
      deliveryFee: body.deliveryOption === 'delivery' ? 15 : 0,
      tax: 0,
      subtotal: 65,
      discount: 0,
      total: 65,
    });
  }),

  // Mock capacity API
  http.get(`${API_BASE}/capacity/available-dates`, () => {
    return HttpResponse.json([
      {
        date: new Date().toISOString().split('T')[0],
        available: true,
        current_orders: 2,
        max_orders: 10,
        reason: '',
      },
    ]);
  }),

  // Mock payments API
  http.post(`${API_BASE}/payments`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      id: 'pay_123',
      status: 'COMPLETED',
      amount: (body as any).amount,
      order_id: (body as any).order_id,
    });
  }),

  // Mock auth API
  http.post(`${API_BASE}/auth/login`, async ({ request }) => {
    const body = await request.json() as { email: string; password: string };
    if (body.email === 'test@example.com' && body.password === 'password123') {
      return HttpResponse.json({
        user: {
          id: 'user_123',
          email: body.email,
          profile: {
            role: 'customer',
            full_name: 'Test User',
          },
        },
        token: 'mock_token_123',
      });
    }
    return HttpResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    );
  }),

  // Mock Supabase auth
  http.post('https://*.supabase.co/auth/v1/token', () => {
    return HttpResponse.json({
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
      user: {
        id: 'user_123',
        email: 'test@example.com',
      },
    });
  }),
];
