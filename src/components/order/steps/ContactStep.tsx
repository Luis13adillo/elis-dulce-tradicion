/* eslint-disable @typescript-eslint/no-explicit-any */
import { useLanguage } from '@/contexts/LanguageContext';
import AddressAutocomplete from '@/components/order/AddressAutocomplete';
import { FloatingInput } from './DetailsStep';
import { FoodSafetyDisclaimer } from '@/components/legal/FoodSafetyDisclaimer';
import { formatPrice } from '@/lib/pricing';
import { ShoppingBag, MapPin, Check, User, Phone, Mail, AlertTriangle } from 'lucide-react';

interface ContactStepProps {
  customerName: string;
  phone: string;
  email: string;
  pickupType: string;
  consentGiven: boolean;
  allergies: string;
  foodSafetyAcknowledged: boolean;
  deliveryAddress: string;
  deliveryFee: number;
  isAddressServiceable?: boolean;
  onNameChange: (name: string) => void;
  onPhoneChange: (phone: string) => void;
  onEmailChange: (email: string) => void;
  onPickupTypeChange: (type: 'pickup' | 'delivery') => void;
  onConsentChange: (consent: boolean) => void;
  onAllergiesChange: (value: string) => void;
  onFoodSafetyAcknowledgedChange: (ack: boolean) => void;
  onAddressChange: (address: string, isValid: boolean, placeDetails?: any, deliveryInfo?: any) => void;
}

export function getContactSummary(customerName: string, pickupType: string, t: any): string | null {
  if (!customerName) return null;
  const typeLabel = pickupType === 'delivery' ? t('Delivery', 'Delivery') : t('Pickup', 'Pickup');
  return `${customerName} • ${typeLabel}`;
}

export function validateContactStep(
  customerName: string,
  phone: string,
  email: string,
  pickupType: string,
  deliveryAddress: string,
  consentGiven: boolean,
  foodSafetyAcknowledged: boolean,
  t: any,
  isAddressServiceable?: boolean
): string | null {
  if (!customerName.trim()) return t('Por favor ingresa tu nombre', 'Please enter your name');
  if (!phone.trim()) return t('Por favor ingresa tu teléfono', 'Please enter your phone');
  if (!email.trim() || !email.includes('@')) return t('Por favor ingresa un email válido', 'Please enter a valid email');
  if (pickupType === 'delivery' && !deliveryAddress.trim()) return t('Por favor ingresa tu dirección', 'Please enter your delivery address');
  if (pickupType === 'delivery' && deliveryAddress && isAddressServiceable === false)
    return t('Dirección fuera de área de entrega (máx. 4.5 millas)', 'Address outside delivery area (max 4.5 miles)');
  if (!foodSafetyAcknowledged)
    return t(
      'Por favor confirma que entiendes la advertencia de alérgenos',
      'Please acknowledge the allergen disclaimer'
    );
  if (!consentGiven) return t('Por favor acepta los términos', 'Please accept the terms');
  return null;
}

