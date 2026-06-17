// src/components/order/steps/orderStepConstants.ts
// Shared constants and utilities used across order step components

export const FALLBACK_CAKE_SIZES = [
  { value: '6-round', label: '6" Round', labelEs: '6" Redondo', price: 30, serves: '6-8', featured: false },
  { value: '8-round', label: '8" Round', labelEs: '8" Redondo', price: 35, serves: '10-12', featured: false },
  { value: '10-round', label: '10" Round', labelEs: '10" Redondo', price: 55, serves: '20-25', featured: true },
  { value: '12-round', label: '12" Round', labelEs: '12" Redondo', price: 85, serves: '30-35', featured: false },
  { value: 'quarter-sheet', label: '1/4 Sheet', labelEs: '1/4 Plancha', price: 75, serves: '20-30', featured: false },
  { value: 'half-sheet', label: '1/2 Sheet', labelEs: '1/2 Plancha', price: 135, serves: '40-50', featured: false },
  { value: 'full-sheet', label: 'Full Sheet', labelEs: 'Plancha Completa', price: 240, serves: '90-100', featured: false },
  { value: '8-hard-shape', label: '8" Hard Shape', labelEs: '8" Forma Especial', price: 50, serves: '10-12', featured: false },
];

export const FALLBACK_BREAD_TYPES = [
  { value: 'tres-leches', label: '3 Leches', desc: 'Moist & Traditional' },
  { value: 'chocolate', label: 'Chocolate', desc: 'Rich & Decadent' },
  { value: 'vanilla', label: 'Regular', desc: 'Classic Vanilla' },
  { value: 'red-velvet', label: 'Red Velvet', desc: 'Rich & Velvety' },
  { value: 'yellow-cake', label: 'Yellow Cake', desc: 'Classic & Buttery' },
  { value: 'carrot-cake', label: 'Carrot Cake', desc: 'Spiced & Moist' },
];

export const FALLBACK_FILLINGS = [
  { value: 'strawberry', label: 'Fresa', sub: 'Strawberry', premium: false },
  { value: 'chocolate-chip', label: 'Choco Chip', sub: 'Dark Chocolate', premium: false },
  { value: 'mocha', label: 'Mocha', sub: 'Coffee Blend', premium: false },
  { value: 'napolitano', label: 'Napolitano', sub: 'Mix', premium: false },
  { value: 'pecan', label: 'Nuez', sub: 'Pecan', premium: false },
  { value: 'coconut', label: 'Coco', sub: 'Coconut', premium: false },
  { value: 'pineapple', label: 'Piña', sub: 'Pineapple', premium: false },
  { value: 'pina-colada', label: 'Piña Colada', sub: 'Tropical', premium: false },
  { value: 'peach', label: 'Durazno', sub: 'Peach', premium: false },
  { value: 'tiramisu', label: 'Tiramisu', sub: 'Italian Style', premium: true },
  { value: 'relleno-flan', label: 'Relleno de Flan', sub: 'Flan Filling', premium: true },
  { value: 'oreo', label: 'Oreo', sub: 'Cookies & Cream', premium: false },
  { value: 'zarzamora', label: 'Zarzamora', sub: 'Blackberry', premium: false },
  { value: 'chocolate-mousse', label: 'Mousse de Chocolate', sub: 'Chocolate Mousse', premium: false },
  { value: 'strawberry-mousse', label: 'Mousse de Fresa', sub: 'Strawberry Mousse', premium: false },
  { value: 'dulce-de-leche', label: 'Dulce de Leche', sub: 'Caramel', premium: false },
  { value: 'strawberry-shortcake', label: 'Strawberry Shortcake', sub: 'Fresas con Crema', premium: false },
];

// Premium filling size options with upcharges (fallback)
// Option A: 8" and 10" premium upcharge is $10; full-sheet upcharge removed.
// Only valid while Tiramisu and Relleno de Flan are the sole premium fillings.
export const FALLBACK_PREMIUM_FILLING_OPTIONS = [
  { value: '8-round', label: '8"', labelEs: '8"', upcharge: 10 },
  { value: '10-round', label: '10"', labelEs: '10"', upcharge: 10 },
];

export function formatTimeDisplay(time: string): string {
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}
