import { useState, useCallback } from 'react';

interface GeolocationPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

interface UseGeolocationOptions {
  onSuccess?: (position: GeolocationPosition) => void;
  onError?: (error: GeolocationPositionError) => void;
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

/**
 * Hook for geolocation access
 */
export function useGeolocation(options: UseGeolocationOptions = {}) {
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<GeolocationPositionError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      const err = Object.assign(new Error('Geolocation is not supported'), { code: 0 }) as unknown as GeolocationPositionError;
      setError(err);
      options.onError?.(err);
      return;
    }

    setIsLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (geoPosition) => {
        const pos: GeolocationPosition = {
          latitude: geoPosition.coords.latitude,
          longitude: geoPosition.coords.longitude,
          accuracy: geoPosition.coords.accuracy,
        };
        setPosition(pos);
        setIsLoading(false);
        options.onSuccess?.(pos);
      },
      (err) => {
        setError(err);
        setIsLoading(false);
        options.onError?.(err);
      },
      {
        enableHighAccuracy: options.enableHighAccuracy ?? true,
        timeout: options.timeout ?? 10000,
        maximumAge: options.maximumAge ?? 0,
      }
    );
  }, [options]);

  return {
    position,
    error,
    isLoading,
    getCurrentPosition,
  };
}
