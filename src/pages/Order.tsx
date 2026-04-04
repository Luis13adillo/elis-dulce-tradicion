/* eslint-disable @typescript-eslint/no-explicit-any */
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import logoImage from '@/assets/brand/logo.png';
import { useState, useRef, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { uploadReferenceImage } from '@/lib/storage';
import { isValidImageType, isValidFileSize, compressImage } from '@/lib/imageCompression';
import { useOptimizedPricing } from '@/lib/hooks/useOptimizedPricing';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { formatPrice } from '@/lib/pricing';
import { motion, AnimatePresence } from 'framer-motion';
import LanguageToggle from '@/components/LanguageToggle';
import { useBusinessHours } from '@/lib/hooks/useCMS';
import { api } from '@/lib/api';
import type { OrderFormOptions } from '@/lib/api/modules/orderOptions';
import { cn } from '@/lib/utils';

// Step components
import DateTimeStep, { validateDateTimeStep, getDateTimeSummary } from '@/components/order/steps/DateTimeStep';
import SizeStep, { validateSizeStep, getSizeSummary } from '@/components/order/steps/SizeStep';
import FlavorStep, { validateFlavorStep, getFlavorSummary } from '@/components/order/steps/FlavorStep';
import DetailsStep, { validateDetailsStep, getDetailsSummary } from '@/components/order/steps/DetailsStep';
import ContactStep, { validateContactStep, getContactSummary } from '@/components/order/steps/ContactStep';
import {
  FALLBACK_CAKE_SIZES,
  FALLBACK_BREAD_TYPES,
  FALLBACK_FILLINGS,
  FALLBACK_PREMIUM_FILLING_OPTIONS,
} from '@/components/order/steps/orderStepConstants';

const STORAGE_KEY = 'bakery_order_draft';

// --- ANIMATION VARIANTS ---
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 50 : -50,
    opacity: 0,
    position: 'absolute' as const,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
    position: 'relative' as const,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 50 : -50,
    opacity: 0,
    position: 'absolute' as const,
  })
};

