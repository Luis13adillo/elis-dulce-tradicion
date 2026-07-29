import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Truck, Phone, Clock, MapPin, Loader2, ExternalLink } from 'lucide-react';
import { buildGoogleMapsUrl } from '@/lib/googleMaps';

/**
 * Delivery-quote queue — unpaid delivery orders beyond the 5-mile flat-fee
 * radius (or with an unverifiable address). No payment has been taken on any
 * row shown here: create-payment-intent refuses quote_required orders.
 * Entering a fee updates the total, invalidates any stale PaymentIntent
 * (price_revision bump) and emails the customer a fresh payment link.
 */

export interface QuoteRow {
  id: string;
  order_number: string;
  status: string;
  delivery_quote_status: string;
  delivery_distance_miles: number | null;
  customer_name: string;
  customer_phone: string;
  customer_language: string;
  date_needed: string;
  time_needed: string;
  cake_size: string;
  delivery_address: string;
  delivery_apartment: string | null;
  delivery_instructions: string | null;
  delivery_fee: number;
  total_amount: number;
  price_revision: number;
  payment_link_sent_at: string | null;
  created_at: string;
}

const QUEUE_KEY = ['delivery-quote-queue'];
const POLL_MS = 60_000;

export function useDeliveryQuoteQueue() {
  return useQuery({
    queryKey: QUEUE_KEY,
    queryFn: () => api.getDeliveryQuoteQueue() as Promise<QuoteRow[]>,
    refetchInterval: POLL_MS,
    staleTime: 30_000,
  });
}

/** Sidebar badge: rows actively waiting on a staff quote. */
export function useDeliveryQuoteCount(): number {
  const { data } = useDeliveryQuoteQueue();
  return (data ?? []).filter(
    (r) => r.delivery_quote_status === 'quote_required' && r.status === 'awaiting_payment'
  ).length;
}

interface DeliveryQuotePanelProps {
  darkMode?: boolean;
}

export function DeliveryQuotePanel({ darkMode = false }: DeliveryQuotePanelProps) {
  const { t } = useLanguage();
  const { data, isLoading, refetch } = useDeliveryQuoteQueue();
  const [selected, setSelected] = useState<QuoteRow | null>(null);

  const rows = data ?? [];
  const needsQuote = rows.filter(
    (r) => r.delivery_quote_status === 'quote_required' && r.status === 'awaiting_payment'
  );
  const quoted = rows.filter(
    (r) => r.delivery_quote_status === 'quoted' && r.status !== 'promoted'
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin h-8 w-8 border-4 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="space-y-8">
        <Section
          title={t('Necesitan cotización de entrega', 'Need a delivery quote')}
          subtitle={t(
            'Sin pago — más de 5 millas o dirección sin verificar. Ingresa la tarifa y el cliente recibe su enlace de pago.',
            'Unpaid — beyond 5 miles or unverified address. Enter the fee and the customer gets their payment link.'
          )}
          emptyText={t('Ninguna pendiente', 'Nothing waiting')}
          rows={needsQuote}
          onOpen={setSelected}
          accent="amber"
          t={t}
        />
        <Section
          title={t('Cotizadas — esperando pago', 'Quoted — awaiting payment')}
          subtitle={t(
            'Enlace de pago enviado con la tarifa cotizada. Puedes corregir la tarifa si es necesario.',
            'Payment link sent with the quoted fee. You can correct the fee if needed.'
          )}
          emptyText={t('Ninguna esperando pago', 'None awaiting payment')}
          rows={quoted}
          onOpen={setSelected}
          accent="green"
          t={t}
        />
      </div>

      {selected && (
        <QuoteModal
          row={selected}
          onClose={() => setSelected(null)}
          onResolved={() => {
            setSelected(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  emptyText,
  rows,
  onOpen,
  accent,
  t,
}: {
  title: string;
  subtitle: string;
  emptyText: string;
  rows: QuoteRow[];
  onOpen: (row: QuoteRow) => void;
  accent: 'amber' | 'green';
  t: (es: string, en: string) => string;
}) {
  const accentClass = accent === 'amber' ? 'border-l-amber-400' : 'border-l-green-500';

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-black text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Truck className="h-5 w-5 text-gray-400" />
          {title}
          <Badge variant="secondary">{rows.length}</Badge>
        </h2>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic pl-7">{emptyText}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <QuoteCard key={row.id} row={row} onOpen={onOpen} accentClass={accentClass} t={t} />
          ))}
        </div>
      )}
    </section>
  );
}

