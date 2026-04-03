import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { HelmetProvider } from "react-helmet-async";
import ScrollToTop from "@/components/ScrollToTop";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "next-themes";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { initServiceWorker } from "@/lib/pwa";
import ErrorBoundary from "@/components/ErrorBoundary";

// Lazy load pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const Order = lazy(() => import("./pages/Order"));
const PaymentCheckout = lazy(() => import("./pages/PaymentCheckout"));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation"));
const FrontDesk = lazy(() => import("./pages/FrontDesk"));
const OwnerDashboard = lazy(() => import("./pages/OwnerDashboard"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const Gallery = lazy(() => import("./pages/Gallery"));
const Menu = lazy(() => import("./pages/Menu"));
const FAQ = lazy(() => import("./pages/FAQ"));
const OrderTracking = lazy(() => import("./pages/OrderTracking"));
const About = lazy(() => import("./pages/About"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const TermsOfService = lazy(() => import("./pages/Legal/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/Legal/PrivacyPolicy"));
const Contact = lazy(() => import("./pages/Contact"));
const OrderIssue = lazy(() => import("./pages/OrderIssue"));
const RefundPolicy = lazy(() => import("./pages/Legal/RefundPolicy"));
const CookiePolicy = lazy(() => import("./pages/Legal/CookiePolicy"));
const NotFound = lazy(() => import("./pages/NotFound"));

import { useWebsiteTracker } from "@/hooks/useWebsiteTracker";

// Tracker component to use inside Router
const Tracker = () => {
  useWebsiteTracker();
  return null;
};

// Loading component
const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const App = () => {
  // Initialize PWA service worker
  useEffect(() => {
    initServiceWorker();
  }, []);

  return (
    <HelmetProvider>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
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
                <Suspense fallback={<PageLoader />}>
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
                          <Suspense fallback={<PageLoader />}>
                            <FrontDesk />
                          </Suspense>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/owner-dashboard"
                      element={
                        <ProtectedRoute requiredRole="owner">
                          <Suspense fallback={<PageLoader />}>
                            <OwnerDashboard />
                          </Suspense>
                        </ProtectedRoute>
                      }
                    />

                    {/* 404 Route */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </TooltipProvider>
          </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
    </HelmetProvider>
  );
};

export default App;
