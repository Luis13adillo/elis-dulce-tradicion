import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { EnrollMFA } from './EnrollMFA';
import { MFAChallengeScreen } from './MFAChallengeScreen';

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

      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error || !data) {
        // Fail open — do not block dashboard access on AAL API error
        setReadyToShow(true);
        return;
      }

      if (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
        // Session needs MFA — check whether a factor is already enrolled
        const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
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

    checkAAL();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    return null;
  }

  return <>{children}</>;
};
