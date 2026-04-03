/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { CameraCapture } from '@/components/mobile/CameraCapture';
import { Upload, X, Camera, Loader2, Sparkles, Star } from 'lucide-react';

// FloatingInput helper — co-located here, imported by ContactStep
export const FloatingInput = ({ label, value, onChange, type = "text", placeholder, icon: Icon, maxLength, className }: any) => {
  const [focused, setFocused] = useState(false);

  return (
    <div className={`relative group ${className}`}>
      <div className={`absolute inset-0 bg-[#C6A649]/10 rounded-2xl transition-all duration-300 pointer-events-none ${focused ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} />
      <div className={`relative bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 group-hover:border-[#C6A649]/30 ${focused ? 'ring-[3px] ring-[#C6A649]/40 border-[#C6A649]/50' : ''}`}>
        <label className={`absolute left-10 transition-all duration-200 pointer-events-none ${focused || value ? 'top-2 text-[10px] text-[#C6A649] font-black tracking-widest uppercase' : 'top-4 text-sm text-gray-400 font-medium'}`}>
          {label}
        </label>
        {Icon && (
          <div className={`absolute left-3 top-4 transition-colors duration-300 ${focused ? 'text-[#C6A649]' : 'text-gray-500'}`}>
            <Icon size={18} />
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={maxLength}
          className="w-full bg-transparent p-4 pl-10 pt-5 text-white font-bold placeholder-transparent focus:outline-none min-h-[60px]"
          placeholder={placeholder}
        />
      </div>
    </div>
  );
};

interface DetailsStepProps {
  theme: string;
  dedication: string;
  imagePreviewUrl: string | null;
  isUploadingImage: boolean;
  isMobile: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onThemeChange: (theme: string) => void;
  onDedicationChange: (dedication: string) => void;
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (e: React.MouseEvent) => void;
  onCameraCapture: (imageDataUrl: string) => void;
  showCamera: boolean;
  onShowCameraChange: (show: boolean) => void;
}

export function getDetailsSummary(theme: string, uploadedImageUrl: string | null, t: any): string | null {
  if (!theme && !uploadedImageUrl) return null;
  const parts: string[] = [];
  if (theme) parts.push(theme.slice(0, 20) + (theme.length > 20 ? '\u2026' : ''));
  if (uploadedImageUrl) parts.push(t('Foto', 'Photo') + ' \u2713');
  return parts.join(' • ') || null;
}

export function validateDetailsStep(): string | null {
  return null; // All details are optional
}

const DetailsStep = ({
  theme,
  dedication,
  imagePreviewUrl,
  isUploadingImage,
  isMobile,
  fileInputRef,
  onThemeChange,
  onDedicationChange,
  onImageChange,
  onRemoveImage,
  onCameraCapture,
  showCamera,
  onShowCameraChange,
}: DetailsStepProps) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <FloatingInput
        label={t('Tema', 'Theme')}
        value={theme}
        onChange={(e: any) => onThemeChange(e.target.value)}
        icon={Sparkles}
        placeholder="e.g. Birthday, Wedding..."
      />
      <FloatingInput
        label={t('Dedicatoria', 'Message')}
        value={dedication}
        onChange={(e: any) => onDedicationChange(e.target.value)}
        icon={Star}
        placeholder="e.g. Happy Birthday!"
      />

      <div className="pt-2">
        <label className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] mb-4 block opacity-70">
          {t('Notas de Decoración', 'Decoration Notes')}
        </label>
        <textarea
          value={theme}
          onChange={(e) => onThemeChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 focus:border-[#C6A649]/50 hover:bg-white/10 transition-all rounded-2xl p-4 text-white font-medium outline-none min-h-[100px] text-sm"
          placeholder={t('Describe tu visión... (colores, estilo, personajes)', 'Describe your vision... (colors, style, characters)')}
        />
      </div>

      {/* Photo Upload */}
      <div className="relative mt-8">
        {!imagePreviewUrl ? (
          <div className="grid grid-cols-2 gap-4">
            {isMobile && (
              <button
                onClick={() => onShowCameraChange(true)}
                className="bg-white/5 border-2 border-dashed border-white/10 rounded-[2rem] p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-white/10 hover:border-[#C6A649]/50 transition-all duration-500 group/btn"
              >
                <div className="w-16 h-16 rounded-2xl bg-[#C6A649]/10 border border-[#C6A649]/20 text-[#C6A649] flex items-center justify-center group-hover/btn:scale-110 group-hover/btn:bg-[#C6A649] group-hover/btn:text-black transition-all">
                  <Camera size={32} />
                </div>
                <span className="text-xs font-black text-gray-400 group-hover/btn:text-white uppercase tracking-[0.2em]">
                  {t('Cámara', 'Camera')}
                </span>
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`bg-white/5 border-2 border-dashed border-white/10 rounded-[2rem] p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-white/10 hover:border-[#C6A649]/50 transition-all duration-500 group/btn ${
                !isMobile ? 'col-span-2' : ''
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 text-gray-500 flex items-center justify-center group-hover/btn:scale-110 group-hover/btn:border-[#C6A649]/30 group-hover/btn:text-[#C6A649] transition-all">
                <Upload size={32} />
              </div>
              <div className="text-center">
                <span className="text-xs font-black text-gray-400 group-hover/btn:text-white uppercase tracking-[0.2em] block mb-1">
                  {t('Subir Foto', 'Upload')}
                </span>
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">JPG, PNG, WEBP</span>
              </div>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={onImageChange} className="hidden" />
          </div>
        ) : (
          <div className="relative rounded-[2rem] overflow-hidden shadow-2xl group h-64 border border-white/10">
            <img src={imagePreviewUrl} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" alt="Preview" />
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
              <button
                onClick={onRemoveImage}
                className="bg-white/10 backdrop-blur-md p-5 rounded-full text-white hover:bg-red-500/80 transition-all scale-150 group-hover:scale-100 duration-500"
              >
                <X size={32} />
              </button>
            </div>
            {isUploadingImage && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-30">
                <Loader2 className="animate-spin text-[#C6A649]" size={48} />
              </div>
            )}
            <div className="absolute bottom-6 left-6 z-10 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
              <p className="text-xs font-black text-white uppercase tracking-widest">{t('Referencia Visual', 'Visual Reference')}</p>
            </div>
          </div>
        )}
      </div>

      {showCamera && (
        <CameraCapture
          onCapture={(file) => {
            const fake = { target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;
            onImageChange(fake);
            onShowCameraChange(false);
          }}
          onCancel={() => onShowCameraChange(false)}
        />
      )}
    </div>
  );
};

export default DetailsStep;
