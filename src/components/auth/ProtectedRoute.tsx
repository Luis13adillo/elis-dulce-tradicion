import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth';
import { FullScreenLoader } from '@/components/FullScreenLoader';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: UserRole | UserRole[];
  redirectTo?: string;
}

// Safety cap: if we somehow end up rendering the loader for more than this,
// bail to /login rather than leave the user stuck on a white screen forever.
// AuthContext now signs the user out on profile-fetch failure, so we should
// never hit this — this is belt-and-suspenders against regressions.
const LOADER_MAX_MS = 10_000;

/**
 * ProtectedRoute component that checks authentication and role
 * before rendering child components
 */
export const ProtectedRoute = ({
  children,
  requiredRole,
  redirectTo = '/login',
}: ProtectedRouteProps) => {
  const { user, isLoading } = useAuth();
  const [bailOut, setBailOut] = useState(false);

  // Start a safety timer whenever we're in a "showing the loader" state
  // (either still resolving auth, or authenticated but profile is null).
  // If it fires, force-redirect to /login. Reset the timer when we exit
  // the loading state (the effect cleanup handles that).
  const isShowingLoader = isLoading || (user != null && user.profile === null);
  useEffect(() => {
    if (!isShowingLoader) return;
    const timer = setTimeout(() => setBailOut(true), LOADER_MAX_MS);
    return () => clearTimeout(timer);
  }, [isShowingLoader]);

  if (bailOut) {
    return <Navigate to={`${redirectTo}?reason=profile-unavailable`} replace />;
  }

  // Show loading state while checking auth
  if (isLoading) {
    return <FullScreenLoader source="auth" />;
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  // Defensive: after the AuthContext fix, user is never set with a null
  // profile — loadUserProfile either succeeds or the session is cleared.
  // If we still end up here for any reason, show the loader (the timer
  // above will redirect after LOADER_MAX_MS).
  if (user.profile === null) {
    return <FullScreenLoader source="profile-null" />;
  }

  // Check role if required
  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    const userRole = user.profile?.role;

    if (!userRole || !roles.includes(userRole)) {
      // User doesn't have required role, redirect to appropriate dashboard
      if (userRole === 'owner') {
        return <Navigate to="/owner-dashboard" replace />;
      }
      if (userRole === 'baker') {
        return <Navigate to="/front-desk" replace />;
      }
      return <Navigate to="/login" replace />;
    }
  }

  return <>{children}</>;
};

