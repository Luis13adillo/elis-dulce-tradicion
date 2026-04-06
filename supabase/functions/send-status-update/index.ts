import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@^4.0.0";
import {
  buildEmailHtml,
  formatDate,
  formatStatus,
  getBusinessInfo,
} from "../_shared/emailTemplates.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://elisbakery.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "orders@elisbakery.com";
const FROM_NAME = Deno.env.get("FROM_NAME") || "Eli's Bakery";

interface StatusUpdateData {
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_language?: string;
  old_status: string;
  new_status: string;
  date_needed: string;
  time_needed: string;
  delivery_option: string;
  notes?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// XSS protection: escape HTML special characters in user input
function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }

    const { order, oldStatus } = await req.json() as { order: StatusUpdateData; oldStatus?: string };

    if (!order || !order.customer_email) {
      return new Response(
        JSON.stringify({ error: "Order data and customer email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(RESEND_API_KEY);
    const isSpanish = order.customer_language === 'es' || order.customer_language === 'spanish';

    // Skip email for certain status transitions
    if (order.new_status === 'pending' || order.new_status === oldStatus) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Status doesn't require notification" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trackingUrl = `${FRONTEND_URL}/order-tracking?orderNumber=${encodeURIComponent(order.order_number)}`;

    const subject = isSpanish
      ? `Actualización de Pedido #${order.order_number} - Eli's Bakery`
      : `Order Update #${order.order_number} - Eli's Bakery`;

    const htmlContent = generateStatusUpdateEmail(order, trackingUrl, isSpanish);
    const textContent = generateStatusUpdateText(order, trackingUrl, isSpanish);

    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: order.customer_email,
      subject,
      html: htmlContent,
      text: textContent,
    });

    if (error) {
      console.error("Resend error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: data?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-status-update:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateStatusUpdateEmail(order: StatusUpdateData, trackingUrl: string, isSpanish: boolean): string {
  const lang = isSpanish ? 'es' : 'en';

  const statusMessages: Record<string, { title: string; message: string }> = {
    confirmed: {
      title: isSpanish ? "Pedido Confirmado" : "Order Confirmed",
      message: isSpanish
        ? "Tu pedido ha sido confirmado y está ahora en nuestra cola de producción."
        : "Your order has been confirmed and is now in our production queue."
    },
    in_progress: {
      title: isSpanish ? "Pedido en Progreso" : "Order In Progress",
      message: isSpanish
        ? "¡Hemos comenzado a preparar tu pastel! Nuestros panaderos están trabajando en él ahora."
        : "We've started preparing your cake! Our bakers are working on it now."
    },
    ready: {
      title: isSpanish ? "Pedido Listo" : "Order Ready",
      message: order.delivery_option === 'delivery'
        ? (isSpanish ? "¡Tu pedido está listo y será entregado pronto!" : "Your order is ready and will be delivered soon!")
        : (isSpanish ? "¡Tu pedido está listo para recoger!" : "Your order is ready for pickup!")
    },
    out_for_delivery: {
      title: isSpanish ? "En Camino" : "Out for Delivery",
      message: isSpanish
        ? "¡Tu pedido está en camino! Debería llegar pronto."
        : "Your order is on its way! It should arrive soon."
    },
    delivered: {
      title: isSpanish ? "Pedido Entregado" : "Order Delivered",
      message: isSpanish
        ? "Tu pedido ha sido entregado. ¡Gracias por elegir Eli's Bakery!"
        : "Your order has been delivered. Thank you for choosing Eli's Bakery!"
    },
    completed: {
      title: isSpanish ? "Pedido Completado" : "Order Completed",
      message: isSpanish
        ? "Tu pedido ha sido completado. ¡Esperamos que hayas disfrutado tu pastel!"
        : "Your order has been completed. We hope you enjoyed your cake!"
    },
    cancelled: {
      title: isSpanish ? "Pedido Cancelado" : "Order Cancelled",
      message: isSpanish
        ? "Tu pedido ha sido cancelado. Si tienes alguna pregunta, por favor contáctanos."
        : "Your order has been cancelled. If you have any questions, please contact us."
    }
  };

  const statusInfo = statusMessages[order.new_status] || {
    title: isSpanish ? "Estado del Pedido Actualizado" : "Order Status Updated",
    message: isSpanish
      ? `El estado de tu pedido ha sido actualizado a: ${formatStatus(order.new_status, 'es')}`
      : `Your order status has been updated to: ${formatStatus(order.new_status, 'en')}`
  };

  const labels = {
    greeting: isSpanish ? 'Estimado/a' : 'Dear',
    orderNumber: isSpanish ? 'Número de Orden:' : 'Order Number:',
    status: isSpanish ? 'Estado:' : 'Status:',
    dateNeeded: isSpanish ? 'Fecha Necesaria:' : 'Date Needed:',
    at: isSpanish ? 'a las' : 'at',
    notes: isSpanish ? 'Notas:' : 'Notes:',
    viewDetails: isSpanish ? 'Ver Detalles del Pedido' : 'View Order Details',
    contactTitle: isSpanish ? 'Contáctanos:' : 'Contact Us:',
    phone: isSpanish ? 'Teléfono:' : 'Phone:',
    website: isSpanish ? 'Sitio Web:' : 'Website:'
  };

  const bodyContent = `
    <p style="font-size:16px;color:#333;margin:0 0 8px;">${labels.greeting} <strong>${escapeHtml(order.customer_name)}</strong>,</p>
    <p style="font-size:15px;color:#555;margin:0 0 24px;">${statusInfo.message}</p>

    <div style="background:#faf8f4;border-radius:10px;padding:24px 28px;margin:0 0 24px;border-left:4px solid #C6A649;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;width:44%;border-bottom:1px solid #f0ead8;">${labels.orderNumber}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:700;border-bottom:1px solid #f0ead8;">${escapeHtml(order.order_number)}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">${labels.status}</td>
          <td style="padding:7px 0;font-size:13px;font-weight:700;border-bottom:1px solid #f0ead8;">
            <span style="background:linear-gradient(135deg,#C6A649 0%,#d4af37 100%);color:#1A1A2E;padding:3px 10px;border-radius:12px;font-size:12px;">
              ${formatStatus(order.new_status, lang)}
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">${labels.dateNeeded}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${formatDate(order.date_needed, lang)} ${labels.at} ${order.time_needed}</td>
        </tr>
        ${order.notes ? `
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;">${labels.notes}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;">${escapeHtml(order.notes)}</td>
        </tr>` : ''}
      </table>
    </div>

    <div style="text-align:center;margin:28px 0 20px;">
      <a href="${trackingUrl}" style="background:linear-gradient(135deg,#C6A649 0%,#d4af37 100%);color:#1A1A2E;padding:14px 36px;text-decoration:none;border-radius:7px;display:inline-block;font-weight:700;font-size:15px;letter-spacing:0.5px;font-family:'Nunito',Arial,sans-serif;">
        ${labels.viewDetails} &rarr;
      </a>
    </div>
  `;

  return buildEmailHtml({
    titleEmoji: '📦',
    title: statusInfo.title,
    titleBandStyle: 'gold',
    bodyContent,
    frontendUrl: FRONTEND_URL,
  });
}

function generateStatusUpdateText(order: StatusUpdateData, trackingUrl: string, isSpanish: boolean): string {
  const biz = getBusinessInfo(isSpanish ? 'es' : 'en');
  // const lang = isSpanish ? 'es' : 'en'; // Unused var warning fix

  if (isSpanish) {
    return `
Actualización de Estado del Pedido

Estimado/a ${order.customer_name},

El estado de tu pedido ha sido actualizado.

Número de Orden: ${order.order_number}
Estado: ${formatStatus(order.new_status, 'es')}
Fecha Necesaria: ${formatDate(order.date_needed, 'es')} a las ${order.time_needed}
${order.notes ? `Notas: ${order.notes}\n` : ''}
Ver detalles del pedido: ${trackingUrl}

Contáctanos:
Teléfono: ${biz.phone}
Email: ${biz.email}
Sitio Web: ${biz.website}
    `;
  }

  return `
Order Status Update

Dear ${order.customer_name},

Your order status has been updated.

Order Number: ${order.order_number}
Status: ${formatStatus(order.new_status, 'en')}
Date Needed: ${formatDate(order.date_needed, 'en')} at ${order.time_needed}
${order.notes ? `Notes: ${order.notes}\n` : ''}
View order details: ${trackingUrl}

Contact Us:
Phone: ${biz.phone}
Email: ${biz.email}
Website: ${biz.website}
  `;
}
