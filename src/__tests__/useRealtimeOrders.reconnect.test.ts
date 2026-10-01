import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Capture every subscribe() status-callback the hook registers, and stub a
// minimal Supabase channel, so we can drive SUBSCRIBED / CHANNEL_ERROR exactly
// like the realtime server would and assert when the catch-up fires.
const h = vi.hoisted(() => {
  const subscribeCallbacks: Array<(status: string) => void> = [];
  const channel = {
    on() { return channel; },
    subscribe(cb: (status: string) => void) { subscribeCallbacks.push(cb); return channel; },
    unsubscribe() { return Promise.resolve('ok'); },
  };
  return { subscribeCallbacks, supabaseMock: { channel: vi.fn(() => channel) } };
});

vi.mock('@/lib/supabase', () => ({ supabase: h.supabaseMock, STORAGE_BUCKET: 'reference-images' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';

describe('useRealtimeOrders — reconnect catch-up', () => {
  beforeEach(() => {
    h.subscribeCallbacks.length = 0;
    h.supabaseMock.channel.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('does NOT fire onReconnect on the first connect, but DOES after a real dropout/reconnect', () => {
    const onReconnect = vi.fn();
    renderHook(() => useRealtimeOrders({ onReconnect }));

    expect(h.subscribeCallbacks.length).toBe(1);
    const cb1 = h.subscribeCallbacks[0];

    // (5) First successful subscribe — must NOT trigger a catch-up refetch.
    act(() => { cb1('SUBSCRIBED'); });
    expect(onReconnect).not.toHaveBeenCalled();

    // A genuine dropout, then the backoff timer elapses and the hook re-subscribes.
    act(() => { cb1('CHANNEL_ERROR'); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(h.subscribeCallbacks.length).toBe(2);
    const cb2 = h.subscribeCallbacks[1];

    // (6) Re-subscribe after the dropout — must trigger exactly one catch-up.
    act(() => { cb2('SUBSCRIBED'); });
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('fires onReconnect once per dropout, not on every SUBSCRIBED', () => {
    const onReconnect = vi.fn();
    renderHook(() => useRealtimeOrders({ onReconnect }));
    const cb1 = h.subscribeCallbacks[0];

    act(() => { cb1('SUBSCRIBED'); });          // first connect — no fire
    act(() => { cb1('SUBSCRIBED'); });          // duplicate SUBSCRIBED — still no fire
    expect(onReconnect).not.toHaveBeenCalled();

    act(() => { cb1('TIMED_OUT'); });           // dropout #1
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { h.subscribeCallbacks.at(-1)!('SUBSCRIBED'); });
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});
