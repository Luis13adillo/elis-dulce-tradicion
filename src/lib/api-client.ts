/**
 * TypeScript API Client for Eli's Bakery API
 * Provides typed interfaces for all API endpoints with automatic error handling
 */

import { getCsrfToken, clearCsrfToken } from '@/lib/csrf';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
  status?: number;
}

export interface RequestConfig {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  retries?: number;
  timeout?: number;
}

class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private defaultRetries = 3;
  private defaultTimeout = 30000; // 30 seconds

  constructor(baseUrl: string = import.meta.env.VITE_API_URL || 'http://localhost:3001') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string | null) {
    this.accessToken = token;
  }

  /**
   * Get authentication token from storage
   */
  private getAuthToken(): string | null {
    if (this.accessToken) {
      return this.accessToken;
    }
    // Try to get from localStorage (Supabase session)
    if (typeof window !== 'undefined') {
      const session = localStorage.getItem('supabase.auth.token');
      if (session) {
        try {
          const parsed = JSON.parse(session);
          return parsed?.access_token || null;
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Make HTTP request with retry logic
   */
  private async request<T>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      retries = this.defaultRetries,
      timeout = this.defaultTimeout,
    } = config;

    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const token = this.getAuthToken();

    // Inject CSRF token for state-changing requests
    let csrfHeader: string | null = null;
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        csrfHeader = await getCsrfToken();
      } catch {
        // Non-blocking — CSRF is defense-in-depth, not auth
      }
    }

    const requestHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      ...headers,
      ...(csrfHeader ? { 'X-CSRF-Token': csrfHeader } : {}),
    };

    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }

    const requestConfig: RequestInit = {
      method,
      headers: requestHeaders,
      signal: AbortSignal.timeout(timeout),
      credentials: 'include', // Required for CSRF cookie
    };

    if (body && method !== 'GET') {
      requestConfig.body = JSON.stringify(body);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, requestConfig);

        // Handle non-JSON responses
        const contentType = response.headers.get('content-type');
        const isJson = contentType?.includes('application/json');

        let data: any;
        if (isJson) {
          data = await response.json();
        } else {
          const text = await response.text();
          data = { message: text };
        }

        if (!response.ok) {
          const error: ApiError = {
            code: data.error?.code || `HTTP_${response.status}`,
            message: data.error?.message || data.message || 'Request failed',
            details: data.error?.details,
            status: response.status,
          };

          // Auto-retry once with fresh CSRF token on 403 CSRF failures
          if (response.status === 403 && attempt === 0) {
            const errorCode = data?.error?.code || '';
            if (errorCode === 'CSRF_INVALID' || errorCode.includes('CSRF') || data?.message?.includes('csrf')) {
              clearCsrfToken();
              csrfHeader = await getCsrfToken().catch(() => '');
              if (csrfHeader) {
                (requestHeaders as Record<string, string>)['X-CSRF-Token'] = csrfHeader;
                requestConfig.headers = requestHeaders;
              }
              continue; // retry this attempt
            }
          }

          // Don't retry on client errors (4xx)
          if (response.status >= 400 && response.status < 500) {
            return {
              success: false,
              error,
            };
          }

          // Retry on server errors (5xx) or network errors
          if (attempt < retries) {
            await this.delay(Math.pow(2, attempt) * 1000); // Exponential backoff
            continue;
          }

          return {
            success: false,
            error,
          };
        }

        return {
          success: true,
          data: data.data || data,
        };
      } catch (error) {
        lastError = error as Error;

        // Don't retry on abort/timeout
        if (error instanceof Error && error.name === 'AbortError') {
          return {
            success: false,
            error: {
              code: 'TIMEOUT',
              message: 'Request timeout',
            },
          };
        }

        // Retry on network errors
        if (attempt < retries) {
          await this.delay(Math.pow(2, attempt) * 1000);
          continue;
        }
      }
    }

    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: lastError?.message || 'Network request failed',
      },
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Orders API
  async getOrders(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<any[]>> {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.offset) query.append('offset', params.offset.toString());

    const endpoint = `/api/v1/orders${query.toString() ? `?${query.toString()}` : ''}`;
    return this.request<any[]>(endpoint);
  }

  async getOrder(id: number): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/orders/${id}`);
  }

  async getOrderByNumber(orderNumber: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/orders/number/${orderNumber}`);
  }

  async createOrder(orderData: any): Promise<ApiResponse<any>> {
    return this.request<any>('/api/v1/orders', {
      method: 'POST',
      body: orderData,
    });
  }

  async updateOrderStatus(id: number, status: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/orders/${id}/status`, {
      method: 'PATCH',
      body: { status },
    });
  }

  // Payments API
  async createPayment(paymentData: {
    sourceId: string;
    amount: number;
    orderData: any;
    idempotencyKey?: string;
  }): Promise<ApiResponse<any>> {
    return this.request<any>('/api/v1/payments/create-payment', {
      method: 'POST',
      body: paymentData,
    });
  }

  // Products API
  async getProducts(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>('/api/v1/products');
  }

  async createProduct(productData: any): Promise<ApiResponse<any>> {
    return this.request<any>('/api/v1/products', {
      method: 'POST',
      body: productData,
    });
  }

  // Pricing API
  async calculatePrice(pricingData: any): Promise<ApiResponse<any>> {
    return this.request<any>('/api/v1/pricing/calculate', {
      method: 'POST',
      body: pricingData,
    });
  }

  // Capacity API
  async getAvailableDates(days?: number): Promise<ApiResponse<any[]>> {
    const endpoint = `/api/v1/capacity/available-dates${days ? `?days=${days}` : ''}`;
    return this.request<any[]>(endpoint);
  }

  // Health Check
  async healthCheck(): Promise<ApiResponse<any>> {
    return this.request<any>('/api/health');
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export for custom instances
export default ApiClient;
