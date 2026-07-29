import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { useReferenceImageUrl } from '@/hooks/useReferenceImageUrl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, PhoneCall, RotateCcw } from 'lucide-react';

export interface ReviewRow extends Record<string, unknown> {
  id: string;
  order_number: string;
  status: string;
  image_review_status: string;
}

interface ReviewResolveModalProps {
  row: ReviewRow;
  onClose: () => void;
  onResolved: () => void;
}

/**
 * Staff resolution dialog for a held photo review. Locked rules enforced
 * here AND server-side: staff must confirm they contacted the customer
 * before changing details, date, or price; decline requires a reason;
 * approval re-checks capacity; a revised price invalidates any stale
 * PaymentIntent. Approval emails the customer a secure link to the
 * existing site checkout (48h window, one reminder).
 */
export function ReviewResolveModal({ row, onClose, onResolved }: ReviewResolveModalProps) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [contacted, setContacted] = useState(false);
  const [notes, setNotes] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newTotal, setNewTotal] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const imageUrl = useReferenceImageUrl(String(row.reference_image_path ?? ''));
  const isReopenable = ['review_expired', 'declined'].includes(String(row.image_review_status))
    || row.status === 'expired';

  const hasChanges = Boolean(newDate || newTime || newTotal.trim());

  const run = async (action: 'approve' | 'decline' | 'expire' | 'reopen') => {
    setServerError(null);

    if (action === 'approve' && hasChanges && !contacted) {
      setServerError(t(
        'Confirma que contactaste al cliente antes de cambiar detalles, fecha o precio.',
        'Confirm you contacted the customer before changing details, date, or price.'
      ));
      return;
    }
    if (action === 'decline' && !notes.trim()) {
      setServerError(t('Se requiere un motivo para rechazar.', 'A reason is required to decline.'));
      return;
    }
    const parsedTotal = newTotal.trim() ? Number(newTotal) : undefined;
    if (parsedTotal !== undefined && (!Number.isFinite(parsedTotal) || parsedTotal <= 0)) {
      setServerError(t('Precio final inválido.', 'Invalid final price.'));
      return;
    }

    setBusy(true);
    try {
      const updates: Record<string, unknown> = {};
      if (newDate) updates.date_needed = newDate;
      if (newTime) updates.time_needed = newTime;

      const result = await api.resolveImageReview({
        pending_order_id: String(row.id),
        action,
        updates: Object.keys(updates).length ? updates : undefined,
        final_total: parsedTotal,
        notes: notes.trim() || undefined,
        contacted_customer: contacted,
      });

      if (action === 'approve') {
        toast.success(t(
          'Aprobado — enlace de pago enviado al cliente',
          'Approved — payment link emailed to the customer'
        ));
      } else if (action === 'decline') {
        toast.success(t('Rechazado — cliente notificado', 'Declined — customer notified'));
      } else if (action === 'reopen') {
        toast.success(t('Solicitud reabierta', 'Request reopened'));
      } else {
        toast.success(t('Solicitud expirada', 'Request expired'));
      }
      if (result?.email_sent === false) {
        toast.warning(t(
          'El correo al cliente falló — contáctalo directamente',
          'The customer email failed — contact them directly'
        ));
      }
      onResolved();
    } catch (err) {
      const e = err as Error & { code?: string; details?: { error?: string; booked?: number; capacity?: number } };
      if (e.details?.error === 'capacity_full') {
        setServerError(t(
          `Esa fecha está llena (${e.details.booked}/${e.details.capacity}). Acuerda otra fecha con el cliente e inténtalo de nuevo.`,
          `That date is full (${e.details.booked}/${e.details.capacity}). Agree on a new date with the customer and try again.`
        ));
      } else {
        setServerError(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('Revisión de foto', 'Photo review')} — {String(row.order_number)}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Sin pago tomado. El pago del cliente confirma el pedido — no hay paso de aprobación separado.',
              'No payment taken. The customer paying confirms the order — there is no separate approval step.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl overflow-hidden bg-gray-100 aspect-[3/4] flex items-center justify-center">
            {imageUrl ? (
              <img src={imageUrl} alt="Reference" className="w-full h-full object-contain" />
            ) : (
              <p className="text-xs text-gray-400">{t('Sin foto', 'No photo')}</p>
            )}
          </div>
          <div className="text-sm space-y-1.5">
            <p><span className="text-gray-400">{t('Cliente', 'Customer')}:</span> <strong>{String(row.customer_name)}</strong></p>
            <p>
              <a href={`tel:${String(row.customer_phone ?? '')}`} className="text-green-600 font-bold inline-flex items-center gap-1">
                <PhoneCall className="h-3.5 w-3.5" /> {String(row.customer_phone ?? '')}
              </a>
            </p>
            <p className="break-all"><span className="text-gray-400">Email:</span> {String(row.customer_email)}</p>
            <p><span className="text-gray-400">{t('Fecha', 'Date')}:</span> {String(row.date_needed)} @ {String(row.time_needed)}</p>
            <p><span className="text-gray-400">{t('Pastel', 'Cake')}:</span> {String(row.cake_size ?? '')}{row.servings ? ` · ${row.servings} ${t('porciones', 'servings')}` : ''}</p>
            <p><span className="text-gray-400">{t('Relleno', 'Filling')}:</span> {String(row.filling ?? '')}</p>
            <p><span className="text-gray-400">{t('Tema', 'Theme')}:</span> {String(row.theme ?? '')}</p>
            {Boolean(row.dedication) && (
              <p><span className="text-gray-400">{t('Dedicatoria', 'Dedication')}:</span> {String(row.dedication)}</p>
            )}
            <p className="pt-1 text-base">
              <span className="text-gray-400">Total:</span>{' '}
              <strong>${Number(row.total_amount).toFixed(2)}</strong>
              {row.original_total_amount != null && (
                <span className="text-xs text-gray-400"> ({t('original', 'original')}: ${Number(row.original_total_amount).toFixed(2)})</span>
              )}
            </p>
          </div>
        </div>

        {!isReopenable && (
          <>
            <div className="rounded-xl border p-4 space-y-3">
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                {t('Cambios (opcional — requiere haber contactado al cliente)', 'Changes (optional — requires contacting the customer)')}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="review-new-date" className="text-xs">{t('Nueva fecha', 'New date')}</Label>
                  <Input id="review-new-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="review-new-time" className="text-xs">{t('Nueva hora', 'New time')}</Label>
                  <Input id="review-new-time" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
                </div>
              </div>
              <div>
                <Label htmlFor="review-new-total" className="text-xs">
                  {t('Precio final completo ($)', 'Full final price ($)')}
                </Label>
                <Input
                  id="review-new-total"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder={Number(row.total_amount).toFixed(2)}
                  value={newTotal}
                  onChange={(e) => setNewTotal(e.target.value)}
                  className="w-40"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  {t(
                    'Un cambio de precio invalida cualquier intento de pago anterior; el cliente pagará el nuevo total.',
                    'A price change invalidates any earlier payment attempt; the customer will pay the new total.'
                  )}
                </p>
              </div>
              <div className="flex items-start gap-2 pt-1">
                <Checkbox
                  id="review-contacted"
                  checked={contacted}
                  onCheckedChange={(v) => setContacted(v === true)}
                />
                <Label htmlFor="review-contacted" className="text-sm leading-snug">
                  {t(
                    'Contacté al cliente y acordamos estos detalles y el precio.',
                    'I contacted the customer and we agreed on these details and price.'
                  )}
                </Label>
              </div>
            </div>

            <div>
              <Label htmlFor="review-notes" className="text-xs">
                {t('Notas / motivo (requerido para rechazar)', 'Notes / reason (required to decline)')}
              </Label>
              <Textarea
                id="review-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={t('Ej: foto no corresponde al tamaño pedido…', 'E.g. photo does not match the ordered size…')}
              />
            </div>
          </>
        )}

        {serverError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2 justify-end pt-2">
          {isReopenable ? (
            <Button disabled={busy} onClick={() => run('reopen')}>
              <RotateCcw className="h-4 w-4 mr-1" />
              {t('Reabrir solicitud', 'Reopen request')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => run('expire')}>
                {t('Expirar', 'Expire')}
              </Button>
              <Button variant="destructive" disabled={busy} onClick={() => run('decline')}>
                {t('Rechazar', 'Decline')}
              </Button>
              <Button
                disabled={busy}
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => run('approve')}
              >
                {busy
                  ? t('Procesando…', 'Working…')
                  : hasChanges
                    ? t('Aprobar con cambios + enviar enlace', 'Approve with changes + send link')
                    : t('Aprobar + enviar enlace de pago', 'Approve + send payment link')}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
