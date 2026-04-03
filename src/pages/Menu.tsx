import { Helmet } from 'react-helmet-async';
import { useLanguage } from '@/contexts/LanguageContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Cake, Coffee, Cookie } from 'lucide-react';
import { LazyImage } from '@/components/optimized/LazyImage';
import EventBookingForm from '@/components/EventBookingForm';

const menuSchema = {
  "@context": "https://schema.org",
  "@type": "FoodEstablishment",
  "name": "Eli's Dulce Tradicion",
  "url": "https://elisbakery.com/menu",
  "hasMenu": {
    "@type": "Menu",
    "name": "Eli's Custom Cakes Menu",
    "description": "Custom cakes for all occasions — birthdays, weddings, quinceañeras, and more",
    "hasMenuSection": [
      {
        "@type": "MenuSection",
        "name": "Custom Cakes / Pasteles Personalizados",
        "description": "Made-to-order cakes in various sizes and flavors",
        "hasMenuItem": [
          {
            "@type": "MenuItem",
            "name": "Small Custom Cake",
            "description": "Small custom cake, serves 8-12 people",
            "offers": { "@type": "Offer", "price": "35.00", "priceCurrency": "USD" }
          },
          {
            "@type": "MenuItem",
            "name": "Medium Custom Cake",
            "description": "Medium custom cake, serves 16-20 people",
            "offers": { "@type": "Offer", "price": "55.00", "priceCurrency": "USD" }
          },
          {
            "@type": "MenuItem",
            "name": "Large Custom Cake",
            "description": "Large custom cake, serves 24-30 people",
            "offers": { "@type": "Offer", "price": "75.00", "priceCurrency": "USD" }
          }
        ]
      }
    ]
  }
};

type MenuProduct = { id?: number; name_es: string; name_en: string; description_es: string; description_en: string; price: number | string; category?: string; image_url?: string; };

const groupProductsByCategory = (products: MenuProduct[]) => {
  const grouped: Record<string, MenuProduct[]> = {};
  products.forEach(product => {
    const cat = product.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(product);
  });
  return Object.keys(grouped).map(catId => ({
    id: catId,
    icon: catId === 'cakes' ? Cake : (catId === 'bread' ? Cookie : Coffee),
    titleES: catId === 'cakes' ? 'Pasteles' : (catId === 'bread' ? 'Pan Dulce' : 'Otros'),
    titleEN: catId === 'cakes' ? 'Cakes' : (catId === 'bread' ? 'Sweet Bread' : 'Other'),
    items: grouped[catId]
  }));
};

