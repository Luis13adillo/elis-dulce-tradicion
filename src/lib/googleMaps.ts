// Google Maps URL helper - separate file to avoid regex parsing issues
export const buildGoogleMapsUrl = (address: string): string => {
  // Use URL constructor which handles slashes internally
  try {
    const protocol = 'https:';
    const domain = 'www.google.com';
    const path1 = 'maps';
    const path2 = 'search';
    const slash = String.fromCharCode(47);
    const fullUrl = protocol + slash + slash + domain + slash + path1 + slash + path2;
    const url = new URL(fullUrl);
    url.searchParams.set('api', '1');
    url.searchParams.set('query', address);
    return url.toString();
  } catch {
    // Fallback - simple format
    const protocol = 'https:';
    const domain = 'www.google.com';
    const path = 'maps';
    const slash = String.fromCharCode(47);
    const question = String.fromCharCode(63);
    const base = protocol + slash + slash + domain + slash + path;
    const query = question + 'q=' + encodeURIComponent(address);
    return base + query;
  }
};

// Distance/fee calculation moved SERVER-SIDE on 2026-07-29
// (supabase/functions/_shared/delivery.ts — the one authoritative bakery
// origin). This file previously carried the pre-move Bensalem coordinates
// (40.1063, -74.9526) labeled with the Norristown address; the browser no
// longer measures delivery distance at all.

/**
 * Geocode an address to get coordinates and formatted address
 */
export async function geocodeAddress(address: string): Promise<{
  lat: number;
  lng: number;
  formattedAddress: string;
  zipCode: string;
  city: string;
  state: string;
} | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    console.warn('Google Maps API key not configured');
    return null;
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.results[0]) {
      const result = data.results[0];
      const location = result.geometry.location;
      
      // Extract address components
      let zipCode = '';
      let city = '';
      let state = '';
      
      result.address_components.forEach((component: any) => {
        if (component.types.includes('postal_code')) {
          zipCode = component.long_name;
        }
        if (component.types.includes('locality')) {
          city = component.long_name;
        }
        if (component.types.includes('administrative_area_level_1')) {
          state = component.short_name;
        }
      });
      
      return {
        lat: location.lat,
        lng: location.lng,
        formattedAddress: result.formatted_address,
        zipCode,
        city,
        state,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}

/**
 * Validate address using Google Places API
 */
export async function validateAddress(address: string): Promise<{
  isValid: boolean;
  formattedAddress?: string;
  placeId?: string;
  zipCode?: string;
  city?: string;
  state?: string;
  error?: string;
}> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    return { isValid: false, error: 'Google Maps API key not configured' };
  }

  try {
    // Use Places API to find place
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodedAddress}&inputtype=textquery&fields=formatted_address,place_id,address_components,geometry&key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.candidates[0]) {
      const candidate = data.candidates[0];
      
      let zipCode = '';
      let city = '';
      let state = '';
      
      candidate.address_components?.forEach((component: any) => {
        if (component.types.includes('postal_code')) {
          zipCode = component.long_name;
        }
        if (component.types.includes('locality')) {
          city = component.long_name;
        }
        if (component.types.includes('administrative_area_level_1')) {
          state = component.short_name;
        }
      });
      
      return {
        isValid: true,
        formattedAddress: candidate.formatted_address,
        placeId: candidate.place_id,
        zipCode,
        city,
        state,
      };
    }
    
    return { isValid: false, error: 'Address not found' };
  } catch (error) {
    console.error('Error validating address:', error);
    return { isValid: false, error: 'Error validating address' };
  }
}

