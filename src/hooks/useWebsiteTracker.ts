import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '@/lib/api';

export const useWebsiteTracker = () => {
    const location = useLocation();

    // Track Page Views
    useEffect(() => {
        const trackPageView = async () => {
            try {
                await api.trackEvent('page_view', {
                    path: location.pathname,
                    search: location.search,
                    referrer: document.referrer
                });
            } catch (error) {
                // Silently fail for analytics
                console.warn('Failed to track page view', error);
            }
        };

        trackPageView();
    }, [location]);

    // Track specific clicks (optional, global listener)
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Track clicks on buttons or links
            const closest = target.closest('button, a');
            if (closest) {
                const label = closest.getAttribute('aria-label') || (closest as HTMLElement).innerText || closest.getAttribute('href');
                if (label) {
                    api.trackEvent('click', {
                        tag: closest.tagName,
                        label: label.substring(0, 50), // Limit length
                        path: location.pathname
                    }).catch(() => { });
                }
            }
        };

        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [location]);
};