const Menu = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#C6A649]/30">
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(menuSchema)}
        </script>
      </Helmet>
      <Navbar />
      <main className="pt-48 pb-32 relative overflow-hidden">
        {/* Background Glows - Cyber Premium Style */}
        <div className="absolute top-0 left-0 w-full h-[1000px] bg-gradient-to-b from-[#C6A649]/10 to-transparent pointer-events-none" />
        <div className="absolute top-[20%] -left-[10%] w-[600px] h-[600px] bg-[#C6A649]/10 rounded-full blur-[150px] pointer-events-none opacity-50" />
        <div className="absolute top-[40%] -right-[10%] w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[130px] pointer-events-none opacity-40" />
        <div className="absolute bottom-[20%] -left-[15%] w-[700px] h-[700px] bg-[#C6A649]/5 rounded-full blur-[180px] pointer-events-none opacity-30" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mb-20 text-center">
            <span className="inline-block px-4 py-1 rounded-full border border-[#C6A649]/30 bg-[#C6A649]/10 text-[#C6A649] text-sm font-bold tracking-[0.2em] uppercase mb-8 animate-fade-in shadow-[0_0_20px_rgba(198,166,73,0.15)]">
              {t('Nuestros Sabores', 'Our Flavors')}
            </span>
            <h1 className="mb-8 font-display text-6xl md:text-8xl font-black tracking-tight animate-fade-in uppercase">
              {t('El', 'The')} <span className="text-[#C6A649] drop-shadow-[0_0_15px_rgba(198,166,73,0.3)]">{t('Menú', 'Menu')}</span>
            </h1>
            <div className="mx-auto mb-10 h-1.5 w-40 rounded-full bg-gradient-to-r from-transparent via-[#C6A649] to-transparent shadow-[0_0_10px_rgba(198,166,73,0.5)]" />
            <p className="mx-auto max-w-2xl font-sans text-xl text-gray-400 font-light leading-relaxed animate-fade-in animation-delay-300">
              {t('Deliciosos sabores tradicionales. Hechos con amor y los mejores ingredientes.', 'Delicious traditional flavors. Made with love and the finest ingredients.')}
            </p>
          </div>


          {/* Static Menu Sections - Cyber Premium Redesign */}
          <div className="space-y-40 mb-40">

            {/* Celebration & Wedding Cakes */}
            <section className="grid md:grid-cols-2 gap-16 items-center relative">
              <div className="order-2 md:order-1 space-y-8 animate-fade-in">
                <div className="flex items-center gap-6 mb-4">
                  <div className="p-4 rounded-2xl bg-[#C6A649]/10 text-[#C6A649] border border-[#C6A649]/20 shadow-lg">
                    <Cake className="w-10 h-10" />
                  </div>
                  <h2 className="font-display text-4xl md:text-5xl font-black text-white-900 tracking-tight leading-none">
                    {t('Pasteles de', 'Pasteles de')} <br />
                    <span className="text-[#C6A649]">{t('Celebración y Bodas', 'Celebration & Wedding Cakes')}</span>
                  </h2>
                </div>

                <p className="text-xl text-gray-400 font-light leading-relaxed">
                  {t(
                    'Nos especializamos en pasteles personalizados con decoraciones elaboradas, flores frescas y un toque auténtico mexicano. Perfecto para bodas, quinceañeras y todas las ocasiones especiales.',
                    'We specialize in custom celebration cakes with elaborate decorations, fresh flowers, and authentic Mexican flair. Perfect for weddings, quinceañeras, birthdays, and all special occasions.'
                  )}
                </p>

                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-10 md:p-12 shadow-2xl relative overflow-hidden group">
                  <div className="absolute -right-20 -top-20 h-64 w-64 bg-[#C6A649]/5 rounded-full blur-3xl group-hover:bg-[#C6A649]/10 transition-colors" />

                  <h3 className="font-display text-2xl font-black text-[#C6A649] mb-8 uppercase tracking-widest">
                    {t('Diseño Personalizado', 'Custom Design Cakes')}
                  </h3>
                  <ul className="space-y-4 mb-10">
                    {[
                      ['Flores frescas decorativas', 'Fresh floral decorations'],
                      ['Estilo auténtico mexicano', 'Colorful Mexican-inspired designs'],
                      ['Temas y mensajes únicos', 'Custom messages and themes'],
                      ['Fruta fresca de temporada', 'Fresh fruit toppings'],
                      ['Acentos en oro comestible', 'Elegant gold accents']
                    ].map(([es, en], i) => (
                      <li key={i} className="flex items-center gap-4 text-gray-300 text-lg">
                        <div className="h-2 w-2 rounded-full bg-[#C6A649] shadow-[0_0_8px_rgba(198,166,73,0.8)]" />
                        <span>{t(es, en)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-8 mt-10">
                    <Button className="bg-[#C6A649] text-black font-black hover:bg-white hover:scale-105 transition-all text-xl px-12 h-16 rounded-full shadow-[0_0_30px_rgba(198,166,73,0.3)] shadow-glow">
                      {t('Cotizar Ahora', 'Get a Quote')}
                    </Button>
                    <p className="text-sm text-gray-500 italic font-medium">
                      * {t('Requiere pedido anticipado', 'Pre-order recommended')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="order-1 md:order-2 relative group-perspective scale-95 hover:scale-100 transition-transform duration-700">
                <div className="absolute -inset-4 bg-gradient-to-tr from-[#C6A649]/30 to-transparent blur-2xl rounded-[3rem] opacity-30 group-hover:opacity-60 transition-opacity duration-700" />
                <div className="relative aspect-[4/5] rounded-[2.5rem] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10 rotate-2 group-hover:rotate-0 transition-transform duration-700">
                  <LazyImage
                    src="/images/menu/wedding_cake_display_1768064340098.png"
                    alt="Wedding Cake"
                    className="w-full h-full object-cover transform scale-105 group-hover:scale-100 transition-transform duration-1000"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
                  <div className="absolute bottom-10 left-10 right-10">
                    <p className="text-white font-serif text-2xl italic leading-tight">
                      {t('"La pieza central de tu gran día"', '"The centerpiece of your big day"')}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Traditional Pan Dulce */}
            <section className="grid md:grid-cols-2 gap-20 items-center">
              <div className="order-1 relative group hover:-rotate-1 transition-transform duration-700">
                <div className="absolute -inset-4 bg-gradient-to-br from-amber-500/20 to-transparent blur-2xl rounded-[3rem] opacity-30" />
                <div className="relative aspect-square rounded-[3rem] overflow-hidden shadow-2xl border border-white/10">
                  <LazyImage
                    src="/images/menu/pan_dulce_basket_1768064358293.png"
                    alt="Pan Dulce Basket"
                    className="w-full h-full object-cover transform transition duration-1000 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                </div>
              </div>

              <div className="order-2 space-y-10">
                <div className="flex items-center gap-6">
                  <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <Cookie className="w-10 h-10" />
                  </div>
                  <h2 className="font-display text-4xl md:text-5xl font-black text-white tracking-tight leading-none uppercase">
                    {t('Pan Dulce', 'Traditional')} <br />
                    <span className="text-amber-500">{t('Tradicional', 'Pan Dulce')}</span>
                  </h2>
                </div>

                <p className="text-xl text-gray-400 font-light leading-relaxed">
                  {t('Horneado fresco todos los días usando recetas tradicionales mexicanas transmitidas por generaciones.', 'Fresh baked daily using traditional Mexican recipes passed down through generations.')}
                </p>

                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-8 hover:border-[#C6A649]/50 transition-all duration-500 group/card">
                    <div className="mb-4 text-amber-500 font-black text-sm uppercase tracking-widest">{t('El Favorito', 'The Favorite')}</div>
                    <h4 className="font-display text-2xl font-black text-white mb-3">{t('Conchas', 'Conchas')}</h4>
                    <p className="text-gray-400 leading-relaxed mb-6 group-hover/card:text-gray-200 transition-colors">
                      {t('Nuestro pan dulce insignia con cubierta clásica de azúcar en patrones de concha.', 'Our signature sweet bread with classic shell-patterned sugar topping.')}
                    </p>
                    <div className="flex gap-3">
                      <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-gray-400">Chocolate</span>
                      <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-gray-400">Vainilla</span>
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-3xl p-8 hover:border-[#C6A649]/50 transition-all duration-500 group/card">
                    <div className="mb-4 text-[#C6A649] font-black text-sm uppercase tracking-widest">{t('Surtido Diario', 'Daily Variety')}</div>
                    <h4 className="font-display text-2xl font-black text-white mb-3">{t('Pan Variado', 'Assorted Bread')}</h4>
                    <p className="text-gray-400 leading-relaxed mb-6 group-hover/card:text-gray-200 transition-colors">
                      {t('Una selección que cambia diariamente para sorprender tu paladar cada mañana.', 'A daily changing variety to surprise your palate every single morning.')}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-gray-400">Donas</span>
                      <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-gray-400">Orejas</span>
                      <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-gray-400">Cuernitos</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-6 bg-[#C6A649]/5 border border-[#C6A649]/20 rounded-2xl shadow-inner">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C6A649]/20 text-[#C6A649]">
                    <Cake className="h-5 w-5" />
                  </div>
                  <p className="text-lg font-bold text-[#C6A649]">
                    {t('Te esperamos hoy para la selección más fresca', 'Visit us today for the freshest daily selection')}
                  </p>
                </div>
              </div>
            </section>

            {/* Dessert Services & Events - Redesigned for Impact */}
            <section className="relative rounded-[3rem] overflow-hidden shadow-[0_0_60px_rgba(198,166,73,0.15)] group border border-white/10 w-full bg-stone-900">
              <div className="absolute inset-0">
                <img
                  src="/images/menu/dessert_table_spread_1768064377177.png"
                  alt="Dessert Table"
                  className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                />
                {/* Refined gradient overlay for better contrast and depth */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/30 md:bg-gradient-to-r" />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-all duration-700" />
              </div>

              <div className="relative z-10 py-20 px-6 md:px-12 lg:px-20 text-left md:text-center max-w-5xl mx-auto space-y-8">
                <div className="inline-flex p-5 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 mb-2 shadow-2xl">
                  <Coffee className="w-10 h-10 text-[#C6A649]" />
                </div>
                <h2 className="font-display text-4xl md:text-6xl font-black text-white uppercase tracking-tighter leading-none">
                  {t('Mesas de Postres', 'Dessert Services')} <br />
                  <span className="text-[#C6A649]">& {t('Eventos', 'Events')}</span>
                </h2>
                <p className="text-xl text-gray-200 font-light leading-relaxed max-w-3xl mx-auto drop-shadow-md">
                  {t(
                    'Creamos experiencias dulces e inolvidables. Desde mesas de postres coordinadas hasta banquetes personalizados, elevamos tu evento con el auténtico sabor de Eli\'s.',
                    'We create sweet and unforgettable experiences. From coordinated dessert tables to custom catering, we elevate your event with the authentic taste of Eli\'s.'
                  )}
                </p>

                <div className="flex flex-wrap justify-center gap-3 pt-2">
                  {['Weddings', 'Quinceañeras', 'Corporate', 'Birthdays'].map((tag) => (
                    <span key={tag} className="px-5 py-2 rounded-full bg-black/40 border border-white/10 text-white font-bold text-xs uppercase tracking-widest backdrop-blur-md">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="pt-8">
                  <Button size="lg" className="h-16 px-12 rounded-full bg-white text-black font-black text-lg hover:bg-[#C6A649] hover:scale-105 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)]" asChild>
                    <a href="tel:+16102796200">
                      {t('Solicitar Cotización', 'Book Your Event')}
                    </a>
                  </Button>
                </div>
              </div>
            </section>
          </div>

          <EventBookingForm />
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Menu;
