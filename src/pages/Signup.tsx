import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, Lock, User, Phone, AlertCircle, Store } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return 'La contraseña debe tener al menos 8 caracteres / Password must be at least 8 characters';
  }
  if (!/[A-Z]/.test(password)) {
    return 'La contraseña debe contener al menos una letra mayúscula / Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'La contraseña debe contener al menos una letra minúscula / Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'La contraseña debe contener al menos un número / Password must contain at least one number';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'La contraseña debe contener al menos un carácter especial / Password must contain at least one special character';
  }
  return null;
}

const Signup = () => {
  const { t } = useLanguage();
  const { signUp, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [formData, setFormData] = useState({
    email: searchParams.get('email') || '',
    password: '',
    confirmPassword: '',
    fullName: '',
    phone: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (isAuthenticated) {
    navigate('/');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.email || !formData.password || !formData.fullName) {
      setError(t('Por favor complete todos los campos requeridos', 'Please fill in all required fields'));
      return;
    }

    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError(t('Las contraseñas no coinciden', 'Passwords do not match'));
      return;
    }

    setIsLoading(true);

    try {
      const result = await signUp(
        formData.email,
        formData.password,
        formData.fullName,
        formData.phone || undefined
      );

      if (result.success) {
        navigate('/login', { state: { message: t('¡Cuenta creada! Por favor inicia sesión.', 'Account created! Please sign in.') } });
      } else {
        setError(result.error || t('Error al crear la cuenta', 'Error creating account'));
      }
    } catch (err) {
      setError(t('Ocurrió un error inesperado', 'An unexpected error occurred'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-black text-white flex items-center justify-center relative overflow-hidden px-4 py-20 selection:bg-[#C6A649]/30">
      {/* Background Elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-[#C6A649]/5 rounded-full blur-[180px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-20%] h-[600px] w-[600px] rounded-full bg-amber-500/5 blur-[120px] pointer-events-none" />

      <Link to="/" className="absolute top-8 left-8 flex items-center gap-2 text-white/40 hover:text-[#C6A649] transition-all z-20 group">
        <Store className="h-5 w-5 group-hover:scale-110 transition-transform" />
        <span className="text-sm font-black uppercase tracking-widest">{t('Volver al Inicio', 'Back to Home')}</span>
      </Link>

      <Card className="w-full max-w-lg border-white/10 bg-white/5 backdrop-blur-3xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] relative z-10 transition-all duration-500 rounded-[2.5rem] overflow-hidden">
        <CardHeader className="space-y-4 text-center pb-8 pt-12">
          <span className="text-xs font-black tracking-[0.4em] text-[#C6A649] uppercase block mb-2">{t('Dulce Tradición', 'Sweet Tradition')}</span>
          <CardTitle className="text-4xl font-black text-white uppercase tracking-tighter leading-none">
            {t('Crear Cuenta', 'Join the Tradition')}
          </CardTitle>
          <CardDescription className="text-gray-400 text-lg font-light italic font-serif">
            {t(
              'Regístrate para hacer pedidos personalizados',
              'Sign up to place custom orders'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-10 pb-12">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive" className="bg-red-500/10 border-red-500/30 text-red-200 rounded-2xl">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="font-bold uppercase tracking-wide text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-xs font-black uppercase tracking-widest text-gray-500 ml-4">
                  {t('Nombre Completo', 'Full Name')}
                </Label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500 group-focus-within:text-[#C6A649] transition-colors z-10" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder={t('Juan Pérez', 'John Doe')}
                    value={formData.fullName}
                    onChange={(e) =>
                      setFormData({ ...formData, fullName: e.target.value })
                    }
                    className="pl-12 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#C6A649]/50 focus:ring-[#C6A649]/20 transition-all h-14 rounded-2xl font-bold"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs font-black uppercase tracking-widest text-gray-500 ml-4">
                  {t('Teléfono', 'Phone')} <span className="text-[10px] opacity-40">({t('Opcional', 'Opt')})</span>
                </Label>
                <div className="relative group">
                  <Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500 group-focus-within:text-[#C6A649] transition-colors z-10" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    className="pl-12 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#C6A649]/50 focus:ring-[#C6A649]/20 transition-all h-14 rounded-2xl font-bold"
                  />
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="email" className="text-xs font-black uppercase tracking-widest text-gray-500 ml-4">
                  {t('Email', 'Email Address')}
                </Label>
                <div className="relative group">
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
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-black uppercase tracking-widest text-gray-500 ml-4">
                  {t('Contraseña', 'Password')}
                </Label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500 group-focus-within:text-[#C6A649] transition-colors z-10" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    className="pl-12 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#C6A649]/50 focus:ring-[#C6A649]/20 transition-all h-14 rounded-2xl font-bold"
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-xs font-black uppercase tracking-widest text-gray-500 ml-4">
                  {t('Confirmar', 'Confirm')}
                </Label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500 group-focus-within:text-[#C6A649] transition-colors z-10" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      setFormData({ ...formData, confirmPassword: e.target.value })
                    }
                    className="pl-12 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#C6A649]/50 focus:ring-[#C6A649]/20 transition-all h-14 rounded-2xl font-bold"
                    required
                    minLength={8}
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#C6A649] text-black hover:bg-white font-black uppercase tracking-widest h-16 text-base shadow-[0_10px_30px_rgba(198,166,73,0.3)] hover:shadow-[0_15px_40px_rgba(198,166,73,0.4)] transition-all rounded-2xl hover:scale-[1.02] mt-4"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                  {t('Procesando...', 'Processing...')}
                </>
              ) : (
                t('Crear Cuenta', 'Join the Family')
              )}
            </Button>

            <div className="text-center text-xs font-bold uppercase tracking-widest text-gray-500">
              {t('¿Ya tienes una cuenta?', 'Already have an account?')}{' '}
              <Link
                to="/login"
                className="text-[#C6A649] hover:text-white transition-colors"
              >
                {t('Iniciar Sesión', 'Sign In')}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="absolute bottom-10 w-full text-center text-white/10 text-[10px] font-black tracking-[0.5em] uppercase pointer-events-none">
        Eli's Dulce Tradición • Crafted with Passion
      </div>
    </div>
  );
};

export default Signup;

