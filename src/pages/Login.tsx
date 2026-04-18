import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, Lock, AlertCircle, Store } from 'lucide-react';
import { FullScreenLoader } from '@/components/FullScreenLoader';
// Fixed import pointing to the correct logo location
import TransparentLogo from '../assets/brand/logo.png';

const Login = () => {
  const { t } = useLanguage();
  const { signIn, user, isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const message = location.state?.message;
  const sessionExpired = location.state?.sessionExpired;

  // Show session expired toast when redirected from auto-logout
  useEffect(() => {
    if (sessionExpired) {
      toast.info(t('Tu sesión expiró por inactividad', 'Your session expired due to inactivity'));
    }
  }, [sessionExpired]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-redirect authenticated users to their dashboard
  useEffect(() => {
    if (user && !isLoading) {
      // Check role and redirect accordingly
      const role = user.profile?.role;

      if (role === 'owner') {
        navigate('/owner-dashboard', { replace: true });
      } else if (role === 'baker') {
        navigate('/front-desk', { replace: true });
      } else if (role) {
        // Only redirect to home if we have a known role that's not owner/baker
        navigate('/', { replace: true });
      }
      // If role is undefined, do nothing — wait for profile to load
    }
  }, [user, isLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null); // Clear any previous errors

    // Clear any previous scheduled redirects from useEffect if possible (not easily done without refs)
    // Instead we trust signIn to return the authoritative result.

    try {
      const { success, error: signInError, role } = await signIn(formData.email, formData.password);

      if (success) {
        // Explicit redirect based on returned role
        if (role === 'owner') {
          navigate('/owner-dashboard', { replace: true });
        } else if (role === 'baker') {
          navigate('/front-desk', { replace: true });
        } else if (role) {
          // Default fallback for other roles (e.g. driver)
          navigate('/', { replace: true });
        }
        // If role is undefined (timeout or error), don't redirect
      } else {
        setError(signInError || t('Error al iniciar sesión', 'Error signing in'));
      }
    } catch (err) {
      setError(t('Ocurrió un error inesperado', 'An unexpected error occurred'));
    } finally {
      setIsSubmitting(false);
    }
  };



  // Optimize: Early return for authenticated users to prevent form rendering
  // This prevents the "flash" of the login form before redirection.
  // Uses FullScreenLoader (light bg + escape hatch) instead of a hardcoded
  // bg-black block — the dark style was trapping users who landed here via
  // a ProtectedRoute redirect after getUserProfile timed out (profile=null).
  if (isAuthenticated && user && !isLoading) return <FullScreenLoader />;
  if (isLoading) return <FullScreenLoader />;

  return (
    <div className="min-h-screen w-full bg-black text-white flex items-center justify-center relative overflow-hidden px-4 selection:bg-[#C6A649]/30">
      {/* Performance Optimization: Replaced heavy blur filters with radial gradients */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(198, 166, 73, 0.08) 0%, rgba(0, 0, 0, 0) 70%)'
        }}
      />
      <div
        className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(245, 158, 11, 0.08) 0%, rgba(0, 0, 0, 0) 70%)'
        }}
      />

      <Link to="/" className="absolute top-8 left-8 flex items-center gap-2 text-white/40 hover:text-[#C6A649] transition-all z-20 group">
        <Store className="h-5 w-5 group-hover:scale-110 transition-transform" />
        <span className="text-sm font-black uppercase tracking-widest">{t('Volver al Inicio', 'Back to Home')}</span>
      </Link>

      <Card className="w-full max-w-md border-white/10 bg-white/5 backdrop-blur-3xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] relative z-10 transition-all duration-500 rounded-[2.5rem] overflow-hidden">
        <CardHeader className="space-y-2 text-center pb-6 pt-12 px-8">
          <div className="flex justify-center mb-10 group">
            <div className="relative">
              <div className="absolute -inset-4 bg-[#C6A649]/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              <img src={TransparentLogo} alt="Eli's Logo" className="h-24 object-contain drop-shadow-2xl relative z-10 transition-transform duration-700 group-hover:scale-110" />
            </div>
          </div>
          <span className="text-xs font-black tracking-[0.4em] text-[#C6A649] uppercase block mb-2">{t('Dulce Tradición', 'Sweet Tradition')}</span>
          <CardTitle className="text-4xl font-black text-white uppercase tracking-tighter leading-none">
            {t('Bienvenido', 'Welcome Back')}
          </CardTitle>
          <CardDescription className="text-gray-400 text-lg font-light italic font-serif">
            {t(
              'Ingresa a tu cuenta para administrar',
              'Access your dashboard to manage'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 px-10 pb-12">
          <form onSubmit={handleSubmit} className="space-y-6">
            {message && (
              <Alert className="bg-[#C6A649]/10 border-[#C6A649]/30 text-[#C6A649] rounded-2xl">
                <AlertDescription className="font-bold uppercase tracking-wide text-xs">{message}</AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive" className="bg-red-500/10 border-red-500/30 text-red-200 rounded-2xl">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="font-bold uppercase tracking-wide text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-black uppercase tracking-widest text-gray-500 ml-4">
                  {t('Email', 'Email Address')}
                </Label>
                <div className="relative group">
                  <div className="absolute inset-0 bg-[#C6A649]/5 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                  <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500 group-focus-within:text-[#C6A649] transition-colors z-10" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('ejemplo@email.com', 'example@email.com')}
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="pl-12 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#C6A649]/50 focus:ring-[#C6A649]/20 transition-all h-14 rounded-2xl font-bold"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between ml-4">
                  <Label htmlFor="password" className="text-xs font-black uppercase tracking-widest text-gray-500">
                    {t('Contraseña', 'Password')}
                  </Label>
                  <Link
                    to="/forgot-password"
                    className="text-[10px] font-black uppercase tracking-widest text-[#C6A649] hover:text-white transition-colors"
                  >
                    {t('¿Olvidaste tu contraseña?', 'Forgot?')}
                  </Link>
                </div>
                <div className="relative group">
                  <div className="absolute inset-0 bg-[#C6A649]/5 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500 group-focus-within:text-[#C6A649] transition-colors z-10" />
                  <Input
                    id="password"
                    type="password"
                    placeholder={t('Ingresa tu contraseña', 'Enter your password')}
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    className="pl-12 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#C6A649]/50 focus:ring-[#C6A649]/20 transition-all h-14 rounded-2xl font-bold"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#C6A649] text-black hover:bg-white font-black uppercase tracking-widest h-14 text-base shadow-[0_10px_30px_rgba(198,166,73,0.3)] hover:shadow-[0_15px_40px_rgba(198,166,73,0.4)] transition-all rounded-2xl hover:scale-105"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                  {t('Iniciando sesión...', 'Signing in...')}
                </>
              ) : (
                t('Iniciar Sesión', 'Authorize & Sign In')
              )}
            </Button>

            <div className="text-center text-xs font-bold uppercase tracking-widest text-gray-500">
              {t('¿No tienes una cuenta?', "Don't have an account?")}{' '}
              <Link
                to="/signup"
                className="text-[#C6A649] hover:text-white transition-colors"
              >
                {t('Regístrate', 'Create Account')}
              </Link>
            </div>
          </form>


        </CardContent>
      </Card>

      <div className="absolute bottom-8 w-full text-center text-white/10 text-[10px] font-black tracking-[0.5em] uppercase pointer-events-none">
        Eli's Dulce Tradición • Est. 2024 • Admin Portal
      </div>
    </div>
  );
};

export default Login;
