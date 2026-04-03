/* eslint-disable @typescript-eslint/no-explicit-any */
import { useLanguage } from '@/contexts/LanguageContext';
import { Upload, Check, Clock, User, Camera, X, Loader2, AlertCircle, ShoppingBag, Calendar, Sparkles, MapPin, ChevronRight, ChevronLeft, Star, Mail } from 'lucide-react';
import logoImage from '@/assets/brand/logo.png';
import { useState, useRef, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { validateLeadTime, validateOrderDateTimeComplete } from '@/lib/validation';
import { useNavigate } from 'react-router-dom';
import { uploadReferenceImage } from '@/lib/storage';
import { isValidImageType, isValidFileSize, compressImage } from '@/lib/imageCompression';
import { useOptimizedPricing } from '@/lib/hooks/useOptimizedPricing';
import { useIsMobile } from '@/hooks/use-mobile';
import { CameraCapture } from '@/components/mobile/CameraCapture';
import { useAuth } from '@/contexts/AuthContext';
import { formatPrice } from '@/lib/pricing';
import { motion, AnimatePresence } from 'framer-motion';
import LanguageToggle from '@/components/LanguageToggle';
import { useBusinessHours } from '@/lib/hooks/useCMS';
import { api } from '@/lib/api';
import type { OrderFormOptions } from '@/lib/api/modules/orderOptions';
import AddressAutocomplete from '@/components/order/AddressAutocomplete';

const STORAGE_KEY = 'bakery_order_draft';

// --- CONSTANTS (Fallback arrays — used when DB fetch fails or is loading) ---
const FALLBACK_CAKE_SIZES = [
  { value: '6-round', label: '6" Round', labelEs: '6" Redondo', price: 30, serves: '6-8', featured: false },
  { value: '8-round', label: '8" Round', labelEs: '8" Redondo', price: 35, serves: '10-12', featured: false },
  { value: '10-round', label: '10" Round', labelEs: '10" Redondo', price: 55, serves: '20-25', featured: true },
  { value: '12-round', label: '12" Round', labelEs: '12" Redondo', price: 85, serves: '30-35', featured: false },
  { value: 'quarter-sheet', label: '1/4 Sheet', labelEs: '1/4 Plancha', price: 70, serves: '20-25', featured: false },
  { value: 'half-sheet', label: '1/2 Sheet', labelEs: '1/2 Plancha', price: 135, serves: '40-50', featured: false },
  { value: 'full-sheet', label: 'Full Sheet', labelEs: 'Plancha Completa', price: 240, serves: '90-100', featured: false },
  { value: '8-hard-shape', label: '8" Hard Shape', labelEs: '8" Forma Especial', price: 50, serves: '10-12', featured: false },
];

const FALLBACK_BREAD_TYPES = [
  { value: 'tres-leches', label: '3 Leches', desc: 'Moist & Traditional' },
  { value: 'chocolate', label: 'Chocolate', desc: 'Rich & Decadent' },
  { value: 'vanilla', label: 'Regular', desc: 'Classic Vanilla' },
];

const FALLBACK_FILLINGS = [
  { value: 'strawberry', label: 'Fresa', sub: 'Strawberry', premium: false },
  { value: 'chocolate-chip', label: 'Choco Chip', sub: 'Dark Chocolate', premium: false },
  { value: 'mocha', label: 'Mocha', sub: 'Coffee Blend', premium: false },
  { value: 'mousse', label: 'Mousse', sub: 'Whipped', premium: false },
  { value: 'napolitano', label: 'Napolitano', sub: 'Mix', premium: false },
  { value: 'pecan', label: 'Nuez', sub: 'Pecan', premium: false },
  { value: 'coconut', label: 'Coco', sub: 'Coconut', premium: false },
  { value: 'pineapple', label: 'Piña', sub: 'Pineapple', premium: false },
  { value: 'pina-colada', label: 'Piña Colada', sub: 'Tropical', premium: false },
  { value: 'peach', label: 'Durazno', sub: 'Peach', premium: false },
  { value: 'tiramisu', label: 'Tiramisu', sub: 'Italian Style', premium: true },
  { value: 'relleno-flan', label: 'Relleno de Flan', sub: 'Flan Filling', premium: true },
  { value: 'oreo', label: 'Oreo', sub: 'Cookies & Cream', premium: false },
  { value: 'red-velvet', label: 'Red Velvet', sub: 'Cream Cheese', premium: false },
];

// Premium filling size options with upcharges (fallback)
const FALLBACK_PREMIUM_FILLING_OPTIONS = [
  { value: '10-round', label: '10"', labelEs: '10"', upcharge: 5 },
  { value: 'full-sheet', label: 'Full Sheet', labelEs: 'Plancha Completa', upcharge: 20 },
];

const formatTimeDisplay = (time: string) => {
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
};

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

// --- CUSTOM COMPONENTS ---
const FloatingInput = ({ label, value, onChange, type = "text", placeholder, icon: Icon, maxLength, className }: any) => {
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
    api.getOrderFormOptions()
      .then((options) => {
        setOrderOptions(options);
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
  })) ?? FALLBACK_CAKE_SIZES;

  const activeBreadTypes = orderOptions?.breadTypes.map(b => ({
    value: b.value,
    label: b.label_en,
    desc: b.description,
  })) ?? FALLBACK_BREAD_TYPES;

  const activeFillings = orderOptions?.fillings.map(f => ({
    value: f.value,
    label: f.label_en,
    sub: f.sub_label,
    premium: f.is_premium,
  })) ?? FALLBACK_FILLINGS;

  const activePremiumOptions = orderOptions?.premiumUpcharges.map(u => ({
    value: u.size_value,
    label: u.label_en,
    labelEs: u.label_es,
    upcharge: u.upcharge,
  })) ?? FALLBACK_PREMIUM_FILLING_OPTIONS;

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

  const toggleFilling = (filling: string) => {
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

  const setPremiumFillingSize = (filling: string, sizeOption: string) => {
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

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    let formatted = '';
    if (digits.length > 0) formatted = '(' + digits.slice(0, 3);
    if (digits.length > 3) formatted += ') ' + digits.slice(3, 6);
    if (digits.length > 6) formatted += '-' + digits.slice(6, 10);
    setFormData({ ...formData, phone: formatted });
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

  // --- NAVIGATION VALIDATION ---
  const validateStep = async (stepIndex: number): Promise<boolean> => {
    setValidationError(null);
    const stepId = STEPS[stepIndex].id;

    if (stepId === 'date') {
      if (!formData.dateNeeded || !formData.timeNeeded) {
        setValidationError(t('Selecciona fecha y hora', 'Select date and time'));
        return false;
      }
      const validation = await validateOrderDateTimeComplete(formData.dateNeeded, formData.timeNeeded);
      if (!validation.isValid) {
        setValidationError(validation.errors.join(', '));
        return false;
      }
    }

    if (stepId === 'size') {
      if (!formData.cakeSize) {
        setValidationError(t('Debes seleccionar un tamaño', 'Must select a size'));
        return false;
      }
    }

    if (stepId === 'flavor') {
      if (hasPendingPremiumSelection()) {
        setValidationError(t('Selecciona el tamaño para los rellenos premium', 'Select size for premium fillings'));
        return false;
      }
    }

    if (stepId === 'info') {
      if (!formData.customerName.trim()) {
        setValidationError(t('Tu nombre es requerido', 'Name is required'));
        return false;
      }
      if (formData.phone.replace(/\D/g, '').length !== 10) {
        setValidationError(t('Teléfono incompleto', 'Phone incomplete'));
        return false;
      }
      if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        setValidationError(t('Correo electrónico inválido', 'Invalid email address'));
        return false;
      }
      if (formData.pickupType === 'delivery' && !formData.deliveryAddress.trim()) {
        setValidationError(t('Por favor ingresa tu dirección de entrega', 'Please enter your delivery address'));
        return false;
      }
      if (!consentGiven) {
        setValidationError(t('Marca la casilla de confirmación', 'Check the confirmation box'));
        return false;
      }
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
      // Shake animation triggering could be added here
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
              {/* Progress Indicator */}
              <div className="flex gap-2">
                {STEPS.map((_, i) => (
                  <div key={i} className={`h-2 w-10 rounded-full transition-all duration-500 ${i <= currentStep ? 'bg-[#C6A649] shadow-[0_0_15px_rgba(198,166,73,0.5)]' : 'bg-white/10'}`} />
                ))}
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
        <div className="w-full mb-12 text-center">
          <motion.div
            key={currentStep}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="inline-block space-y-2"
          >
            <span className="text-xs font-black tracking-[0.4em] text-[#C6A649] uppercase block mb-2">Eli's Tradition</span>
            <h2 className="text-5xl font-black text-white uppercase tracking-tighter leading-tight">{STEPS[currentStep].title}</h2>
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
            className="w-full bg-white/5 backdrop-blur-3xl p-8 sm:p-10 rounded-[3rem] shadow-[0_30px_60px_rgba(0,0,0,0.5)] border border-white/10 min-h-[400px] flex flex-col justify-center relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 w-40 h-40 bg-[#C6A649]/5 rounded-full blur-3xl pointer-events-none" />
            {/* --- STEP 1: DATE --- */}
            {STEPS[currentStep].id === 'date' && (
              <div className="space-y-6">
                <div className="relative group/date">
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    max={new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                    value={formData.dateNeeded}
                    onChange={(e) => setFormData({ ...formData, dateNeeded: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 focus:border-[#C6A649]/50 hover:bg-white/10 transition-all rounded-3xl p-6 text-center text-2xl font-black text-white outline-none cursor-pointer"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-[#C6A649] group-hover/date:scale-110 transition-transform">
                    <Calendar size={24} />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] mb-4 block text-center opacity-70">{t('Hora de Entrega', 'Pickup Time')}</label>
                  <div className="grid grid-cols-3 gap-3">
                    {timeOptions.map(time => (
                      <button
                        key={time}
                        onClick={() => setFormData({ ...formData, timeNeeded: time })}
                        className={`py-4 rounded-2xl text-xs font-black transition-all border uppercase tracking-widest ${formData.timeNeeded === time
                          ? 'bg-[#C6A649] text-black border-[#C6A649] shadow-[0_0_20px_rgba(198,166,73,0.4)] scale-105'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:border-[#C6A649]/30 hover:bg-white/10'
                          }`}
                      >
                        {formatTimeDisplay(time)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lead Time Display */}
                {formData.dateNeeded && formData.timeNeeded && (
                  <div className="flex justify-center">
                    {(() => {
                      const leadTime = validateLeadTime(formData.dateNeeded, formData.timeNeeded);
                      if (leadTime.isValid && leadTime.hoursUntilEvent) {
                        const days = Math.floor(leadTime.hoursUntilEvent / 24);
                        return (
                          <div className="flex items-center gap-2 text-[#C6A649] text-xs font-black uppercase tracking-widest bg-[#C6A649]/10 px-6 py-2 rounded-full border border-[#C6A649]/20 animate-fade-in">
                            <Check size={14} strokeWidth={4} /> {days} {t('días para preparar', 'days to prepare')}
                          </div>
                        )
                      }
                      return (
                        <div className="flex items-center gap-2 text-amber-500 text-xs font-black uppercase tracking-widest bg-amber-500/10 px-6 py-2 rounded-full border border-amber-500/20">
                          <Clock size={14} strokeWidth={4} /> {t('Mínimo 48h requerido', 'Min 48h required')}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* --- STEP 2: SIZE --- */}
            {STEPS[currentStep].id === 'size' && (
              <div className="space-y-6">
                <div className="bg-[#C6A649]/10 border border-[#C6A649]/20 rounded-2xl p-4 flex items-center gap-4 mb-2">
                  <div className="bg-[#C6A649] text-black rounded-lg p-2">
                    <User size={20} strokeWidth={3} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-[#C6A649]">{t('Guía de Porciones', 'Serving Guide')}</p>
                    <p className="text-sm text-gray-300 font-medium">{t('Escoge según el número de invitados', 'Choose based on your headcount')}</p>
                  </div>
                </div>
                {optionsLoading ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {activeCakeSizes.map(s => (
                      <button
                        key={s.value}
                        onClick={() => setFormData({ ...formData, cakeSize: s.value })}
                        className={`relative p-6 rounded-[2rem] text-left transition-all duration-500 border overflow-hidden group/card ${formData.cakeSize === s.value
                          ? 'bg-white/10 border-[#C6A649]/50 shadow-[0_20px_50px_rgba(0,0,0,0.5)] scale-105'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/[0.08] hover:border-[#C6A649]/30'
                          }`}
                      >
                        {s.featured && (
                          <div className="absolute top-0 right-0 bg-[#C6A649] text-[9px] font-black text-black px-4 py-1.5 rounded-bl-[1.5rem] uppercase tracking-widest z-10">
                            Popular
                          </div>
                        )}
                        <div className="text-xs font-black uppercase tracking-widest mb-2 opacity-50 group-hover/card:opacity-100 transition-opacity">{s.serves} {t('pers', 'ppl')}</div>
                        <div className="font-black text-white text-base md:text-lg mb-4 leading-tight uppercase tracking-tight">{isSpanish ? s.labelEs : s.label}</div>
                        <div className={`text-2xl font-black tracking-tight ${formData.cakeSize === s.value ? 'text-[#C6A649]' : 'text-white'}`}>${s.price}</div>

                        {formData.cakeSize === s.value && (
                          <div className="absolute bottom-5 right-5 text-[#C6A649] animate-fade-in">
                            <Check size={28} strokeWidth={4} />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* --- STEP 3: FLAVOR --- */}
            {STEPS[currentStep].id === 'flavor' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] mb-4 block opacity-70">{t('Tipo de Pan', 'Bread Type')}</label>
                  {optionsLoading ? (
                    <div className="grid grid-cols-2 gap-3">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {activeBreadTypes.map(type => (
                        <button
                          key={type.value}
                          onClick={() => setFormData({ ...formData, breadType: type.value })}
                          className={`p-6 rounded-3xl flex items-center justify-between border transition-all duration-500 ${formData.breadType === type.value
                            ? 'bg-[#C6A649] border-[#C6A649] text-black shadow-[0_15px_30px_rgba(198,166,73,0.3)] scale-[1.02]'
                            : 'bg-white/5 border-white/10 text-white hover:bg-white/[0.08] hover:border-[#C6A649]/30'
                            }`}
                        >
                          <div className="text-left">
                            <div className="font-black uppercase tracking-tight text-lg">{type.label}</div>
                            <div className={`text-sm font-medium italic ${formData.breadType === type.value ? 'text-black/60' : 'text-gray-400'}`}>{type.desc}</div>
                          </div>
                          {formData.breadType === type.value && <Check size={24} className="text-black" strokeWidth={4} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] mb-4 block opacity-70 flex items-center justify-between">
                    <span>{t('Relleno', 'Filling')} <span className="opacity-50 font-medium">({t('Opcional', 'Optional')})</span></span>
                    <span className={`${selectedFillings.length >= 2 ? 'text-[#C6A649]' : 'text-gray-500'}`}>
                      {selectedFillings.length}/2
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {activeFillings.map(f => {
                      const isSelected = selectedFillings.includes(f.value);
                      const needsSizeSelection = f.premium && isSelected && !premiumFillingSizes[f.value];
                      const selectedSizeOption = f.premium && isSelected ? activePremiumOptions.find(opt => opt.value === premiumFillingSizes[f.value]) : null;

                      return (
                        <div key={f.value} className="relative">
                          <button
                            onClick={() => toggleFilling(f.value)}
                            className={`w-full p-4 rounded-2xl border text-left transition-all duration-500 relative overflow-hidden group/filling ${isSelected
                              ? 'bg-[#C6A649]/20 border-[#C6A649] text-[#C6A649] shadow-[0_10px_20px_rgba(0,0,0,0.3)] scale-[1.05]'
                              : 'bg-white/5 border-white/10 text-gray-400 hover:border-[#C6A649]/30 hover:bg-white/[0.08]'
                              }`}
                          >
                            <div className="relative z-10 flex flex-col">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-black uppercase tracking-tight mb-1">{f.label}</div>
                                {f.premium && (
                                  <span className="text-[8px] font-black bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full uppercase tracking-widest">Premium</span>
                                )}
                              </div>
                              <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 leading-none">{f.sub}</div>
                              {selectedSizeOption && (
                                <div className="text-[10px] font-black text-[#C6A649] mt-2 flex items-center gap-1">
                                  +${selectedSizeOption.upcharge} ({isSpanish ? selectedSizeOption.labelEs : selectedSizeOption.label})
                                </div>
                              )}
                            </div>
                            {isSelected && <div className="absolute inset-0 bg-[#C6A649]/5 z-0" />}
                          </button>

                          {/* Premium filling size selection popup */}
                          {needsSizeSelection && (
                            <div className="absolute top-full left-0 right-0 mt-2 z-20 bg-black/95 backdrop-blur-xl border border-[#C6A649]/50 rounded-2xl p-4 shadow-[0_20px_40px_rgba(0,0,0,0.8)] animate-fade-in">
                              <p className="text-xs font-black text-[#C6A649] uppercase tracking-widest mb-3 text-center">
                                {t('Selecciona tamaño', 'Select size')}
                              </p>
                              <div className="flex flex-col gap-2">
                                {activePremiumOptions.map(opt => (
                                  <button
                                    key={opt.value}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPremiumFillingSize(f.value, opt.value);
                                    }}
                                    className="w-full p-3 rounded-xl bg-white/5 border border-white/10 hover:border-[#C6A649]/50 hover:bg-[#C6A649]/10 transition-all flex justify-between items-center"
                                  >
                                    <span className="text-sm font-bold text-white">{isSpanish ? opt.labelEs : opt.label}</span>
                                    <span className="text-sm font-black text-[#C6A649]">+${opt.upcharge}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Warning if premium filling needs size selection */}
                  {hasPendingPremiumSelection() && (
                    <div className="flex items-center gap-3 text-amber-400 text-xs font-bold uppercase tracking-wider bg-amber-500/10 px-4 py-3 rounded-xl border border-amber-500/20">
                      <AlertCircle size={16} />
                      {t('Selecciona el tamaño para los rellenos premium', 'Select size for premium fillings')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- STEP 4: DETAILS --- */}
            {STEPS[currentStep].id === 'details' && (
              <div className="space-y-4">
                <FloatingInput
                  label={t('Tema', 'Theme')}
                  value={formData.theme}
                  onChange={(e: any) => setFormData({ ...formData, theme: e.target.value })}
                  icon={Sparkles}
                  placeholder="e.g. Birthday, Wedding..."
                />
                <FloatingInput
                  label={t('Dedicatoria', 'Message')}
                  value={formData.dedication}
                  onChange={(e: any) => setFormData({ ...formData, dedication: e.target.value })}
                  icon={Star}
                  placeholder="e.g. Happy Birthday!"
                />

                <div className="pt-2">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] mb-4 block opacity-70">
                    {t('Notas de Decoración', 'Decoration Notes')}
                  </label>
                  <textarea
                    value={formData.theme}
                    onChange={(e) => setFormData({ ...formData, theme: e.target.value })}
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
                          onClick={() => setShowCamera(true)}
                          className="bg-white/5 border-2 border-dashed border-white/10 rounded-[2rem] p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-white/10 hover:border-[#C6A649]/50 transition-all duration-500 group/btn"
                        >
                          <div className="w-16 h-16 rounded-2xl bg-[#C6A649]/10 border border-[#C6A649]/20 text-[#C6A649] flex items-center justify-center group-hover/btn:scale-110 group-hover/btn:bg-[#C6A649] group-hover/btn:text-black transition-all">
                            <Camera size={32} />
                          </div>
                          <span className="text-xs font-black text-gray-400 group-hover/btn:text-white uppercase tracking-[0.2em]">{t('Cámara', 'Camera')}</span>
                        </button>
                      )}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className={`bg-white/5 border-2 border-dashed border-white/10 rounded-[2rem] p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-white/10 hover:border-[#C6A649]/50 transition-all duration-500 group/btn ${!isMobile ? 'col-span-2' : ''
                          }`}
                      >
                        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 text-gray-500 flex items-center justify-center group-hover/btn:scale-110 group-hover/btn:border-[#C6A649]/30 group-hover/btn:text-[#C6A649] transition-all">
                          <Upload size={32} />
                        </div>
                        <div className="text-center">
                          <span className="text-xs font-black text-gray-400 group-hover/btn:text-white uppercase tracking-[0.2em] block mb-1">{t('Subir Foto', 'Upload')}</span>
                          <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">JPG, PNG, WEBP</span>
                        </div>
                      </button>
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                    </div>
                  ) : (
                    <div className="relative rounded-[2rem] overflow-hidden shadow-2xl group h-64 border border-white/10 group">
                      <img src={imagePreviewUrl} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" alt="Preview" />
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
                        <button onClick={handleRemoveImage} className="bg-white/10 backdrop-blur-md p-5 rounded-full text-white hover:bg-red-500/80 transition-all scale-150 group-hover:scale-100 duration-500">
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
                      handleImageChange(fake);
                      setShowCamera(false);
                    }}
                    onCancel={() => setShowCamera(false)}
                  />
                )}
              </div>
            )}

            {/* --- STEP 5: CONTACT INFO --- */}
            {STEPS[currentStep].id === 'info' && (
              <div className="space-y-4">
                <FloatingInput
                  label={t('Nombre', 'Name')}
                  icon={User}
                  value={formData.customerName}
                  onChange={(e: any) => setFormData({ ...formData, customerName: e.target.value })}
                />
                <FloatingInput
                  label={t('Teléfono', 'Phone')}
                  type="tel"
                  icon={null}
                  value={formData.phone}
                  onChange={handlePhoneChange}
                  maxLength={14}
                  placeholder="(555) 555-5555"
                />
                <FloatingInput
                  label={t('Correo Electrónico', 'Email')}
                  type="email"
                  icon={Mail}
                  value={formData.email}
                  onChange={(e: any) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="ejemplo@email.com"
                />

                <div className="bg-white/5 p-3 rounded-[2rem] border border-white/10 flex gap-3 shadow-2xl">
                  <button
                    onClick={() => setFormData({ ...formData, pickupType: 'pickup' })}
                    className={`flex-1 py-4 rounded-2xl text-sm font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all duration-500 ${formData.pickupType === 'pickup'
                      ? 'bg-[#C6A649] text-black shadow-[0_10px_20px_rgba(198,166,73,0.3)]'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                  >
                    <ShoppingBag size={18} /> Pickup
                  </button>
                  <div className="w-px bg-white/10 my-3"></div>
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, pickupType: 'delivery' }))}
                    className={`flex-1 py-4 rounded-2xl text-sm font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all duration-500 ${
                      formData.pickupType === 'delivery'
                        ? 'bg-[#C6A649] text-black shadow-[0_10px_20px_rgba(198,166,73,0.3)]'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <MapPin size={18} /> Delivery
                  </button>
                </div>

                {formData.pickupType === 'delivery' && (
                  <div className="space-y-2">
                    <AddressAutocomplete
                      value={formData.deliveryAddress}
                      onChange={handleAddressChange}
                      showDeliveryInfo={true}
                      placeholder={t('Dirección de entrega', 'Delivery address')}
                    />
                    {deliveryFee > 0 && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-[#C6A649]/10 border border-[#C6A649]/20 rounded-xl text-[#C6A649] text-xs font-black uppercase tracking-widest">
                        <MapPin size={14} />
                        {t('Tarifa de entrega:', 'Delivery fee:')} {formatPrice(deliveryFee)}
                      </div>
                    )}
                  </div>
                )}

                <label className="flex items-center gap-5 cursor-pointer group p-4 rounded-3xl transition-colors hover:bg-white/5">
                  <div className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all duration-500 ${consentGiven ? 'bg-[#C6A649] border-[#C6A649] text-black shadow-[0_0_15px_rgba(198,166,73,0.4)]' : 'border-white/10 group-hover:border-[#C6A649]'
                    }`}>
                    <Check size={18} strokeWidth={4} />
                  </div>
                  <input type="checkbox" checked={consentGiven} onChange={e => setConsentGiven(e.target.checked)} className="hidden" />
                  <div className="text-xs text-gray-400 font-bold leading-relaxed uppercase tracking-wider group-hover:text-white transition-colors">
                    {t('Acepto los términos y confirmo que los detalles son correctos.', 'I accept terms and confirm details are correct.')}
                  </div>
                </label>
              </div>
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
              className={`h-14 px-8 rounded-[1.2rem] flex items-center justify-center gap-3 font-black text-sm uppercase tracking-[0.2em] transition-all duration-500 shadow-[0_0_20px_rgba(198,166,73,0.3)] ${isSubmitting ? 'bg-gray-800 text-gray-500' : 'bg-[#C6A649] text-black hover:bg-white hover:scale-105'
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
