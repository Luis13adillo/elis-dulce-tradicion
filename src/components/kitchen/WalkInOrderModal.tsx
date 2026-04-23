import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// 30-min time slots 9:00 AM – 8:00 PM
const TIME_SLOTS: string[] = [];
for (let h = 9; h < 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}
TIME_SLOTS.push('20:00');

const CAKE_SIZES = ['6"', '8"', '10"', '12"', 'Sheet'];

const formatTimeLabel = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
};

const getTomorrowDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

interface WalkInOrderModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  darkMode?: boolean;
}

interface FormState {
  customer_name: string;
  customer_phone: string;
  theme: string;
  cake_size: string;
  total_amount: string;
  date_needed: string;
  time_needed: string;
  delivery_option: 'pickup' | 'delivery';
  delivery_address: string;
}

const EMPTY_FORM: FormState = {
  customer_name: '',
  customer_phone: '',
  theme: '',
  cake_size: '',
  total_amount: '',
  date_needed: getTomorrowDate(),
  time_needed: '10:00',
  delivery_option: 'pickup',
  delivery_address: '',
};

export const WalkInOrderModal = ({
  open,
  onClose,
  onSuccess,
  darkMode = false,
}: WalkInOrderModalProps) => {
  const { t } = useLanguage();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (field: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleClose = () => {
    setForm(EMPTY_FORM);
    onClose();
  };

  const validate = () => {
    if (!form.customer_name.trim()) return t('Nombre requerido', 'Customer name is required');
    if (!form.customer_phone.trim()) return t('Teléfono requerido', 'Phone number is required');
    if (!form.theme.trim()) return t('Descripción del pastel requerida', 'Cake description is required');
    if (!form.cake_size) return t('Tamaño requerido', 'Cake size is required');
    const amount = parseFloat(form.total_amount);
    if (!form.total_amount || isNaN(amount) || amount <= 0) return t('Precio inválido', 'Invalid price');
    if (!form.date_needed) return t('Fecha requerida', 'Date needed is required');
    if (!form.time_needed) return t('Hora requerida', 'Time is required');
    if (form.delivery_option === 'delivery' && !form.delivery_address.trim())
      return t('Dirección requerida para entrega', 'Delivery address is required');
    return null;
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) { toast.error(error); return; }

    setIsSubmitting(true);
    try {
      const total = parseFloat(form.total_amount);
      await api.createOrder({
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        theme: form.theme.trim(),
        cake_size: form.cake_size,
        total_amount: total,
        subtotal: total,
        delivery_fee: 0,
        tax_amount: 0,
        date_needed: form.date_needed,
        time_needed: form.time_needed,
        delivery_option: form.delivery_option,
        delivery_address: form.delivery_option === 'delivery' ? form.delivery_address.trim() : null,
        payment_status: 'paid',
        payment_method: 'cash',
        status: 'confirmed',
        consent_given: true,
      });
      toast.success(t('Orden creada', 'Walk-in order created'));
      handleClose();
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || t('Error al crear la orden', 'Failed to create order'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls = cn(
    'w-full',
    darkMode
      ? 'bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus-visible:ring-green-500'
      : ''
  );
  const labelCls = cn('text-sm font-medium', darkMode ? 'text-slate-200' : 'text-gray-700');

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        className={cn(
          'max-w-lg max-h-[90vh] overflow-y-auto',
          darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''
        )}
      >
        <DialogHeader>
          <DialogTitle className={darkMode ? 'text-white' : ''}>
            {t('Nueva Orden en Tienda', 'New Walk-In Order')}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Customer Name */}
          <div className="grid gap-1.5">
            <Label className={labelCls}>{t('Nombre del cliente *', 'Customer Name *')}</Label>
            <Input
              className={inputCls}
              value={form.customer_name}
              onChange={(e) => set('customer_name', e.target.value)}
              placeholder={t('Nombre completo', 'Full name')}
            />
          </div>

          {/* Phone */}
          <div className="grid gap-1.5">
            <Label className={labelCls}>{t('Teléfono *', 'Phone *')}</Label>
            <Input
              className={inputCls}
              type="tel"
              value={form.customer_phone}
              onChange={(e) => set('customer_phone', e.target.value)}
              placeholder="(555) 000-0000"
            />
          </div>

          {/* Cake Description */}
          <div className="grid gap-1.5">
            <Label className={labelCls}>{t('Descripción del pastel *', 'Cake Description *')}</Label>
            <Textarea
              className={cn(inputCls, 'min-h-[80px] resize-none')}
              value={form.theme}
              onChange={(e) => set('theme', e.target.value)}
              placeholder={t('Tema, decoración, colores...', 'Theme, decoration, colors...')}
            />
          </div>

          {/* Size + Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label className={labelCls}>{t('Tamaño *', 'Size *')}</Label>
              <Select value={form.cake_size} onValueChange={(v) => set('cake_size', v)}>
                <SelectTrigger className={inputCls}>
                  <SelectValue placeholder={t('Seleccionar', 'Select')} />
                </SelectTrigger>
                <SelectContent className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}>
                  {CAKE_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className={labelCls}>{t('Precio ($) *', 'Price ($) *')}</Label>
              <Input
                className={inputCls}
                type="number"
                min="0"
                step="0.01"
                value={form.total_amount}
                onChange={(e) => set('total_amount', e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label className={labelCls}>{t('Fecha de entrega *', 'Date Needed *')}</Label>
              <Input
                className={inputCls}
                type="date"
                min={getTomorrowDate()}
                value={form.date_needed}
                onChange={(e) => set('date_needed', e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className={labelCls}>{t('Hora *', 'Time *')}</Label>
              <Select value={form.time_needed} onValueChange={(v) => set('time_needed', v)}>
                <SelectTrigger className={inputCls}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn('max-h-52', darkMode ? 'bg-slate-700 border-slate-600 text-white' : '')}>
                  {TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>{formatTimeLabel(slot)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pickup / Delivery */}
          <div className="grid gap-1.5">
            <Label className={labelCls}>{t('Tipo de orden *', 'Order Type *')}</Label>
            <div className="flex gap-4">
              {(['pickup', 'delivery'] as const).map((opt) => (
                <label
                  key={opt}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm font-medium transition-colors',
                    form.delivery_option === opt
                      ? darkMode
                        ? 'bg-green-600/20 border-green-500 text-green-400'
                        : 'bg-green-50 border-green-500 text-green-700'
                      : darkMode
                        ? 'border-slate-600 text-slate-300 hover:border-slate-400'
                        : 'border-gray-200 text-gray-600 hover:border-gray-400'
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    value={opt}
                    checked={form.delivery_option === opt}
                    onChange={() => set('delivery_option', opt)}
                  />
                  {opt === 'pickup' ? t('Recoger', 'Pickup') : t('Domicilio', 'Delivery')}
                </label>
              ))}
            </div>
          </div>

          {/* Delivery Address (conditional) */}
          {form.delivery_option === 'delivery' && (
            <div className="grid gap-1.5">
              <Label className={labelCls}>{t('Dirección de entrega *', 'Delivery Address *')}</Label>
              <Input
                className={inputCls}
                value={form.delivery_address}
                onChange={(e) => set('delivery_address', e.target.value)}
                placeholder={t('Calle, número, colonia...', 'Street, number, neighborhood...')}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}
            className={darkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : ''}>
            {t('Cancelar', 'Cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isSubmitting ? t('Creando...', 'Creating...') : t('Crear Orden', 'Create Order')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
