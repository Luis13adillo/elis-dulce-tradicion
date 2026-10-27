import { useEffect, useRef } from 'react';
import { BEEP_INTERVAL_MS, shouldBeep, unacceptedPaidOrders, type AlertableOrder } from '@/lib/kitchenAlerts';

/**
 * Beeps every BEEP_INTERVAL_MS while at least one paid order is still
 * 'pending' (not accepted). Stops as soon as every paid order is accepted,
 * cancelled, or sound is muted. Dismissing the full-screen alert does NOT
 * stop it — only accepting the order does.
 */
export function useUnacceptedOrderAlarm(orders: readonly AlertableOrder[], soundEnabled: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const active = shouldBeep(orders, soundEnabled);

  useEffect(() => {
    if (!active) return;
    if (!audioRef.current) audioRef.current = new Audio('/notification.mp3');
    const beep = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.loop = false;
      audio.currentTime = 0;
      audio.play().catch(() => { /* autoplay blocked until the user interacts */ });
    };
    beep();
    const id = setInterval(beep, BEEP_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);

  return { active, unacceptedCount: unacceptedPaidOrders(orders).length };
}
