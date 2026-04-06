/**
 * Shared email template utilities for Edge Functions
 * These can be imported by multiple edge functions
 */

export interface OrderData {
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  customer_language?: string;
  date_needed: string;
  time_needed: string;
  cake_size: string;
  filling: string;
  theme: string;
  dedication?: string;
  delivery_option: string;
  delivery_address?: string;
  delivery_apartment?: string;
  total_amount: number;
  reference_image_path?: string;
}

export function formatDate(dateString: string, locale: 'en' | 'es' = 'en'): string {
  try {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    return date.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', options);
  } catch {
    return dateString;
  }
}

export function formatStatus(status: string, locale: 'en' | 'es' = 'en'): string {
  const statusMap: Record<string, { en: string; es: string }> = {
    pending: { en: 'Pending', es: 'Pendiente' },
    confirmed: { en: 'Confirmed', es: 'Confirmada' },
    in_progress: { en: 'In Progress', es: 'En Progreso' },
    ready: { en: 'Ready', es: 'Lista' },
    out_for_delivery: { en: 'Out for Delivery', es: 'En Camino' },
    delivered: { en: 'Delivered', es: 'Entregada' },
    completed: { en: 'Completed', es: 'Completada' },
    cancelled: { en: 'Cancelled', es: 'Cancelada' },
  };

  return statusMap[status]?.[locale] || status;
}

export function getLanguage(order: OrderData): 'en' | 'es' {
  const lang = order.customer_language?.toLowerCase();
  return lang === 'es' || lang === 'spanish' ? 'es' : 'en';
}

export function getBusinessInfo(locale: 'en' | 'es' = 'en') {
  return {
    phone: '(610) 279-6200',
    email: 'orders@elisbakery.com',
    website: process.env.FRONTEND_URL || 'https://elisbakery.com',
    contactLabel: locale === 'es' ? 'Contáctanos' : 'Contact Us',
  };
}

// ─── Branded Email Wrapper ────────────────────────────────────────────────────

type TitleBandStyle = 'gold' | 'success' | 'alert';

interface BuildEmailOptions {
  titleEmoji: string;
  title: string;
  titleBandStyle?: TitleBandStyle;
  bodyContent: string;
  frontendUrl?: string;
}

const BRAND = {
  charcoal: '#1A1A2E',
  charcoalDeep: '#0d0d1a',
  gold: '#C6A649',
  goldLight: '#d4af37',
  goldDark: '#b8902f',
  cream: '#faf8f4',
  creamBorder: '#e8dcc8',
  white: '#ffffff',
};

const TITLE_BAND_STYLES: Record<TitleBandStyle, { bg: string; color: string }> = {
  gold: {
    bg: `linear-gradient(135deg, ${BRAND.gold} 0%, ${BRAND.goldLight} 50%, ${BRAND.goldDark} 100%)`,
    color: BRAND.charcoal,
  },
  success: {
    bg: 'linear-gradient(135deg, #1a6b3c 0%, #22a15e 100%)',
    color: '#ffffff',
  },
  alert: {
    bg: 'linear-gradient(135deg, #7b1a1a 0%, #b03030 100%)',
    color: '#ffffff',
  },
};

/**
 * Wraps body content in the Eli's Dulce Tradición branded email shell.
 * All emails share the same charcoal header with logo, color-coded title band,
 * white content area, and charcoal footer — matching the website's visual identity.
 */
export function buildEmailHtml({
  titleEmoji,
  title,
  titleBandStyle = 'gold',
  bodyContent,
  frontendUrl = 'https://elisbakery.com',
}: BuildEmailOptions): string {
  const band = TITLE_BAND_STYLES[titleBandStyle];
  const logoUrl = `${frontendUrl}/logo.png`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=Nunito:wght@400;600;700&display=swap');
    body { margin: 0; padding: 0; background-color: #f0ebe0; }
    @media only screen and (max-width: 600px) {
      .email-body { padding: 24px 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:20px 0;background-color:#f0ebe0;font-family:'Nunito',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;border-radius:14px;overflow:hidden;box-shadow:0 6px 32px rgba(0,0,0,0.18);">

    <!-- ── HEADER ─────────────────────────────────────────────── -->
    <div style="background:linear-gradient(160deg,${BRAND.charcoal} 0%,${BRAND.charcoalDeep} 100%);padding:30px 40px 24px;text-align:center;border-bottom:3px solid ${BRAND.gold};">
      <img src="${logoUrl}" alt="Eli's Dulce Tradición" width="80" height="80"
           style="display:block;margin:0 auto 12px;width:80px;height:80px;object-fit:contain;border-radius:50%;border:2px solid ${BRAND.gold};" />
      <div style="color:${BRAND.gold};font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:1px;line-height:1.2;">
        Eli's Dulce Tradición
      </div>
      <div style="color:rgba(198,166,73,0.6);font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-top:5px;">
        Custom Cakes &bull; Norristown, PA
      </div>
    </div>

    <!-- ── TITLE BAND ─────────────────────────────────────────── -->
    <div style="background:${band.bg};padding:20px 40px;text-align:center;">
      <h1 style="color:${band.color};margin:0;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:23px;font-weight:700;letter-spacing:0.5px;line-height:1.3;">
        ${titleEmoji} ${title}
      </h1>
    </div>

    <!-- ── BODY ───────────────────────────────────────────────── -->
    <div class="email-body" style="background:${BRAND.white};padding:36px 40px;border-left:1px solid ${BRAND.creamBorder};border-right:1px solid ${BRAND.creamBorder};">
      ${bodyContent}
    </div>

    <!-- ── FOOTER ─────────────────────────────────────────────── -->
    <div style="background:linear-gradient(160deg,${BRAND.charcoal} 0%,${BRAND.charcoalDeep} 100%);padding:26px 40px;text-align:center;border-top:3px solid ${BRAND.gold};border-radius:0 0 14px 14px;">
      <div style="color:${BRAND.gold};font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:13px;margin-bottom:10px;letter-spacing:1px;">
        Dulce Tradición &bull; Est. 1990
      </div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px;line-height:2;margin-bottom:6px;">
        📞 (610) 279-6200 &nbsp;&bull;&nbsp; ✉️ orders@elisbakery.com
      </div>
      <div style="color:rgba(255,255,255,0.4);font-size:11px;margin-bottom:14px;">
        324 W Marshall St, Norristown, PA 19401
      </div>
      <div style="border-top:1px solid rgba(198,166,73,0.25);padding-top:12px;">
        <a href="${frontendUrl}" style="color:${BRAND.gold};text-decoration:none;font-size:12px;letter-spacing:0.5px;">
          elisbakery.com
        </a>
      </div>
    </div>

  </div>
</body>
</html>`;
}
