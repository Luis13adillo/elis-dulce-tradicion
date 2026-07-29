import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { useReferenceImageUrl } from '@/hooks/useReferenceImageUrl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Phone, ScanSearch, Clock, RotateCcw, ImageOff } from 'lucide-react';
import { ReviewResolveModal, type ReviewRow } from './ReviewResolveModal';

/**
 * Photo review queue — pre-payment orders whose design photo needs staff
 * attention. No payment has been taken on any row shown here. The AI verdict
 * and reasons are staff-only (they never reach customers).
 */

const QUEUE_KEY = ['review-queue'];
const POLL_MS = 60_000;

export function useReviewQueue() {
  return useQuery({
    queryKey: QUEUE_KEY,
    queryFn: () => api.getReviewQueue() as Promise<ReviewRow[]>,
    refetchInterval: POLL_MS,
    staleTime: 30_000,
  });
}

/** Sidebar badge: rows actively waiting on staff. */
export function useReviewQueueCount(): number {
  const { data } = useReviewQueue();
  return (data ?? []).filter(
    (r) => r.image_review_status === 'needs_review' && r.status === 'awaiting_payment'
  ).length;
}

interface ReviewQueuePanelProps {
  darkMode?: boolean;
}

export function ReviewQueuePanel({ darkMode = false }: ReviewQueuePanelProps) {
  const { t } = useLanguage();
  const { data, isLoading, refetch } = useReviewQueue();
  const [selected, setSelected] = useState<ReviewRow | null>(null);

  const rows = data ?? [];
  const needsReview = rows.filter(
    (r) => r.image_review_status === 'needs_review' && r.status === 'awaiting_payment'
  );
  const awaitingPayment = rows.filter(
    (r) => r.image_review_status === 'approved' && r.status === 'awaiting_payment'
  );
  const reopenable = rows.filter(
    (r) => ['review_expired', 'declined'].includes(String(r.image_review_status))
      || (r.status === 'expired' && r.image_review_status !== 'not_required')
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
          title={t('Necesitan revisión', 'Needs review')}
          subtitle={t('Sin pago — contacta al cliente antes de cambiar detalles o precio', 'Unpaid — contact the customer before changing details or price')}
          emptyText={t('Nada pendiente de revisión', 'Nothing waiting for review')}
          rows={needsReview}
          onOpen={setSelected}
          accent="amber"
          t={t}
        />
        <Section
          title={t('Aprobadas — esperando pago', 'Approved — awaiting payment')}
          subtitle={t('Enlace de pago enviado; la fecha está reservada mientras el enlace sea válido', 'Payment link sent; the date stays reserved while the link is valid')}
          emptyText={t('Ninguna esperando pago', 'None awaiting payment')}
          rows={awaitingPayment}
          onOpen={setSelected}
          accent="green"
          t={t}
        />
        <Section
          title={t('Expiradas / rechazadas (reabribles)', 'Expired / declined (reopenable)')}
          subtitle={t('Se conserva el historial; puedes reabrirlas', 'History is kept; you can reopen them')}
          emptyText={t('Ninguna', 'None')}
          rows={reopenable}
          onOpen={setSelected}
          accent="gray"
          t={t}
        />
      </div>

      {selected && (
        <ReviewResolveModal
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
  rows: ReviewRow[];
  onOpen: (row: ReviewRow) => void;
  accent: 'amber' | 'green' | 'gray';
  t: (es: string, en: string) => string;
}) {
  const accentClasses = {
    amber: 'border-l-amber-400',
    green: 'border-l-green-500',
    gray: 'border-l-gray-300',
  }[accent];

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-black text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <ScanSearch className="h-5 w-5 text-gray-400" />
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
            <ReviewCard key={String(row.id)} row={row} onOpen={onOpen} accentClass={accentClasses} t={t} />
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewCard({
  row,
  onOpen,
  accentClass,
  t,
}: {
  row: ReviewRow;
  onOpen: (row: ReviewRow) => void;
  accentClass: string;
  t: (es: string, en: string) => string;
}) {
  const imageUrl = useReferenceImageUrl(String(row.reference_image_path ?? ''));
  const result = (row.image_review_result ?? {}) as {
    verdict?: string;
    confidence?: string;
    observed?: string;
    reasons?: string[];
  };
  const isReopenable = ['review_expired', 'declined'].includes(String(row.image_review_status))
    || row.status === 'expired';
  const priceRevised = Number(row.price_revision ?? 0) > 0;

  return (
    <Card className={`border-l-4 ${accentClass} shadow-sm`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-3">
          <div className="h-20 w-20 shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
            {imageUrl ? (
              <img src={imageUrl} alt="Reference" className="h-full w-full object-cover" />
            ) : (
              <ImageOff className="h-6 w-6 text-gray-300" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-black text-sm text-gray-800 dark:text-gray-100 truncate">
              {String(row.order_number)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{String(row.customer_name)}</p>
            <a
              href={`tel:${String(row.customer_phone ?? '')}`}
              className="text-xs font-bold text-green-600 flex items-center gap-1 mt-0.5"
            >
              <Phone className="h-3 w-3" />
              {String(row.customer_phone ?? '')}
            </a>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {String(row.date_needed)} @ {String(row.time_needed)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-black text-gray-800 dark:text-gray-100">
              ${Number(row.total_amount).toFixed(2)}
            </p>
            {priceRevised && (
              <p className="text-[10px] text-amber-600 font-bold">
                {t('precio revisado', 'price revised')}
              </p>
            )}
            <p className="text-[10px] text-gray-400 uppercase font-bold">
              {t('sin pagar', 'unpaid')}
            </p>
          </div>
        </div>

        {result.verdict && (
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-2.5 text-xs space-y-1">
            <p className="font-bold text-gray-600 dark:text-gray-300">
              AI: <VerdictBadge verdict={result.verdict} />{' '}
              {result.confidence ? <span className="text-gray-400">({result.confidence})</span> : null}
            </p>
            {result.observed && <p className="text-gray-500">{result.observed}</p>}
            {(result.reasons ?? []).length > 0 && (
              <ul className="list-disc pl-4 text-gray-500">
                {(result.reasons ?? []).slice(0, 3).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => onOpen(row)}>
            {isReopenable ? (
              <span className="flex items-center gap-1">
                <RotateCcw className="h-3.5 w-3.5" />
                {t('Reabrir / ver', 'Reopen / view')}
              </span>
            ) : (
              t('Resolver', 'Resolve')
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const styles: Record<string, string> = {
    MATCH: 'bg-green-100 text-green-700',
    MISMATCH: 'bg-red-100 text-red-700',
    UNCERTAIN: 'bg-amber-100 text-amber-700',
    ANALYSIS_FAILED: 'bg-gray-200 text-gray-600',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-black ${styles[verdict] ?? 'bg-gray-100 text-gray-600'}`}>
      {verdict}
    </span>
  );
}
