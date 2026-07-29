/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Info, Loader2 } from 'lucide-react';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string, isValid: boolean, placeDetails?: any, deliveryInfo?: any) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  showDeliveryInfo?: boolean;
}

declare global {
  interface Window {
    google: any;
    initGoogleMaps: () => void;
  }
}

const AddressAutocomplete = ({
  value,
  onChange,
  placeholder,
  required,
  className,
  showDeliveryInfo = true
}: AddressAutocompleteProps) => {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [autocomplete, setAutocomplete] = useState<any>(null);
  const [isValidAddress, setIsValidAddress] = useState(false);
  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState<any>(null);
  const [isCheckingDelivery, setIsCheckingDelivery] = useState(false);

  // Load Google Maps script
  useEffect(() => {
    // Check if Google Maps is already loaded
    if (window.google?.maps?.places) {
      setGoogleMapsLoaded(true);
      return;
    }

    // Check if script is already in the document
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => setGoogleMapsLoaded(true));
      return;
    }

    // Load Google Maps script
    const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    
    if (!GOOGLE_MAPS_API_KEY) {
      console.warn('⚠️ Google Maps API key not found. Address autocomplete disabled.');
      console.warn('📝 Add VITE_GOOGLE_MAPS_API_KEY to your .env file to enable address validation.');
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => setGoogleMapsLoaded(true);
    script.onerror = () => {
      console.error('Failed to load Google Maps script');
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, []);

  // Initialize autocomplete
  useEffect(() => {
    if (!googleMapsLoaded || !inputRef.current || autocomplete) return;

    try {
      const autocompleteInstance = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'us' },
        fields: ['address_components', 'formatted_address', 'geometry', 'place_id'],
        types: ['address']
      });

      autocompleteInstance.addListener('place_changed', async () => {
        const place = autocompleteInstance.getPlace();
        
        if (!place.geometry || !place.address_components) {
          console.log('No details available for selected place');
          setIsValidAddress(false);
          onChange(value, false);
          return;
        }

        // Extract address components
        const addressComponents = place.address_components;
        let streetNumber = '';
        let route = '';
        let city = '';
        let state = '';
        let zipCode = '';

        for (const component of addressComponents) {
          const types = component.types;
          if (types.includes('street_number')) {
            streetNumber = component.long_name;
          }
          if (types.includes('route')) {
            route = component.short_name;
          }
          if (types.includes('locality')) {
            city = component.long_name;
          }
          if (types.includes('administrative_area_level_1')) {
            state = component.short_name;
          }
          if (types.includes('postal_code')) {
            zipCode = component.long_name;
          }
        }

        // Build formatted address
        const formattedAddress = `${streetNumber} ${route}, ${city}, ${state} ${zipCode}`.trim();
        
        // Validate that we have essential components
        const isValid = !!(streetNumber && route && city && state);
        
        setIsValidAddress(isValid);
        
        const placeDetails = {
          streetNumber,
          route,
          city,
          state,
          zipCode,
          geometry: place.geometry,
          placeId: place.place_id,
          address_components: addressComponents
        };

        // Delivery fee pre-check (display only — the server recomputes the
        // authoritative verdict at submit time). Flat $5 within 5 driving
        // miles of the bakery; anything farther or unverifiable is accepted
        // as "quote required" — never blocked, never switched to pickup.
        if (isValid && showDeliveryInfo) {
          setIsCheckingDelivery(true);
          try {
            const quote = await api.getDeliveryQuote(place.formatted_address || formattedAddress);
            setDeliveryInfo(quote);
            onChange(formattedAddress, isValid, placeDetails, quote);
          } catch (error) {
            console.error('Error checking delivery:', error);
            const fallback = { status: 'quote_required', fee: 0, distance_miles: null };
            setDeliveryInfo(fallback);
            onChange(formattedAddress, isValid, placeDetails, fallback);
          } finally {
            setIsCheckingDelivery(false);
          }
        } else {
          onChange(formattedAddress, isValid, placeDetails);
        }

        console.log('✅ Valid address selected:', formattedAddress);
      });

      setAutocomplete(autocompleteInstance);
    } catch (error) {
      console.error('Error initializing Google Maps Autocomplete:', error);
    }
  }, [googleMapsLoaded, autocomplete, onChange, value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // Reset validation when user types manually
    setIsValidAddress(false);
    setDeliveryInfo(null);
    onChange(newValue, false);
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        placeholder={placeholder}
        required={required}
        className={className}
      />
      {googleMapsLoaded && (
        <p className="text-xs text-muted-foreground mt-1">
          {t(
            '💡 Empieza a escribir y selecciona una dirección de las sugerencias',
            '💡 Start typing and select an address from the suggestions'
          )}
        </p>
      )}
      {!googleMapsLoaded && import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
        <p className="text-xs text-muted-foreground mt-1">
          {t('Cargando validación de direcciones...', 'Loading address validation...')}
        </p>
      )}
      {!import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
        <p className="text-xs text-yellow-600 mt-1">
          {t(
            '⚠️ Validación de direcciones no disponible. Ingrese manualmente.',
            '⚠️ Address validation unavailable. Enter manually.'
          )}
        </p>
      )}
      
      {/* Delivery Zone and Fee Info */}
      {showDeliveryInfo && (
        <div className="mt-2">
          {isCheckingDelivery && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('Verificando zona de entrega...', 'Checking delivery zone...')}
            </div>
          )}
          
          {deliveryInfo && !isCheckingDelivery && (
            <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
              {deliveryInfo.status === 'flat' ? (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      {t('Entrega Disponible', 'Delivery Available')}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t('Tarifa de Entrega', 'Delivery Fee')}:
                    </span>
                    <span className="font-semibold">${Number(deliveryInfo.fee ?? 0).toFixed(2)}</span>
                  </div>
                  {deliveryInfo.distance_miles != null && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t('Distancia', 'Distance')}:</span>
                      <span>{deliveryInfo.distance_miles} {t('millas', 'miles')}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-start gap-2 text-amber-600">
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">
                    {t(
                      'Tu dirección está fuera de nuestra zona de tarifa fija de 5 millas. Puedes hacer tu pedido — te confirmaremos el costo de entrega y te enviaremos un enlace de pago.',
                      "Your address is outside our 5-mile flat-fee area. You can still place your order — we'll confirm your delivery cost and send you a payment link."
                    )}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;

