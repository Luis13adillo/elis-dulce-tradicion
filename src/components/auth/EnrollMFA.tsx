import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ShieldCheck, Smartphone } from 'lucide-react';

interface EnrollMFAProps {
  onEnrolled: () => void;
}

export const EnrollMFA = ({ onEnrolled }: EnrollMFAProps) => {
  const { t } = useLanguage();

  // Primary factor state
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [otpUri, setOtpUri] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Second device / recovery state
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryFactorId, setRecoveryFactorId] = useState<string | null>(null);
  const [recoveryQrCode, setRecoveryQrCode] = useState<string | null>(null);
  const [recoveryOtpUri, setRecoveryOtpUri] = useState<string | null>(null);
  const [recoveryChallengeId, setRecoveryChallengeId] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [isEnrollingRecovery, setIsEnrollingRecovery] = useState(false);
  const [recoveryEnrolled, setRecoveryEnrolled] = useState(false);

  // On mount: enroll primary TOTP factor
  useEffect(() => {
    const enrollPrimary = async () => {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error || !data) {
        toast.error(t('Error al iniciar la configuración de 2FA', 'Error starting 2FA setup'));
        return;
      }
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setOtpUri(data.totp.uri);

      // Immediately create a challenge so the user can verify right away
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: data.id });
      if (challengeError || !challengeData) {
        toast.error(t('Error al crear el desafío de 2FA', 'Error creating 2FA challenge'));
        return;
      }
      setChallengeId(challengeData.id);
    };
    enrollPrimary();
  }, [t]);

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
        toast.error(t('Código inválido. Intenta de nuevo.', 'Invalid code. Try again.'));
        setCode('');
        return;
      }
      await supabase.auth.refreshSession();
      toast.success(t('Autenticación de dos factores activada', 'Two-factor authentication enabled'));
      onEnrolled();
    } catch {
      toast.error(t('Error al verificar el código', 'Error verifying code'));
    } finally {
      setIsVerifying(false);
    }
  };

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (code.length === 6 && !isVerifying) {
      handleVerify();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleEnrollRecovery = async () => {
    setIsEnrollingRecovery(true);
    try {
      // Supabase does not support backup codes — enrolling a second TOTP factor on a
      // different device is the documented recovery mechanism.
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error || !data) {
        toast.error(t('Error al configurar dispositivo de respaldo', 'Error setting up recovery device'));
        return;
      }
      setRecoveryFactorId(data.id);
      setRecoveryQrCode(data.totp.qr_code);
      setRecoveryOtpUri(data.totp.uri);

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: data.id });
      if (challengeError || !challengeData) {
        toast.error(t('Error al crear desafío de recuperación', 'Error creating recovery challenge'));
        return;
      }
      setRecoveryChallengeId(challengeData.id);
      setShowRecovery(true);
    } finally {
      setIsEnrollingRecovery(false);
    }
  };

  const handleVerifyRecovery = async () => {
    if (!recoveryFactorId || !recoveryChallengeId || recoveryCode.length !== 6) return;
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId: recoveryFactorId,
        challengeId: recoveryChallengeId,
        code: recoveryCode,
      });
      if (error) {
        toast.error(t('Código de recuperación inválido. Intenta de nuevo.', 'Invalid recovery code. Try again.'));
        setRecoveryCode('');
        return;
      }
      await supabase.auth.refreshSession();
      setRecoveryEnrolled(true);
      toast.success(t('Dispositivo de respaldo configurado', 'Recovery device enrolled'));
    } catch {
      toast.error(t('Error al verificar el código de recuperación', 'Error verifying recovery code'));
    }
  };

  // Auto-submit recovery code when 6 digits entered
  useEffect(() => {
    if (recoveryCode.length === 6 && showRecovery && !recoveryEnrolled) {
      handleVerifyRecovery();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoveryCode]);

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Card>
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-3">
              <div className="h-14 w-14 bg-[#C6A649]/10 rounded-full flex items-center justify-center">
                <ShieldCheck className="h-8 w-8 text-[#C6A649]" />
              </div>
            </div>
            <CardTitle className="text-xl font-bold text-[#1A1A2E]">
              {t('Configurar autenticación de dos factores', 'Set Up Two-Factor Authentication')}
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              {t(
                'Escanea el código QR con tu app autenticadora (Google Authenticator, Authy, etc.)',
                'Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)'
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* QR Code */}
            {qrCode && (
              <div className="flex flex-col items-center gap-3">
                <img
                  src={`data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`}
                  alt={t('Escanear con app autenticadora', 'Scan with authenticator app')}
                  className="w-48 h-48 border border-gray-200 rounded-lg p-2 bg-white"
                />
                {otpUri && (
                  <details className="w-full">
                    <summary className="text-xs text-gray-400 cursor-pointer text-center hover:text-gray-600">
                      {t('Entrada manual', 'Manual entry')}
                    </summary>
                    <p className="mt-2 text-xs text-gray-500 break-all bg-gray-50 rounded p-2 font-mono">
                      {otpUri}
                    </p>
                  </details>
                )}
              </div>
            )}

            {/* OTP Input */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 text-center">
                {t('Ingresa el código de 6 dígitos de tu app', 'Enter the 6-digit code from your app')}
              </p>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={setCode}
                  disabled={isVerifying}
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <Button
              className="w-full bg-[#C6A649] hover:bg-[#b0933f] text-white"
              onClick={handleVerify}
              disabled={code.length !== 6 || isVerifying || !factorId || !challengeId}
            >
              {isVerifying
                ? t('Verificando...', 'Verifying...')
                : t('Activar 2FA', 'Enable 2FA')}
            </Button>
          </CardContent>
        </Card>

        {/* Recovery section */}
        <Card className="border-dashed border-amber-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-base text-amber-800">
                {t('Acceso de recuperación', 'Recovery Access')}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-amber-700">
              {t(
                'Para acceso de recuperación, configura un segundo dispositivo autenticador. Nota: Supabase no admite códigos de respaldo — un segundo factor TOTP en otro dispositivo es el mecanismo de recuperación documentado.',
                'For recovery access, enroll a second authenticator app on a different device. Note: Supabase does not support backup codes — a second TOTP factor on another device is the documented recovery mechanism.'
              )}
            </p>

            {!showRecovery && !recoveryEnrolled && (
              <Button
                variant="outline"
                className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={handleEnrollRecovery}
                disabled={isEnrollingRecovery}
              >
                {isEnrollingRecovery
                  ? t('Configurando...', 'Setting up...')
                  : t('Agregar segundo dispositivo', 'Enroll Second Device')}
              </Button>
            )}

            {showRecovery && !recoveryEnrolled && recoveryQrCode && (
              <div className="space-y-3">
                <div className="flex flex-col items-center gap-2">
                  <img
                    src={`data:image/svg+xml;utf-8,${encodeURIComponent(recoveryQrCode)}`}
                    alt={t('QR de recuperación', 'Recovery QR')}
                    className="w-40 h-40 border border-amber-200 rounded-lg p-2 bg-white"
                  />
                  {recoveryOtpUri && (
                    <details className="w-full">
                      <summary className="text-xs text-gray-400 cursor-pointer text-center hover:text-gray-600">
                        {t('Entrada manual', 'Manual entry')}
                      </summary>
                      <p className="mt-2 text-xs text-gray-500 break-all bg-gray-50 rounded p-2 font-mono">
                        {recoveryOtpUri}
                      </p>
                    </details>
                  )}
                </div>
                <p className="text-sm text-gray-600 text-center">
                  {t(
                    'Ingresa el código de tu app de respaldo',
                    'Enter the code from your backup app'
                  )}
                </p>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={recoveryCode}
                    onChange={setRecoveryCode}
                  >
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button
                  variant="outline"
                  className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={handleVerifyRecovery}
                  disabled={recoveryCode.length !== 6}
                >
                  {t('Confirmar dispositivo de respaldo', 'Confirm Recovery Device')}
                </Button>
              </div>
            )}

            {recoveryEnrolled && (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3">
                <ShieldCheck className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm font-medium">
                  {t('Dispositivo de respaldo configurado', 'Recovery device enrolled')}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
