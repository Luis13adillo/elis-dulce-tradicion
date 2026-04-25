import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { HelmetProvider } from "react-helmet-async";
import ScrollToTop from "@/components/ScrollToTop";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { queryClient } from "@/lib/queryClient";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { initServiceWorker, unregisterStaleServiceWorker } from "@/lib/pwa";
import ErrorBoundary from "@/components/ErrorBoundary";
import { LazyBoundary } from "@/components/LazyBoundary";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

// Lazy load pages for code splitting. `lazyWithRetry` retries failed
// dynamic imports up to 3× with exponential backoff and times out each
// attempt at 15 s — stale chunks after a deploy, transient network, and
// Vite HMR edge cases now surface as an actionable error instead of a
// FullScreenLoader that sits forever.
const Index = lazyWithRetry(() => import("./pages/Index"));
// Online ordering paused while we resolve a Stripe webhook issue. The /order
// route renders OrderMaintenance instead — phone + address + email so
// customers can still place orders. Restore by swapping the import back to
// `./pages/Order` once webhook delivery is verified end-to-end.
const Order = lazyWithRetry(() => import("./pages/OrderMaintenance"));
const PaymentCheckout = lazyWithRetry(() => import("./pages/PaymentCheckout"));
const OrderConfirmation = lazyWithRetry(() => import("./pages/OrderConfirmation"));
const FrontDesk = lazyWithRetry(() => import("./pages/FrontDesk"));
const OwnerDashboard = lazyWithRetry(() => import("./pages/OwnerDashboard"));
const Login = lazyWithRetry(() => import("./pages/Login"));
const Signup = lazyWithRetry(() => import("./pages/Signup"));
const Gallery = lazyWithRetry(() => import("./pages/Gallery"));
const Menu = lazyWithRetry(() => import("./pages/Menu"));
const FAQ = lazyWithRetry(() => import("./pages/FAQ"));
const OrderTracking = lazyWithRetry(() => import("./pages/OrderTracking"));
const About = lazyWithRetry(() => import("./pages/About"));
const Privacy = lazyWithRetry(() => import("./pages/Privacy"));
const Terms = lazyWithRetry(() => import("./pages/Terms"));
const TermsOfService = lazyWithRetry(() => import("./pages/Legal/TermsOfService"));
const PrivacyPolicy = lazyWithRetry(() => import("./pages/Legal/PrivacyPolicy"));
const Contact = lazyWithRetry(() => import("./pages/Contact"));
const OrderIssue = lazyWithRetry(() => import("./pages/OrderIssue"));
const RefundPolicy = lazyWithRetry(() => import("./pages/Legal/RefundPolicy"));
const CookiePolicy = lazyWithRetry(() => import("./pages/Legal/CookiePolicy"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));

import { useWebsiteTracker } from "@/hooks/useWebsiteTracker";

// Tracker component to use inside Router
const Tracker = () => {
  useWebsiteTracker();
  return null;
};

const App = () => {
  // Initialize PWA service worker. Clear any stale SW + caches first so
  // existing users escape the broken Supabase NetworkFirst cache shipped
  // in earlier builds (would hang the dashboard on a loading spinner).
  useEffect(() => {
    unregisterStaleServiceWorker().finally(() => {
      initServiceWorker();
    });
  }, []);

  return (
    <HelmetProvider>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
          <LanguageProvider>
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <OfflineIndicator />
              <AnnouncementBanner />
              <BrowserRouter>
                <Tracker />
                <ScrollToTop />
                <LazyBoundary source="outer-suspense">
                  <Routes>
                    {/* Public Routes */}
                    <Route path="/" element={<Index />} />
                    <Route path="/order" element={<Order />} />
                    <Route path="/payment-checkout" element={<PaymentCheckout />} />
                    <Route path="/order-confirmation" element={<OrderConfirmation />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/gallery" element={<Gallery />} />
                    <Route path="/menu" element={<Menu />} />
                    <Route path="/faq" element={<FAQ />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/terms" element={<Terms />} />
                    {/* Legal Pages */}
                    <Route path="/legal/terms" element={<TermsOfService />} />
                    <Route path="/legal/privacy" element={<PrivacyPolicy />} />
                    <Route path="/legal/refund" element={<RefundPolicy />} />
                    <Route path="/legal/cookie-policy" element={<CookiePolicy />} />
                    <Route path="/order-tracking" element={<OrderTracking />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/order-issue" element={<OrderIssue />} />

                    {/* Protected Routes - Require Authentication */}
                    <Route
                      path="/front-desk"
                      element={
                        <ProtectedRoute requiredRole={['baker', 'owner']}>
                          <LazyBoundary source="inner-suspense">
                            <FrontDesk />
                          </LazyBoundary>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/owner-dashboard"
                      element={
                        <ProtectedRoute requiredRole="owner">
                          <LazyBoundary source="inner-suspense">
                            <OwnerDashboard />
                          </LazyBoundary>
                        </ProtectedRoute>
                      }
                    />

                    {/* 404 Route */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </LazyBoundary>
              </BrowserRouter>
            </TooltipProvider>
          </AuthProvider>
          </LanguageProvider>
      </QueryClientProvider>
    </ErrorBoundary>
    </HelmetProvider>
  );
};

export default App;
