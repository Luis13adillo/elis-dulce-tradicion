import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { memo } from 'react';
import sprite from '@/assets/products/featured-sprite.png';

const FeaturedProducts = memo(() => {
  const { t } = useLanguage();

  const products = [
    {
      id: 1,
      title: '6 X CONCHAS, THE CLASSICS',
      price: 'FROM $18.00',
      bgPosition: '0% 0%',
    },
    {
      id: 2,
      title: '12 X PAN DULCE, THE ULTIMATE FAVORITES',
      price: 'FROM $32.00',
      bgPosition: '33.35% 0%',
    },
    {
      id: 3,
      title: '6 X SPECIALTY PASTRIES, THE CELEBRATION BOX',
      price: 'FROM $24.00',
      bgPosition: '66.65% 0%',
    },
    {
      id: 4,
      title: '18 X PAN DULCE, THE FAMILY BOX',
      price: 'FROM $45.00',
      bgPosition: '100% 0%',
    },
  ];

  return (
    <section className="py-16 md:py-24 lg:py-32 bg-black relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#C6A649]/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 max-w-7xl relative z-10">

        {/* Section Header */}
        <div className="mb-20 text-center animate-fade-in">
          <span className="text-sm font-bold tracking-[0.3em] text-[#C6A649] uppercase mb-4 block">
            {t('Lo Más Vendido', 'Best Sellers')}
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-black text-white mb-6 tracking-tighter uppercase">
            ELI'S <span className="text-[#C6A649] drop-shadow-[0_0_15px_rgba(198,166,73,0.3)]">PAN DULCE</span>
          </h2>
          <div className="h-1.5 w-32 bg-gradient-to-r from-transparent via-[#C6A649] to-transparent mx-auto rounded-full shadow-[0_0_10px_rgba(198,166,73,0.5)]"></div>
          <p className="mt-8 text-gray-400 font-medium tracking-[0.2em] text-sm uppercase">
            {t('Horneado Fresco Cada Mañana', 'Freshly Baked Every Morning')}
          </p>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6 lg:gap-8 mb-12 md:mb-16 lg:mb-20">
          {products.map((product) => (
            <div key={product.id} className="flex flex-col group cursor-pointer animate-fade-in">
              {/* Card Image Area (Sprite) */}
              <div className="relative rounded-3xl overflow-hidden bg-white/5 border border-white/10 shadow-2xl transition-all duration-500 group-hover:-translate-y-3 group-hover:border-[#C6A649]/30 group-hover:shadow-[0_20px_40px_rgba(198,166,73,0.15)]">
                <div
                  className="w-full aspect-square bg-no-repeat transition-transform duration-700 group-hover:scale-110 brightness-90 group-hover:brightness-100"
                  style={{
                    backgroundImage: `url(${sprite})`,
                    backgroundSize: '400% auto', // 4 images width
                    backgroundPosition: product.bgPosition,
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60" />
              </div>

              {/* Product Info */}
              <div className="mt-8 text-center px-4">
                <h3 className="font-black text-lg text-white uppercase tracking-tight leading-tight group-hover:text-[#C6A649] transition-colors">
                  {product.title}
                </h3>
              </div>
            </div>
          ))}
        </div>

        {/* Description & CTA */}
        <div className="max-w-4xl mx-auto text-center space-y-8 md:space-y-12 animate-fade-in">
          <p className="text-gray-400 font-light leading-relaxed text-xl md:text-2xl italic font-serif">
            {t(
              "El Pan Dulce de Eli’s Bakery Cafe es algo especial – nos inspiramos en los panes dulces tradicionales mexicanos para crear la experiencia definitiva. Fresco, auténtico y hecho con los mejores ingredientes.",
              "Eli’s Bakery Cafe Pan Dulce are kind of a big deal – we took inspiration from the traditional Mexican sweet breads we love to create the ultimate Pan Dulce experience. Fresh, authentic, and made with the finest ingredients."
            )}
          </p>

          <Button
            asChild
            size="lg"
            className="rounded-full bg-white text-black hover:bg-[#C6A649] px-8 py-4 md:px-14 md:py-8 font-black text-base md:text-lg tracking-widest shadow-[0_0_30px_rgba(255,255,255,0.2)] transition-all hover:scale-105"
          >
            <Link to="/order" className="flex items-center gap-4">
              {t('PAN DULCE FRESCO MAÑANA', 'NEXT DAY FRESH PAN DULCE')}
              <img src="https://em-content.zobj.net/source/apple/391/croissant_1f950.png" alt="croissant" className="w-6 h-6 inline-block" />
            </Link>
          </Button>
        </div>

      </div>
    </section>
  );
});

FeaturedProducts.displayName = 'FeaturedProducts';

export default FeaturedProducts;