function QuoteCard({
  row,
  onOpen,
  accentClass,
  t,
}: {
  row: QuoteRow;
  onOpen: (row: QuoteRow) => void;
  accentClass: string;
  t: (es: string, en: string) => string;
}) {
  const fullAddress = [row.delivery_address, row.delivery_apartment].filter(Boolean).join(', ');
  const isQuoted = row.delivery_quote_status === 'quoted';

  return (
    <Card className={`border-l-4 ${accentClass} shadow-sm`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-black text-sm text-gray-800 dark:text-gray-100 truncate">
              {row.order_number}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{row.customer_name}</p>
            <a
              href={`tel:${row.customer_phone ?? ''}`}
              className="text-xs font-bold text-green-600 flex items-center gap-1 mt-0.5"
            >
              <Phone className="h-3 w-3" />
              {row.customer_phone ?? ''}
            </a>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {row.date_needed} @ {row.time_needed}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-black text-gray-800 dark:text-gray-100">
              ${Number(row.total_amount).toFixed(2)}
            </p>
            {isQuoted ? (
              <p className="text-[10px] text-green-600 font-bold">
                {t('entrega', 'delivery')}: ${Number(row.delivery_fee).toFixed(2)}
              </p>
            ) : (
              <p className="text-[10px] text-amber-600 font-bold">
                {t('sin tarifa de entrega', 'no delivery fee yet')}
              </p>
            )}
            <p className="text-[10px] text-gray-400 uppercase font-bold">
              {t('sin pagar', 'unpaid')}
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-2.5 text-xs space-y-1">
          <a
            href={buildGoogleMapsUrl(fullAddress)}
            target="_blank"
            rel="noreferrer"
            className="font-bold text-gray-600 dark:text-gray-300 flex items-start gap-1 hover:text-green-600"
          >
            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{fullAddress}</span>
            <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
          </a>
          <p className="text-gray-500">
            {row.delivery_distance_miles != null
              ? `${row.delivery_distance_miles} ${t('millas de la pastelería', 'miles from the bakery')}`
              : t('distancia sin verificar', 'distance unverified')}
          </p>
          {row.delivery_instructions && (
            <p className="text-gray-500 italic">{row.delivery_instructions}</p>
          )}
        </div>

        <Button size="sm" className="w-full" onClick={() => onOpen(row)}>
          {isQuoted
            ? t('Corregir tarifa', 'Correct fee')
            : t('Ingresar tarifa de entrega', 'Enter delivery fee')}
        </Button>
      </CardContent>
    </Card>
  );
}

function QuoteModal({
  row,
  onClose,
  onResolved,
}: {
  row: QuoteRow;
  onClose: () => void;
  onResolved: () => void;
}) {
  const { t } = useLanguage();
  const [fee, setFee] = useState<string>(
    row.delivery_quote_status === 'quoted' ? String(row.delivery_fee ?? '') : ''
  );
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const parsedFee = parseFloat(fee);
  const feeValid = Number.isFinite(parsedFee) && parsedFee >= 0 && parsedFee <= 500;
  const cakeTotal = Number(row.total_amount) - Number(row.delivery_fee ?? 0);
  const newTotal = feeValid ? cakeTotal + parsedFee : null;

  const submit = async () => {
    if (!feeValid) return;
    setIsSaving(true);
    try {
      const result = await api.resolveDeliveryQuote({
        pending_order_id: row.id,
        delivery_fee: parsedFee,
        notes: notes.trim() || undefined,
      });
      const emailSent = (result as { email_sent?: boolean }).email_sent;
      toast.success(
        emailSent
          ? t('Cotización enviada — el cliente recibió su enlace de pago', 'Quote sent — the customer received their payment link')
          : t('Cotización guardada, pero el correo falló. Contacta al cliente.', 'Quote saved, but the email failed. Contact the customer.')
      );
      onResolved();
    } catch (err) {
      toast.error((err as Error).message || t('Error al guardar la cotización', 'Error saving quote'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('Tarifa de entrega', 'Delivery fee')} — {row.order_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          <div className="rounded-lg bg-gray-50 p-3 space-y-1">
            <p className="font-bold">{row.customer_name} · {row.customer_phone}</p>
            <p>{[row.delivery_address, row.delivery_apartment].filter(Boolean).join(', ')}</p>
            <p className="text-gray-500">
              {row.delivery_distance_miles != null
                ? `${row.delivery_distance_miles} ${t('millas', 'miles')}`
                : t('distancia sin verificar', 'distance unverified')}
              {' · '}{row.date_needed} @ {row.time_needed}
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="quote-fee">{t('Tarifa de entrega ($)', 'Delivery fee ($)')}</Label>
            <Input
              id="quote-fee"
              type="number"
              min="0"
              max="500"
              step="0.01"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="quote-notes">{t('Notas (opcional)', 'Notes (optional)')}</Label>
            <Input
              id="quote-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('Ej: distancia confirmada por teléfono', 'e.g. distance confirmed by phone')}
            />
          </div>

          <div className="rounded-lg border p-3 flex items-center justify-between">
            <span className="text-gray-500">{t('Nuevo total', 'New total')}</span>
            <span className="font-black text-lg">
              {newTotal != null ? `$${newTotal.toFixed(2)}` : '—'}
            </span>
          </div>
          <p className="text-xs text-gray-400">
            {t(
              'Al guardar: se actualiza el total, se invalida cualquier intento de pago anterior y el cliente recibe un enlace de pago nuevo por correo.',
              'On save: the total updates, any previous payment attempt is invalidated, and the customer gets a fresh payment link by email.'
            )}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t('Cancelar', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={!feeValid || isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('Guardar y enviar enlace', 'Save & send link')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
