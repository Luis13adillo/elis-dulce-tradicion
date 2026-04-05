import { Helmet } from 'react-helmet-async';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import HeroSection from '@/components/home/HeroSection';
import AboutSection from '@/components/home/AboutSection';
import CustomCakeBanner from '@/components/home/CustomCakeBanner';
import InstagramReelsSection from '@/components/home/InstagramReelsSection';
import CakeSection from '@/components/home/CakeSection';

import { VisitUs } from '@/components/home/VisitUs';
import TestimonialCarousel from '@/components/testimonials/TestimonialCarousel';

const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "Bakery",
  "name": "Eli's Dulce Tradicion",
  "image": "https://elisbakery.com/og-image.jpg",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "324 W Marshall St",
    "addressLocality": "Norristown",
    "addressRegion": "PA",
    "postalCode": "19401",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 40.1218,
    "longitude": -75.3448
  },
  "telephone": "+16102796200",
  "url": "https://elisbakery.com",
  "priceRange": "$$",
  "servesCuisine": "Bakery",
  "currenciesAccepted": "USD",
  "paymentAccepted": "Credit Card",
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "09:00",
      "closes": "18:00"
    }
  ]
};

const Index = () => {
  return (
    <div className="min-h-screen bg-black">
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(localBusinessSchema)}
        </script>
      </Helmet>
      <Navbar />
      <HeroSection />
      <AboutSection />
      <CustomCakeBanner />
      <InstagramReelsSection />
      <CakeSection />
      <TestimonialCarousel />
      <VisitUs />
      <Footer />
    </div>
  );
};

export default Index;