const ContactStep = ({
  customerName,
  phone,
  email,
  pickupType,
  consentGiven,
  allergies,
  foodSafetyAcknowledged,
  deliveryAddress,
  deliveryFee,
  isAddressServiceable: _isAddressServiceable,
  onNameChange,
  onPhoneChange,
  onEmailChange,
  onPickupTypeChange,
  onConsentChange,
  onAllergiesChange,
  onFoodSafetyAcknowledgedChange,
  onAddressChange,
}: ContactStepProps) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Name, Phone, Email fields */}
      <FloatingInput
        label={t('Nombre', 'Name')}
        icon={User}
        value={customerName}
        onChange={(e: any) => onNameChange(e.target.value)}
      />
      <FloatingInput
        label={t('Teléfono', 'Phone')}
        type="tel"
        icon={Phone}
        value={phone}
        onChange={(e: any) => onPhoneChange(e.target.value)}
        maxLength={14}
        placeholder="(555) 555-5555"
      />
      <FloatingInput
        label={t('Correo Electrónico', 'Email')}
        type="email"
        icon={Mail}
        value={email}
        onChange={(e: any) => onEmailChange(e.target.value)}
        placeholder="ejemplo@email.com"
      />

      {/* Pickup / Delivery Selector */}
      <div className="bg-white/5 p-2 rounded-2xl sm:rounded-[2rem] border border-white/10 grid grid-cols-2 gap-2 shadow-2xl">
        <button
          onClick={() => onPickupTypeChange('pickup')}
          className={`py-3 sm:py-4 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-black uppercase tracking-wider sm:tracking-widest flex items-center justify-center gap-2 sm:gap-3 transition-all duration-500 ${
            pickupType === 'pickup'
              ? 'bg-[#C6A649] text-black shadow-[0_10px_20px_rgba(198,166,73,0.3)]'
              : 'text-gray-400 hover:bg-white/5 hover:text-white active:scale-95'
          }`}
        >
          <ShoppingBag size={16} /> Pickup
        </button>
        <button
          onClick={() => onPickupTypeChange('delivery')}
          className={`py-3 sm:py-4 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-black uppercase tracking-wider sm:tracking-widest flex items-center justify-center gap-2 sm:gap-3 transition-all duration-500 ${
            pickupType === 'delivery'
              ? 'bg-[#C6A649] text-black shadow-[0_10px_20px_rgba(198,166,73,0.3)]'
              : 'text-gray-400 hover:bg-white/5 hover:text-white active:scale-95'
          }`}
        >
          <MapPin size={16} /> Delivery
        </button>
      </div>

      {/* AddressAutocomplete — rendered when delivery is selected */}
      {pickupType === 'delivery' && (
        <div className="space-y-2">
          <AddressAutocomplete
            value={deliveryAddress}
            onChange={onAddressChange}
            showDeliveryInfo={true}
            placeholder={t('Dirección de entrega', 'Delivery address')}
          />
          {deliveryFee > 0 && (
            <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-[#C6A649]/10 border border-[#C6A649]/20 rounded-xl text-[#C6A649] text-[10px] sm:text-xs font-black uppercase tracking-wider sm:tracking-widest">
              <MapPin size={13} className="flex-shrink-0" />
              <span>{t('Tarifa de entrega:', 'Delivery fee:')} {formatPrice(deliveryFee)}</span>
            </div>
          )}
        </div>
      )}

      {/* Allergies / Dietary Restrictions */}
      <div className="pt-1 sm:pt-2">
        <label className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-[0.25em] sm:tracking-[0.3em] mb-2 sm:mb-3 block opacity-70 flex items-center gap-2">
          <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
          <span className="leading-tight">{t('Alergias / Restricciones (Opcional)', 'Allergies / Restrictions (Optional)')}</span>
        </label>
        <textarea
          value={allergies}
          onChange={(e) => onAllergiesChange(e.target.value)}
          maxLength={500}
          className="w-full bg-white/5 border border-white/10 focus:border-amber-400/50 hover:bg-white/10 transition-all rounded-2xl p-3.5 sm:p-4 text-white font-medium outline-none min-h-[72px] sm:min-h-[80px] text-sm resize-none"
          placeholder={t(
            'Ej: Alergia a nueces, sin gluten, sin lácteos…',
            'E.g. Nut allergy, gluten-free, dairy-free…'
          )}
        />
      </div>

      {/* Food Safety Disclaimer (always shown, read-only) */}
      <FoodSafetyDisclaimer variant="compact" />

      {/* Required acknowledgment */}
      <label className="flex items-start gap-3 sm:gap-4 cursor-pointer group p-3 sm:p-4 rounded-2xl sm:rounded-3xl transition-colors hover:bg-white/5 border border-amber-500/20 bg-amber-500/5">
        <div
          className={`mt-0.5 w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl border-2 flex items-center justify-center transition-all duration-500 flex-shrink-0 ${
            foodSafetyAcknowledged
              ? 'bg-amber-500 border-amber-500 text-black shadow-[0_0_15px_rgba(251,191,36,0.4)]'
              : 'border-amber-500/40 group-hover:border-amber-400'
          }`}
        >
          <Check size={16} strokeWidth={4} />
        </div>
        <input
          type="checkbox"
          checked={foodSafetyAcknowledged}
          onChange={(e) => onFoodSafetyAcknowledgedChange(e.target.checked)}
          className="hidden"
        />
        <div className="text-[11px] sm:text-xs text-amber-200 font-bold leading-snug sm:leading-relaxed uppercase tracking-wide sm:tracking-wider group-hover:text-white transition-colors">
          {t(
            'Entiendo que los productos pueden contener alérgenos y que es posible la contaminación cruzada.',
            'I understand products may contain allergens and that cross-contamination is possible.'
          )}
        </div>
      </label>

      {/* Terms Consent Checkbox */}
      <label className="flex items-start gap-3 sm:gap-4 cursor-pointer group p-3 sm:p-4 rounded-2xl sm:rounded-3xl transition-colors hover:bg-white/5 border border-white/10">
        <div
          className={`mt-0.5 w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl border-2 flex items-center justify-center transition-all duration-500 flex-shrink-0 ${
            consentGiven
              ? 'bg-[#C6A649] border-[#C6A649] text-black shadow-[0_0_15px_rgba(198,166,73,0.4)]'
              : 'border-white/10 group-hover:border-[#C6A649]'
          }`}
        >
          <Check size={16} strokeWidth={4} />
        </div>
        <input type="checkbox" checked={consentGiven} onChange={e => onConsentChange(e.target.checked)} className="hidden" />
        <div className="text-[11px] sm:text-xs text-gray-400 font-bold leading-snug sm:leading-relaxed uppercase tracking-wide sm:tracking-wider group-hover:text-white transition-colors">
          {t('Acepto los términos y confirmo que los detalles son correctos.', 'I accept terms and confirm details are correct.')}
        </div>
      </label>
    </div>
  );
};

export default ContactStep;
