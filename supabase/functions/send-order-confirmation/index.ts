import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@^4.0.0";
import {
  buildEmailHtml,
  formatDate,
  OrderData
} from "../_shared/emailTemplates.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://elisbakery.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "orders@elisbakery.com";
const FROM_NAME = Deno.env.get("FROM_NAME") || "Eli's Bakery";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// XSS Protection: Escape HTML special characters to prevent script injection
function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

    const { order } = await req.json() as { order: OrderData };

    if (!order || !order.customer_email) {
      return new Response(
        JSON.stringify({ error: "Order data and customer email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(RESEND_API_KEY);
    const isSpanish = order.customer_language === 'es' || order.customer_language === 'spanish';

    // Generate tracking URL
    const trackingUrl = `${FRONTEND_URL}/order-tracking?orderNumber=${encodeURIComponent(order.order_number)}`;

    // Email content based on language
    const subject = isSpanish
      ? `Confirmacion de Pedido #${escapeHtml(order.order_number)} - Eli's Bakery`
      : `Order Confirmation #${escapeHtml(order.order_number)} - Eli's Bakery`;

    const htmlContent = generateConfirmationEmail(order, trackingUrl, isSpanish);
    const textContent = generateConfirmationText(order, trackingUrl, isSpanish);

    // Send email
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
    console.error("Error in send-order-confirmation:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateConfirmationEmail(order: OrderData, trackingUrl: string, isSpanish: boolean): string {
  const lang = isSpanish ? 'es' : 'en';

  // Sanitize all user-provided fields to prevent XSS
  const safeName = escapeHtml(order.customer_name);
  const safeOrderNumber = escapeHtml(order.order_number);
  const safeCakeSize = escapeHtml(order.cake_size);
  const safeFilling = escapeHtml(order.filling);
  const safeTheme = escapeHtml(order.theme);
  const safeDedication = escapeHtml(order.dedication);
  const safeDeliveryAddress = escapeHtml(order.delivery_address);
  const safeDeliveryApartment = escapeHtml(order.delivery_apartment);

  // Localized strings
  const labels = {
    title: isSpanish ? 'Pedido Confirmado!' : 'Order Confirmed!',
    greeting: isSpanish ? 'Estimado/a' : 'Dear',
    intro: isSpanish
      ? 'Gracias por tu pedido! Estamos emocionados de crear tu pastel personalizado.'
      : "Thank you for your order! We're excited to create your custom cake.",
    detailsHeader: isSpanish ? 'Detalles del Pedido' : 'Order Details',
    orderNumber: isSpanish ? 'Numero de Orden:' : 'Order Number:',
    dateNeeded: isSpanish ? 'Fecha Necesaria:' : 'Date Needed:',
    at: isSpanish ? 'a las' : 'at',
    size: isSpanish ? 'Tamano:' : 'Cake Size:',
    filling: isSpanish ? 'Relleno:' : 'Filling:',
    theme: isSpanish ? 'Tema:' : 'Theme:',
    dedication: isSpanish ? 'Dedicatoria:' : 'Dedication:',
    delivery: isSpanish ? 'Entrega:' : 'Delivery:',
    deliveryHome: isSpanish ? 'Entrega a Domicilio' : 'Home Delivery',
    deliveryPickup: isSpanish ? 'Recoger' : 'Pickup',
    address: isSpanish ? 'Direccion de Entrega:' : 'Delivery Address:',
    total: 'Total:',
    trackBtn: isSpanish ? 'Rastrear Tu Pedido' : 'Track Your Order',
    notify: isSpanish
      ? 'Te notificaremos cuando tu pedido este listo. Puedes rastrear el estado de tu pedido usando el enlace de arriba.'
      : "We'll notify you when your order is ready. You can track your order status using the link above.",
    contactTitle: isSpanish ? 'Contactanos:' : 'Contact Us:',
    phone: isSpanish ? 'Telefono:' : 'Phone:',
    website: isSpanish ? 'Sitio Web:' : 'Website:'
  };

  const bodyContent = `
    <p style="font-size:16px;color:#333;margin:0 0 8px;">${labels.greeting} <strong>${safeName}</strong>,</p>
    <p style="font-size:15px;color:#555;margin:0 0 24px;">${labels.intro}</p>

    <div style="background:#faf8f4;border-radius:10px;padding:24px 28px;margin:0 0 24px;border-left:4px solid #C6A649;">
      <h2 style="color:#1A1A2E;font-family:'Playfair Display',Georgia,serif;font-size:17px;font-weight:700;margin:0 0 16px;padding-bottom:12px;border-bottom:1px solid #e8dcc8;">
        ${labels.detailsHeader}
      </h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;width:44%;border-bottom:1px solid #f0ead8;">${labels.orderNumber}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:700;border-bottom:1px solid #f0ead8;">${safeOrderNumber}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">${labels.dateNeeded}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${formatDate(order.date_needed, lang)} ${labels.at} ${order.time_needed}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">${labels.size}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${safeCakeSize}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">${labels.filling}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${safeFilling}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">${labels.theme}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${safeTheme}</td>
        </tr>
        ${order.dedication ? `
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">${labels.dedication}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;font-style:italic;border-bottom:1px solid #f0ead8;">"${safeDedication}"</td>
        </tr>` : ''}
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">${labels.delivery}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${order.delivery_option === 'delivery' ? labels.deliveryHome : labels.deliveryPickup}</td>
        </tr>
        ${order.delivery_address ? `
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">${labels.address}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${safeDeliveryAddress}${order.delivery_apartment ? `, ${safeDeliveryApartment}` : ''}</td>
        </tr>` : ''}
      </table>
      <div style="background:linear-gradient(135deg,#C6A649 0%,#d4af37 100%);border-radius:7px;padding:12px 16px;margin-top:18px;text-align:right;">
        <span style="color:#1A1A2E;font-size:20px;font-weight:700;">${labels.total} $${order.total_amount.toFixed(2)}</span>
      </div>
    </div>

    <div style="text-align:center;margin:28px 0 20px;">
      <a href="${trackingUrl}" style="background:linear-gradient(135deg,#C6A649 0%,#d4af37 100%);color:#1A1A2E;padding:14px 36px;text-decoration:none;border-radius:7px;display:inline-block;font-weight:700;font-size:15px;letter-spacing:0.5px;font-family:'Nunito',Arial,sans-serif;">
        ${labels.trackBtn} &rarr;
      </a>
    </div>

    <p style="font-size:13px;color:#888;text-align:center;margin:0;">${labels.notify}</p>
  `;

  return buildEmailHtml({
    titleEmoji: '🎂',
    title: labels.title,
    titleBandStyle: 'gold',
    bodyContent,
    frontendUrl: FRONTEND_URL,
  });
}

function generateConfirmationText(order: OrderData, trackingUrl: string, isSpanish: boolean): string {
  const biz = getBusinessInfo(isSpanish ? 'es' : 'en');
  const lang = isSpanish ? 'es' : 'en';

  // Plain text doesn't need HTML escaping but we sanitize for consistency
  const safeName = order.customer_name || '';
  const safeOrderNumber = order.order_number || '';
  const safeCakeSize = order.cake_size || '';
  const safeFilling = order.filling || '';
  const safeTheme = order.theme || '';
  const safeDedication = order.dedication || '';
  const safeDeliveryAddress = order.delivery_address || '';
  const safeDeliveryApartment = order.delivery_apartment || '';

  if (isSpanish) {
    return `
        Pedido Confirmado!

        Estimado/a ${safeName},

        Gracias por tu pedido! Estamos emocionados de crear tu pastel personalizado.

        Detalles del Pedido:
        - Numero de Orden: ${safeOrderNumber}
        - Fecha Necesaria: ${formatDate(order.date_needed, lang)} a las ${order.time_needed}
        - Tamano: ${safeCakeSize}
        - Relleno: ${safeFilling}
        - Tema: ${safeTheme}
        ${safeDedication ? `- Dedicatoria: "${safeDedication}"\n` : ''}- Entrega: ${order.delivery_option === 'delivery' ? 'Entrega a Domicilio' : 'Recoger'}
        ${safeDeliveryAddress ? `- Direccion de Entrega: ${safeDeliveryAddress}${safeDeliveryApartment ? `, ${safeDeliveryApartment}` : ''}\n` : ''}- Total: $${order.total_amount.toFixed(2)}

        Rastrear tu pedido: ${trackingUrl}

        Te notificaremos cuando tu pedido este listo.

        Contactanos:
        Telefono: ${biz.phone}
        Email: ${biz.email}
        Sitio Web: ${biz.website}
        `;
  }

  return `
  Order Confirmed!

  Dear ${safeName},

  Thank you for your order! We're excited to create your custom cake.

  Order Details:
  - Order Number: ${safeOrderNumber}
  - Date Needed: ${formatDate(order.date_needed, lang)} at ${order.time_needed}
  - Cake Size: ${safeCakeSize}
  - Filling: ${safeFilling}
  - Theme: ${safeTheme}
  ${safeDedication ? `- Dedication: "${safeDedication}"\n` : ''}- Delivery: ${order.delivery_option === 'delivery' ? 'Home Delivery' : 'Pickup'}
  ${safeDeliveryAddress ? `- Delivery Address: ${safeDeliveryAddress}${safeDeliveryApartment ? `, ${safeDeliveryApartment}` : ''}\n` : ''}- Total: $${order.total_amount.toFixed(2)}

  Track your order: ${trackingUrl}

  We'll notify you when your order is ready.

  Contact Us:
  Phone: ${biz.phone}
  Email: ${biz.email}
  Website: ${biz.website}
  `;
}
