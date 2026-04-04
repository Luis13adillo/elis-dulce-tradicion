import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, Check, AlertCircle, Upload } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onCancel?: () => void;
}

/**
 * Mobile camera capture component
 */
export const CameraCapture = ({ onCapture, onCancel }: CameraCaptureProps) => {
  const { t } = useLanguage();
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (error: unknown) {
      console.error('Error accessing camera:', error);
      const errorName = (error as { name?: string })?.name || '';
      let message: string;
      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        message = t(
          'Permiso de cámara denegado. Permite el acceso en los ajustes del navegador.',
          'Camera permission denied. Allow access in your browser settings.'
        );
      } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
        message = t('No se encontró cámara en este dispositivo.', 'No camera found on this device.');
      } else if (errorName === 'NotReadableError') {
        message = t('La cámara está siendo usada por otra aplicación.', 'Camera is in use by another app.');
      } else {
        message = t('No se pudo acceder a la cámara.', 'Could not access camera.');
      }
      setCameraError(message);
    }
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `photo-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        setCapturedFile(file);
        setPreview(URL.createObjectURL(blob));
        stopCamera();
      }
    }, 'image/jpeg', 0.9);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleConfirm = () => {
    if (capturedFile) {
      onCapture(capturedFile);
    }
  };

  const handleCancel = () => {
    stopCamera();
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setPreview(null);
    setCapturedFile(null);
    onCancel?.();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {preview ? (
        // Preview mode
        <div className="flex-1 flex flex-col">
          <img
            src={preview}
            alt="Preview"
            className="flex-1 object-contain"
          />
          <div className="flex gap-4 p-4 bg-background">
            <Button
              onClick={handleCancel}
              variant="outline"
              className="flex-1"
            >
              <X className="mr-2 h-4 w-4" />
              {t('Cancelar', 'Cancel')}
            </Button>
            <Button
              onClick={handleConfirm}
              className="flex-1"
            >
              <Check className="mr-2 h-4 w-4" />
              {t('Usar Foto', 'Use Photo')}
            </Button>
          </div>
        </div>
      ) : cameraError ? (
        // Error mode
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
            <AlertCircle className="h-10 w-10 text-red-400" />
          </div>
          <div>
            <p className="text-white font-bold text-lg mb-2">
              {t('Error de Cámara', 'Camera Error')}
            </p>
            <p className="text-gray-400 text-sm leading-relaxed">{cameraError}</p>
          </div>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button
              onClick={startCamera}
              variant="outline"
              className="w-full border-white/20 text-white hover:bg-white/10"
            >
              <Camera className="mr-2 h-4 w-4" />
              {t('Intentar de nuevo', 'Try Again')}
            </Button>
            <Button
              onClick={onCancel}
              className="w-full bg-[#C6A649] hover:bg-[#b8963e] text-black font-bold"
            >
              <Upload className="mr-2 h-4 w-4" />
              {t('Usar Archivo en su Lugar', 'Use File Upload Instead')}
            </Button>
          </div>
        </div>
      ) : (
        // Camera mode
        <div className="flex-1 flex flex-col">
          <video
            ref={videoRef}
            className="flex-1 object-cover"
            autoPlay
            playsInline
            muted
          />
          <div className="flex gap-4 p-4 bg-background">
            <Button
              onClick={handleCancel}
              variant="outline"
              className="flex-1"
            >
              <X className="mr-2 h-4 w-4" />
              {t('Cancelar', 'Cancel')}
            </Button>
            <Button
              onClick={capturePhoto}
              className="flex-1"
            >
              <Camera className="mr-2 h-4 w-4" />
              {t('Capturar', 'Capture')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