// --- MAIN COMPONENT ---
const Order = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isSpanish = language === 'es';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic time slots from business hours
  const { data: businessHours } = useBusinessHours();

  const FALLBACK_TIME_OPTIONS = [
    '10:00', '11:00', '12:00', '13:00', '14:00',
    '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
  ];

  // Steps definition
  const STEPS = [
    { id: 'date', title: t('Fecha', 'Date'), subtitle: t('¿Cuándo lo necesitas?', 'When needed?') },
    { id: 'size', title: t('Tamaño', 'Size'), subtitle: t('¿Para cuántas personas?', 'How many people?') },
    { id: 'flavor', title: t('Sabor', 'Flavor'), subtitle: t('Pan y Relleno', 'Bread & Filling') },
    { id: 'details', title: t('Detalles', 'Details'), subtitle: t('Personalización', 'Customization') },
    { id: 'info', title: t('Contacto', 'Contact'), subtitle: t('Tus datos', 'Your info') },
  ];

  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);

  const [formData, setFormData] = useState({
    dateNeeded: '',
    timeNeeded: '',
    customerName: '',
    phone: '',
    email: '',
    pickupType: 'pickup',
    cakeSize: '',
    breadType: 'tres-leches',
    filling: '',
    theme: '',
    dedication: '',
    deliveryAddress: '',
  });

  const [selectedFillings, setSelectedFillings] = useState<string[]>([]);
  const [premiumFillingSizes, setPremiumFillingSizes] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState(0);

  // DB-driven order form options (with fallback to hardcoded arrays)
  const [orderOptions, setOrderOptions] = useState<OrderFormOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);

  // Derive available time slots for the selected date from business hours
  const timeOptions = useMemo(() => {
    if (!businessHours || !Array.isArray(businessHours) || businessHours.length === 0) {
      return FALLBACK_TIME_OPTIONS;
    }
    const selectedDate = formData.dateNeeded ? new Date(formData.dateNeeded + 'T12:00:00') : null;
    if (!selectedDate) return FALLBACK_TIME_OPTIONS;

    const dayOfWeek = selectedDate.getDay(); // 0 = Sunday, 6 = Saturday
    const dayHours = businessHours.find((h: any) => h.day_of_week === dayOfWeek);
    if (!dayHours || dayHours.is_closed || !dayHours.open_time || !dayHours.close_time) {
      return FALLBACK_TIME_OPTIONS;
    }

    const openHour = parseInt(dayHours.open_time.split(':')[0], 10);
    const closeHour = parseInt(dayHours.close_time.split(':')[0], 10);
    const slots: string[] = [];
    for (let h = openHour; h <= closeHour; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`);
    }
    return slots.length > 0 ? slots : FALLBACK_TIME_OPTIONS;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessHours, formData.dateNeeded]);

  // --- LOGIC HOOKS ---
  useEffect(() => {
    if (user && user.profile) {
      setFormData(prev => ({
        ...prev,
        customerName: user.profile.full_name || prev.customerName,
        email: user.email || prev.email,
        phone: user.profile.phone || prev.phone,
      }));
    }
  }, [user]);

  // Load draft with expiration
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);

        // Check if draft is older than 30 minutes
        const now = Date.now();
        const draftTime = parsed._timestamp || 0;
        const thirtyMinutes = 30 * 60 * 1000;

        if (now - draftTime > thirtyMinutes) {
          // Draft expired, clear it
          localStorage.removeItem(STORAGE_KEY);
          return;
        }

        // Restore valid draft
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _timestamp, ...rest } = parsed; // Remove timestamp from form data
        setFormData(prev => ({ ...prev, ...rest }));
        if (parsed.selectedFillings) setSelectedFillings(parsed.selectedFillings);
      } catch (e) {
        console.error('Error loading draft:', e);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Save draft with timestamp
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only save if we have some data
      if (formData.cakeSize || formData.dateNeeded) {
        const dataToSave = {
          ...formData,
          selectedFillings,
          _timestamp: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [formData, selectedFillings]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  // Fetch order form options from DB on mount
  useEffect(() => {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 8000)
    );
    Promise.race([api.getOrderFormOptions(), timeout])
      .then((options) => {
        setOrderOptions(options as Awaited<ReturnType<typeof api.getOrderFormOptions>>);
      })
      .catch(() => {
        toast.warning(
          t('Usando opciones de menú predeterminadas', 'Using default menu options')
        );
      })
      .finally(() => {
        setOptionsLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive active arrays from DB data (or fall back to hardcoded arrays)
  const activeCakeSizes = orderOptions?.cakeSizes.map(s => ({
    value: s.value,
    label: s.label_en,
    labelEs: s.label_es,
    price: s.price,
    serves: s.serves,
    featured: s.featured,
  })) || FALLBACK_CAKE_SIZES;

  const activeBreadTypes = orderOptions?.breadTypes.map(b => ({
    value: b.value,
    label: b.label_en,
    desc: b.description,
  })) || FALLBACK_BREAD_TYPES;

  const activeFillings = orderOptions?.fillings.map(f => ({
    value: f.value,
    label: f.label_en,
    sub: f.sub_label,
    premium: f.is_premium,
  })) || FALLBACK_FILLINGS;

  const activePremiumOptions = orderOptions?.premiumUpcharges.map(u => ({
    value: u.size_value,
    label: u.label_en,
    labelEs: u.label_es,
    upcharge: u.upcharge,
  })) || FALLBACK_PREMIUM_FILLING_OPTIONS;

  const { pricingBreakdown, isLoading: isCalculatingPrice } = useOptimizedPricing({
    size: formData.cakeSize,
    filling: formData.breadType,
    theme: formData.theme || 'custom',
    deliveryOption: formData.pickupType as 'pickup' | 'delivery',
  });

  const getBasePrice = () => {
    const size = activeCakeSizes.find(s => s.value === formData.cakeSize);
    return size?.price || 0;
  };

  const getTotal = () => {
    const base = pricingBreakdown ? pricingBreakdown.total : getBasePrice();
    const premiumUpcharge = getPremiumFillingUpcharge();
    return base + premiumUpcharge + deliveryFee;
  };

  const handleFillingToggle = (filling: string) => {
    const fillingObj = activeFillings.find(f => f.value === filling);

    setSelectedFillings(prev => {
      if (prev.includes(filling)) {
        // If deselecting, also remove premium size selection
        if (fillingObj?.premium) {
          setPremiumFillingSizes(sizes => {
            const newSizes = { ...sizes };
            delete newSizes[filling];
            return newSizes;
          });
        }
        return prev.filter(f => f !== filling);
      }
      // Limit to 2 fillings max
      if (prev.length >= 2) {
        toast.error(t('Máximo 2 rellenos permitidos', 'Maximum 2 fillings allowed'));
        return prev;
      }
      return [...prev, filling];
    });
  };

  const handlePremiumSizeSet = (filling: string, sizeOption: string) => {
    setPremiumFillingSizes(prev => ({
      ...prev,
      [filling]: sizeOption
    }));
  };

  const getPremiumFillingUpcharge = () => {
    let upcharge = 0;
    for (const filling of selectedFillings) {
      const fillingObj = activeFillings.find(f => f.value === filling);
      if (fillingObj?.premium && premiumFillingSizes[filling]) {
        const sizeOption = activePremiumOptions.find(opt => opt.value === premiumFillingSizes[filling]);
        if (sizeOption) {
          upcharge += sizeOption.upcharge;
        }
      }
    }
    return upcharge;
  };

  const hasPendingPremiumSelection = () => {
    for (const filling of selectedFillings) {
      const fillingObj = activeFillings.find(f => f.value === filling);
      if (fillingObj?.premium && !premiumFillingSizes[filling]) {
        return true;
      }
    }
    return false;
  };

  const handlePhoneChange = (phone: string) => {
    const digits = phone.replace(/\D/g, '').slice(0, 10);
    let formatted = '';
    if (digits.length > 0) formatted = '(' + digits.slice(0, 3);
    if (digits.length > 3) formatted += ') ' + digits.slice(3, 6);
    if (digits.length > 6) formatted += '-' + digits.slice(6, 10);
    setFormData(prev => ({ ...prev, phone: formatted }));
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    if (!isValidImageType(file)) {
      toast.error(t('Tipo de archivo no válido. Solo JPG, PNG o WebP.', 'Invalid file type. Only JPG, PNG or WebP.'));
      return;
    }
    if (!isValidFileSize(file)) {
      toast.error(t('Archivo muy grande. Máximo 5MB.', 'File too large. Max 5MB.'));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImagePreviewUrl(previewUrl);
    setIsUploadingImage(true);

    try {
      // Compress the image before upload
      const compressedFile = await compressImage(file, {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1600,
        useWebWorker: true
      });

      const result = await uploadReferenceImage(compressedFile);
      if (result.success && result.url) {
        setUploadedImageUrl(result.url);
        toast.success(t('Imagen optimizada y subida', 'Image optimized and uploaded'));
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      const errorMsg = error instanceof Error ? error.message : 'Error uploading image';
      toast.error(errorMsg);
      setImagePreviewUrl(null);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleRemoveImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImagePreviewUrl(null);
    setUploadedImageUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddressChange = (address: string, _isValid: boolean, _placeDetails?: any, deliveryInfo?: any) => {
    setFormData(prev => ({ ...prev, deliveryAddress: address }));
    if (deliveryInfo && !deliveryInfo.serviceable) {
      setFormData(prev => ({ ...prev, pickupType: 'pickup' }));
      setDeliveryFee(0);
      toast.error(t(
        'Dirección fuera del área de entrega. Cambiado a Pickup.',
        'Address outside delivery area. Switched to Pickup.'
      ));
    } else if (deliveryInfo?.serviceable) {
      setDeliveryFee(deliveryInfo.fee || 0);
    }
  };

  // --- STEP NAVIGATION ---
  const goToStep = (index: number) => {
    if (index < currentStep) {
      setDirection(-1);
      setCurrentStep(index);
    }
  };

  // --- NAVIGATION VALIDATION (delegates to step validators) ---
  const validateStep = async (stepIndex: number): Promise<boolean> => {
    setValidationError(null);
    const stepId = STEPS[stepIndex].id;

    if (stepId === 'date') {
      const syncError = validateDateTimeStep(formData.dateNeeded, formData.timeNeeded, t);
      if (syncError) {
        setValidationError(syncError);
        return false;
      }
    }

    if (stepId === 'size') {
      const err = validateSizeStep(formData.cakeSize, t);
      if (err) { setValidationError(err); return false; }
    }

    if (stepId === 'flavor') {
      // Check pending premium selection first (requires fillings context)
      if (hasPendingPremiumSelection()) {
        setValidationError(t('Selecciona el tamaño para los rellenos premium', 'Select size for premium fillings'));
        return false;
      }
      const err = validateFlavorStep(selectedFillings, t);
      if (err) { setValidationError(err); return false; }
    }

    if (stepId === 'details') {
      const err = validateDetailsStep();
      if (err) { setValidationError(err); return false; }
    }

    if (stepId === 'info') {
      const err = validateContactStep(
        formData.customerName,
        formData.phone,
        formData.email,
        formData.pickupType,
        formData.deliveryAddress,
        consentGiven,
        t
      );
      if (err) { setValidationError(err); return false; }
    }

    return true;
  };

  const nextStep = async () => {
    const isValid = await validateStep(currentStep);
    if (isValid) {
      if (currentStep < STEPS.length - 1) {
        setDirection(1);
        setCurrentStep(c => c + 1);
      } else {
        handleSubmit();
      }
    } else {
      toast.error(validationError || t('Completa este paso', 'Complete this step'));
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep(c => c - 1);
      setValidationError(null);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const cleanPhone = formData.phone.replace(/\D/g, '');
      const selectedSize = activeCakeSizes.find(s => s.value === formData.cakeSize);

      // Build filling description with premium options
      const fillingDescriptions = selectedFillings.map(filling => {
        const fillingObj = activeFillings.find(f => f.value === filling);
        if (fillingObj?.premium && premiumFillingSizes[filling]) {
          const sizeOpt = activePremiumOptions.find(opt => opt.value === premiumFillingSizes[filling]);
          return `${fillingObj.label} (${sizeOpt?.label || premiumFillingSizes[filling]} +$${sizeOpt?.upcharge || 0})`;
        }
        return fillingObj?.label || filling;
      });

      const orderData = {
        customer_name: formData.customerName,
        customer_email: formData.email,
        customer_phone: `+1${cleanPhone}`,
        customer_language: language,
        date_needed: formData.dateNeeded,
        time_needed: formData.timeNeeded,
        cake_size: selectedSize?.label || formData.cakeSize,
        cake_size_value: formData.cakeSize,       // slug e.g. '8-round' — used for server-side price validation
        filling: fillingDescriptions.join(', ') || formData.breadType,
        filling_values: selectedFillings,          // string[] of filling slugs e.g. ['strawberry', 'tiramisu']
        theme: formData.theme || 'Custom',
        dedication: formData.dedication || '',
        reference_image_path: uploadedImageUrl || '',
        delivery_option: formData.pickupType,
        delivery_address: formData.pickupType === 'delivery' ? formData.deliveryAddress : '',
        delivery_fee: formData.pickupType === 'delivery' ? deliveryFee : 0,
        consent_given: true,
        consent_timestamp: new Date().toISOString(),
        total_amount: getTotal(),
        user_id: user?.id || null,
        premium_filling_upcharge: getPremiumFillingUpcharge(),
      };

      sessionStorage.setItem('pendingOrder', JSON.stringify(orderData));
      localStorage.removeItem(STORAGE_KEY);
      navigate('/payment-checkout');
    } catch (error: any) {
      console.error('Error preparing payment:', error);
      toast.error(t('Error del sistema', 'System error'));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen font-sans pb-32 relative bg-black flex flex-col selection:bg-[#C6A649]/30">

      {/* --- BACKGROUND ANIMATION --- */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Cinematic Premium Glows (Consistent with site-wide theme) */}
        <div className="absolute top-1/4 left-1/4 -translate-y-1/2 w-[600px] h-[600px] bg-[#C6A649]/10 rounded-full blur-[140px] pointer-events-none opacity-50" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none opacity-40" />

        <motion.div
          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_50%_50%,rgba(198,166,73,0.05),transparent_70%)]"
        />
        <motion.div
          animate={{ y: [0, -50, 0], x: [0, 30, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 right-0 w-[800px] h-[800px] bg-[radial-gradient(circle_at_50%_50%,rgba(198,166,73,0.03),transparent_60%)] filter blur-3xl opacity-40"
        />
      </div>

      {/* --- TOP BAR --- */}
      <div className="h-1.5 w-full flex sticky top-0 z-50 shadow-sm opacity-90">
        <div className="h-full w-1/3 bg-[#C6A649]"></div>
        <div className="h-full w-1/3 bg-white"></div>
        <div className="h-full w-1/3 bg-[#C6A649]"></div>
      </div>

      {/* --- HEADER --- */}
      <header className="bg-black/80 backdrop-blur-xl shadow-2xl sticky top-1.5 z-40 border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">

            {/* Left: Back & Logo */}
            <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-start">
              <button
                onClick={() => currentStep > 0 ? prevStep() : navigate('/')}
                className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-[#C6A649] hover:text-black transition-all flex-shrink-0 group shadow-lg"
              >
                <ChevronLeft size={20} strokeWidth={3} className="group-hover:-translate-x-0.5 transition-transform" />
              </button>

              <button className="cursor-pointer group hover:scale-110 transition-transform duration-500" onClick={() => navigate('/')}>
                <img src={logoImage} alt="Eli's Bakery" className="h-14 w-auto object-contain filter drop-shadow-[0_0_10px_rgba(198,166,73,0.3)]" />
              </button>

              {/* Mobile spacer to balance back button */}
              <div className="w-12 md:hidden" />
            </div>

            {/* Right: Progress & Language */}
            <div className="flex items-center gap-8 w-full md:w-auto justify-center md:justify-end">
              {/* Clickable Step Indicator */}
              <div className="flex gap-2 items-end">
                {STEPS.map((_, i) => {
                  const summary = [
                    getDateTimeSummary(formData.dateNeeded, formData.timeNeeded),
                    getSizeSummary(formData.cakeSize, activeCakeSizes, isSpanish),
                    getFlavorSummary(formData.breadType, selectedFillings, activeBreadTypes, activeFillings),
                    getDetailsSummary(formData.theme, uploadedImageUrl, t),
                    getContactSummary(formData.customerName, formData.pickupType, t),
                  ][i];
                  const isCompleted = i < currentStep;
                  return (
                    <button
                      key={i}
                      onClick={() => isCompleted && goToStep(i)}
                      className={cn(
                        "flex flex-col items-center gap-1 transition-all",
                        isCompleted ? "cursor-pointer hover:opacity-80" : "cursor-default"
                      )}
                      aria-label={isCompleted ? `Go to step ${i + 1}` : undefined}
                    >
                      <div className={`h-2 w-10 rounded-full transition-all duration-500 ${i <= currentStep ? 'bg-[#C6A649] shadow-[0_0_15px_rgba(198,166,73,0.5)]' : 'bg-white/10'}`} />
                      {isCompleted && summary && (
                        <span className="text-[9px] text-[#C6A649]/70 font-bold max-w-[40px] truncate hidden md:block">{summary}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Language Toggle - Custom Styles handled in component */}
              <div className="scale-95">
                <LanguageToggle />
              </div>
            </div>

          </div>
        </div>
      </header>

      {/* --- CONTENT WIZARD --- */}
      <main className="flex-1 flex flex-col justify-center items-center p-5 relative z-10 w-full max-w-md mx-auto min-h-[60vh]">

        {/* Step Title */}
        <div className="w-full mb-6 sm:mb-8 md:mb-12 text-center">
          <motion.div
            key={currentStep}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="inline-block space-y-2"
          >
            <span className="text-xs font-black tracking-[0.4em] text-[#C6A649] uppercase block mb-2">Eli's Tradition</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white uppercase tracking-tighter leading-tight">{STEPS[currentStep].title}</h2>
            <p className="text-gray-400 font-medium italic font-serif text-lg">{STEPS[currentStep].subtitle}</p>
          </motion.div>
        </div>

        {/* Validation Error */}
        <AnimatePresence>
          {validationError && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginBottom: 0 }}
              animate={{ height: 'auto', opacity: 1, marginBottom: 24 }}
              exit={{ height: 0, opacity: 0, marginBottom: 0 }}
              className="w-full flex items-center gap-4 rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-red-200 backdrop-blur-3xl shadow-2xl"
            >
              <AlertCircle className="h-6 w-6 flex-shrink-0 text-red-400" />
              <p className="text-sm font-black uppercase tracking-wide">{validationError}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence custom={direction} mode="wait">
          <motion.div
            key={currentStep}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-full bg-white/5 backdrop-blur-3xl p-4 sm:p-6 md:p-8 lg:p-10 rounded-[2rem] sm:rounded-[3rem] shadow-[0_30px_60px_rgba(0,0,0,0.5)] border border-white/10 min-h-[400px] flex flex-col justify-center relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 w-40 h-40 bg-[#C6A649]/5 rounded-full blur-3xl pointer-events-none" />

            {/* --- STEP 1: DATE --- */}
            {STEPS[currentStep].id === 'date' && (
              <DateTimeStep
                dateNeeded={formData.dateNeeded}
                timeNeeded={formData.timeNeeded}
                timeOptions={timeOptions}
                onDateChange={(date) => setFormData(prev => ({ ...prev, dateNeeded: date }))}
                onTimeChange={(time) => setFormData(prev => ({ ...prev, timeNeeded: time }))}
              />
            )}

            {/* --- STEP 2: SIZE --- */}
            {STEPS[currentStep].id === 'size' && (
              <SizeStep
                cakeSize={formData.cakeSize}
                activeCakeSizes={activeCakeSizes}
                optionsLoading={optionsLoading}
                isSpanish={isSpanish}
                onSizeChange={(size) => setFormData(prev => ({ ...prev, cakeSize: size }))}
              />
            )}

            {/* --- STEP 3: FLAVOR --- */}
            {STEPS[currentStep].id === 'flavor' && (
              <FlavorStep
                breadType={formData.breadType}
                activeBreadTypes={activeBreadTypes}
                selectedFillings={selectedFillings}
                activeFillings={activeFillings}
                premiumFillingSizes={premiumFillingSizes}
                activePremiumOptions={activePremiumOptions}
                optionsLoading={optionsLoading}
                isSpanish={isSpanish}
                onBreadChange={(bt) => setFormData(prev => ({ ...prev, breadType: bt }))}
                onFillingToggle={handleFillingToggle}
                onPremiumSizeSet={handlePremiumSizeSet}
              />
            )}

            {/* --- STEP 4: DETAILS --- */}
            {STEPS[currentStep].id === 'details' && (
              <DetailsStep
                theme={formData.theme}
                dedication={formData.dedication}
                imagePreviewUrl={imagePreviewUrl}
                isUploadingImage={isUploadingImage}
                isMobile={isMobile}
                fileInputRef={fileInputRef}
                showCamera={showCamera}
                onThemeChange={(theme) => setFormData(prev => ({ ...prev, theme }))}
                onDedicationChange={(dedication) => setFormData(prev => ({ ...prev, dedication }))}
                onImageChange={handleImageChange}
                onRemoveImage={handleRemoveImage}
                onCameraCapture={(imageDataUrl) => {
                  // Convert data URL to file and process via handleImageChange
                  fetch(imageDataUrl)
                    .then(r => r.blob())
                    .then(blob => {
                      const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
                      const fake = { target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;
                      handleImageChange(fake);
                    });
                }}
                onShowCameraChange={setShowCamera}
              />
            )}

            {/* --- STEP 5: CONTACT INFO --- */}
            {STEPS[currentStep].id === 'info' && (
              <ContactStep
                customerName={formData.customerName}
                phone={formData.phone}
                email={formData.email}
                pickupType={formData.pickupType}
                consentGiven={consentGiven}
                deliveryAddress={formData.deliveryAddress}
                deliveryFee={deliveryFee}
                onNameChange={(name) => setFormData(prev => ({ ...prev, customerName: name }))}
                onPhoneChange={handlePhoneChange}
                onEmailChange={(email) => setFormData(prev => ({ ...prev, email }))}
                onPickupTypeChange={(type) => setFormData(prev => ({ ...prev, pickupType: type }))}
                onConsentChange={setConsentGiven}
                onAddressChange={handleAddressChange}
              />
            )}

          </motion.div>
        </AnimatePresence>
      </main>

      {/* --- WIZARD NAVIGATION --- */}
      <div className="fixed bottom-0 left-0 right-0 p-6 z-50 bg-gradient-to-t from-black via-black/80 to-transparent">
        <div className="max-w-md mx-auto bg-black/40 backdrop-blur-3xl rounded-[2.5rem] p-5 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex justify-between items-center pr-3">
          <div className="flex flex-col pl-6">
            <span className="text-[10px] text-[#C6A649] font-black uppercase tracking-[0.3em] mb-1">{t('Total Estimado', 'Estimated Total')}</span>
            <span className="text-3xl font-black text-white tracking-tighter leading-none">
              {isCalculatingPrice ? <Loader2 className="inline animate-spin text-[#C6A649]" size={20} /> : formatPrice(getTotal())}
            </span>
          </div>

          <div className="flex gap-4">
            {currentStep > 0 && (
              <button
                onClick={prevStep}
                className="w-14 h-14 rounded-[1.2rem] bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white hover:text-black transition-all duration-500"
              >
                <ChevronLeft size={24} strokeWidth={3} />
              </button>
            )}

            <button
              onClick={nextStep}
              disabled={isSubmitting}
              className={`h-14 px-8 rounded-[1.2rem] flex items-center justify-center gap-3 font-black text-sm uppercase tracking-[0.2em] transition-all duration-500 shadow-[0_0_20px_rgba(198,166,73,0.3)] ${
                isSubmitting ? 'bg-gray-800 text-gray-500' : 'bg-[#C6A649] text-black hover:bg-white hover:scale-105'
              }`}
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  {currentStep === STEPS.length - 1 ? t('Finalizar', 'Checkout') : t('Siguiente', 'Next')}
                  <ChevronRight size={20} strokeWidth={4} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Order;
