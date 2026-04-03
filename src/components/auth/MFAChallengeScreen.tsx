import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';

interface MFAChallengeScreenProps {
  onVerified: () => void;
}

export const MFAChallengeScreen = ({ onVerified }: MFAChallengeScreenProps) => {
  const { t } = useLanguage();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: list enrolled factors and create a challenge
  useEffect(() => {
    const initChallenge = async () => {
      try {
        const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError || !factors) {
          toast.error(t('Error al cargar los factores de autenticación', 'Error loading authentication factors'));
          return;
        }
        const totpFactor = factors.totp[0];
        if (!totpFactor) {
          toast.error(t('No hay factores TOTP registrados', 'No TOTP factors registered'));
          return;
        }
        setFactorId(totpFactor.id);

        const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: totpFactor.id,
        });
        if (challengeError || !challengeData) {
          toast.error(t('Error al crear el desafío de autenticación', 'Error creating authentication challenge'));
          return;
        }
        setChallengeId(challengeData.id);
      } finally {
        setIsLoading(false);
      }
    };
    initChallenge();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = async () => {
    if (!factorId || !challengeId || code.length !== 6) return;
    setIsVerifying(true);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code,
      });
      if (error) {
        toast.error(t('Código inválido, intenta de nuevo', 'Invalid code, try again'));
        setCode('');
        return;
      }
      await supabase.auth.refreshSession();
      onVerified();
    } catch {
      toast.error(t('Error al verificar el código', 'Error verifying code'));
      setCode('');
    } finally {
      setIsVerifying(false);
    }
  };

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (code.length === 6 && !isVerifying && challengeId) {
      handleVerify();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#C6A649] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <div className="h-14 w-14 bg-[#C6A649]/10 rounded-full flex items-center justify-center">
              <ShieldCheck className="h-8 w-8 text-[#C6A649]" />
            </div>
          </div>
          <CardTitle className="text-xl font-bold text-[#1A1A2E]">
            {t('Verificación en dos pasos', 'Two-Step Verification')}
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            {t(
              'Ingresa el código de tu app autenticadora',
              'Enter the code from your authenticator app'
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex justify-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={setCode}
              disabled={isVerifying || !challengeId}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          <p className="text-xs text-gray-400 text-center">
            {t(
              'El código se enviará automáticamente al ingresar 6 dígitos',
              'Code submits automatically when 6 digits are entered'
            )}
          </p>

          <Button
            className="w-full bg-[#C6A649] hover:bg-[#b0933f] text-white"
            onClick={handleVerify}
            disabled={code.length !== 6 || isVerifying || !factorId || !challengeId}
          >
            {isVerifying
              ? t('Verificando...', 'Verifying...')
              : t('Verificar', 'Verify')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
