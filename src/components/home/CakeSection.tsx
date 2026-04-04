import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { memo, useState, useEffect } from 'react';
import { Heart } from 'lucide-react';

// Assets
import butterflyCake from '@/assets/products/cakes/ButterflyBirthdayCake.jpg';
import tresLeches from '@/assets/products/cakes/tres-leches.png';
import chocolateCake from '@/assets/products/cakes/chocolate-fiesta.png';
import weddingCake from '@/assets/products/cakes/weddingCake.jpg';

import pawPatrol from '@/assets/products/cakes/PawPatrolBirthdayCake.jpg';
import realMadrid from '@/assets/products/cakes/RealMadridBirthdayCake.jpg';
import floralWedding from '@/assets/products/cakes/floral-wedding.png';
import babyShower from '@/assets/products/cakes/baby-shower.png';

const CakeSection = memo(() => {
    const { t } = useLanguage();

    const cakes = [
        {
            id: 1,
            title: 'DESIGN YOUR OWN CAKE',
            price: 'FROM $45.00',
            image: butterflyCake,
            bgColor: '#FFEDF4', // Pinkish
        },
        {
            id: 2,
            title: 'CLASSIC TRES LECHES CAKE',
            price: 'FROM $35.00',
            image: tresLeches,
            bgColor: '#FDF5E6', // Beige
        },
        {
            id: 3,
            title: 'CHOCOLATE FIESTA CAKE',
            price: 'FROM $40.00',
            image: chocolateCake,
            bgColor: '#E6E6FA', // Lavender
        },
        {
            id: 4,
            title: 'WEDDING CAKE - CUSTOM DESIGN',
            price: 'FROM $150.00',
            image: weddingCake,
            bgColor: '#E0FFFF', // Light Cyan
        },
        {
            id: 5,
            title: 'KIDS THEMED CAKES',
            price: 'FROM $55.00',
            image: pawPatrol,
            bgColor: '#E6F3FF', // Light Blue
        },
        {
            id: 6,
            title: 'SPORTS FAN CAKES',
            price: 'FROM $50.00',
            image: realMadrid,
            bgColor: '#F5F5F5', // Light Gray
        },
        {
            id: 7,
            title: 'ELEGANT FLORAL CAKES',
            price: 'FROM $120.00',
            image: floralWedding,
            bgColor: '#FFF0F0', // Very light pink
        },
        {
            id: 8,
            title: 'BABY SHOWER SPECIALS',
            price: 'FROM $65.00',
            image: babyShower,
            bgColor: '#FFFFE0', // Light Yellow
        },
    ];

    const [currentPage, setCurrentPage] = useState(0);
    const itemsPerPage = 4;
    const totalPages = Math.ceil(cakes.length / itemsPerPage);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentPage((prev) => (prev + 1) % totalPages);
        }, 5000);
        return () => clearInterval(interval);
    }, [totalPages]);

    const handleDotClick = (index: number) => {
        setCurrentPage(index);
    };

    const displayedCakes = cakes.slice(
        currentPage * itemsPerPage,
        (currentPage + 1) * itemsPerPage
    );

    return (
        <section className="py-16 md:py-24 lg:py-32 bg-black relative overflow-hidden">
            {/* Background Glows */}
            <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-[#C6A649]/5 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[100px] pointer-events-none" />

            <div className="container mx-auto px-4 max-w-7xl relative z-10">

                {/* Section Header */}
                <div className="mb-10 md:mb-16 lg:mb-20 text-center animate-fade-in">
                    <span className="text-sm font-bold tracking-[0.3em] text-[#C6A649] uppercase mb-4 block">
                        {t('Arte en Azúcar', 'Sugar Artistry')}
                    </span>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-black text-white mb-6 tracking-tighter uppercase leading-none">
                        ELI'S <span className="text-[#C6A649] drop-shadow-[0_0_15px_rgba(198,166,73,0.3)]">PASTELES</span>
                    </h2>
                    <div className="h-1.5 w-32 bg-gradient-to-r from-transparent via-[#C6A649] to-transparent mx-auto rounded-full shadow-[0_0_10px_rgba(198,166,73,0.5)]"></div>
                    <p className="mt-8 text-gray-400 font-medium tracking-[0.2em] text-sm uppercase">
                        {t('El Corazón de tu Celebración', 'Celebration Centerpieces')}
                    </p>
                </div>

                {/* Products Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-20 min-h-[500px]">
                    {displayedCakes.map((cake) => (
                        <div key={cake.id} className="flex flex-col group cursor-pointer animate-fade-in">
                            {/* Card Image Area */}
                            <div
                                className="relative rounded-[2.5rem] overflow-hidden aspect-square shadow-2xl transition-all duration-700 bg-white/5 border border-white/10 group-hover:-translate-y-4 group-hover:border-[#C6A649]/30 group-hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                            >
                                {/* Decorative color glow inside the card */}
                                <div
                                    className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity duration-700 bg-[radial-gradient(circle_at_center,_var(--gold-light)_0%,_transparent_70%)]"
                                />

                                {/* Tag */}
                                <div className="absolute top-6 left-6 z-10">
                                    <span className="bg-[#C6A649]/20 backdrop-blur-md border border-[#C6A649]/30 text-[#C6A649] text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest">
                                        Norristown Delivery
                                    </span>
                                </div>

                                {/* Heart Icon */}
                                <div className="absolute top-6 right-6 bg-white/5 backdrop-blur-md border border-white/10 p-3 rounded-2xl z-10 hover:bg-[#C6A649]/20 transition-all group-hover:scale-110">
                                    <Heart className="w-5 h-5 text-[#C6A649]" />
                                </div>

                                {/* Image */}
                                <div className="w-full h-full p-12 flex items-center justify-center relative z-0">
                                    <img
                                        src={cake.image}
                                        alt={cake.title}
                                        className="w-full h-full object-contain filter drop-shadow-[0_20px_30px_rgba(0,0,0,0.4)] transition-transform duration-1000 group-hover:scale-110"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-60" />
                                </div>
                            </div>

                            {/* Product Info */}
                            <div className="mt-8 text-center px-4">
                                <h3 className="font-black text-lg text-white uppercase tracking-tight leading-tight group-hover:text-[#C6A649] transition-colors">
                                    {cake.title}
                                </h3>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Carousel Indicators */}
                <div className="flex justify-center gap-4 mb-20">
                    {Array.from({ length: totalPages }).map((_, index) => (
                        <button
                            key={index}
                            onClick={() => handleDotClick(index)}
                            className={`h-2 rounded-full transition-all duration-500 ${currentPage === index ? 'w-12 bg-[#C6A649] shadow-[0_0_10px_rgba(198,166,73,0.5)]' : 'w-2 bg-white/20 hover:bg-white/40'
                                }`}
                            aria-label={`Go to page ${index + 1}`}
                        />
                    ))}
                </div>

                {/* Description & CTA */}
                <div className="max-w-4xl mx-auto text-center space-y-8 md:space-y-12 animate-fade-in">
                    <p className="text-gray-400 font-light leading-relaxed text-base md:text-xl lg:text-2xl italic font-serif">
                        {t(
                            "Grandes pasteles de celebración son el alma de Eli's Bakery Cafe. Horneados y decorados con un toque auténtico mexicano. El centro de atención para tu fiesta o boda.",
                            "Great Celebration Cakes are the heart of Eli’s Bakery Cafe. Freshly baked and expertly decorated with authentic Mexican flair. The centerpiece for your birthday party, quinceañera, wedding, or special occasion."
                        )}
                    </p>

                    <Button
                        asChild
                        size="lg"
                        className="rounded-full bg-white text-black hover:bg-[#C6A649] px-8 py-4 md:px-14 md:py-6 font-black text-sm md:text-lg tracking-widest shadow-[0_0_30px_rgba(255,255,255,0.2)] transition-all hover:scale-105"
                    >
                        <Link to="/order" className="flex items-center gap-4">
                            {t('ENCUENTRA TU PASTEL PERFECTO', 'FIND YOUR PERFECT CAKE')}
                            <span className="text-2xl">🎂</span>
                        </Link>
                    </Button>
                </div>

            </div>
        </section>
    );
});

CakeSection.displayName = 'CakeSection';

export default CakeSection;
