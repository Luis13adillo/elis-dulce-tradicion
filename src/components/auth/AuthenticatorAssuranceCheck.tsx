import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { EnrollMFA } from './EnrollMFA';
import { MFAChallengeScreen } from './MFAChallengeScreen';
import { FullScreenLoader } from '@/components/FullScreenLoader';

const TIMEOUT_SENTINEL = Symbol('aac-timeout');

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT_SENTINEL> =>
  Promise.race<T | typeof TIMEOUT_SENTINEL>([
    p,
    new Promise((resolve) => setTimeout(() => resolve(TIMEOUT_SENTINEL), ms)),
  ]);

interface AuthenticatorAssuranceCheckProps {
  children: React.ReactNode;
  userRole: 'owner' | 'baker' | 'customer';
}

/**
 * AAL (Authenticator Assurance Level) enforcement wrapper.
 *
 * - customer: always pass through — no MFA required
 * - baker: optional MFA — pass through if no TOTP factor enrolled; challenge if enrolled
 * - owner: enforced MFA — require TOTP enrollment and challenge
 *
 * CRITICAL: This component must NOT call signOut() or navigate() — ProtectedRoute handles those.
 * This only gates content display.
 *
 * MFA enforcement note: For owner accounts, Supabase must be configured to require MFA.
 * Set 'Require MFA for owner role' in Supabase Auth dashboard → Users → owner@elisbakery.com → Settings.
 * Without that setting, nextLevel will be 'aal1' even for owners and the gate won't trigger.
 */
export const AuthenticatorAssuranceCheck = ({
  children,
  userRole,
}: AuthenticatorAssuranceCheckProps) => {
  const [readyToShow, setReadyToShow] = useState(false);
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);

  useEffect(() => {
    const checkAAL = async () => {
      // Customers have no MFA requirement — always pass through
      if (userRole === 'customer') {
        setReadyToShow(true);
        return;
      }

      // 3s fail-open: if Supabase hangs (flaky Wi-Fi, regional outage), render the
      // dashboard rather than leaving the user on a blank screen forever.
      const aalResult = await withTimeout(
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        3000,
      );
      if (aalResult === TIMEOUT_SENTINEL) {
        console.info('[boot] AAL check timed out — fail-open', 'getAuthenticatorAssuranceLevel');
        setReadyToShow(true);
        return;
      }
      const { data, error } = aalResult;
      if (error || !data) {
        // Fail open — do not block dashboard access on AAL API error
        setReadyToShow(true);
        return;
      }

      if (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
        // Session needs MFA — check whether a factor is already enrolled
        const factorsResult = await withTimeout(
          supabase.auth.mfa.listFactors(),
          3000,
        );
        if (factorsResult === TIMEOUT_SENTINEL) {
          console.info('[boot] AAL check timed out — fail-open', 'listFactors');
          setReadyToShow(true);
          return;
        }
        const { data: factors, error: factorError } = factorsResult;
        if (factorError || !factors) {
          // Fail open on list error
          setReadyToShow(true);
          return;
        }

        if (factors.totp.length === 0) {
          // No factor enrolled yet — show enrollment screen
          setShowEnrollment(true);
        } else {
          // Factor exists but session not at aal2 — show challenge screen
          setShowChallenge(true);
        }
      } else {
        // Already at aal2 or aal2 not required — pass through
        setReadyToShow(true);
      }
    };

    checkAAL().catch((err) => {
      // A synchronous throw anywhere in the MFA API (e.g. the JS client
      // fails to initialise after an HMR module-graph change) would leave
      // `readyToShow` as false forever — exactly the silent-hang failure
      // mode we are defending against. Fail open with a loud log.
      console.warn('[boot] AAL check threw — fail-open', err);
      setReadyToShow(true);
    });
  }, [userRole]);

  if (showEnrollment) {
    return (
      <EnrollMFA
        onEnrolled={() => {
          setShowEnrollment(false);
          setReadyToShow(true);
        }}
      />
    );
  }

  if (showChallenge) {
    return (
      <MFAChallengeScreen
        onVerified={() => {
          setShowChallenge(false);
          setReadyToShow(true);
        }}
      />
    );
  }

  if (!readyToShow) {
    // Render the themed loader (not null) so the ~1–3s MFA-check window
    // doesn't leave the user staring at whatever is behind the React tree
    // (which was charcoal body background in OS dark mode → the "black
    // screen with gold spinner" symptom).
    return <FullScreenLoader source="aal" />;
  }

  return <>{children}</>;
};
