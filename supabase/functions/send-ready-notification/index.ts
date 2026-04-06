import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@^4.0.0";
import { buildEmailHtml, getBusinessInfo } from "../_shared/emailTemplates.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://elisbakery.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "orders@elisbakery.com";
const FROM_NAME = Deno.env.get("FROM_NAME") || "Eli's Bakery";

interface ReadyNotificationData {
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  customer_language?: string;
  date_needed: string;
  time_needed: string;
  delivery_option: string;
  delivery_address?: string;
  delivery_apartment?: string;
  total_amount: number;
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

    const { order } = await req.json() as { order: ReadyNotificationData };

    if (!order || !order.customer_email) {
      return new Response(
        JSON.stringify({ error: "Order data and customer email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(RESEND_API_KEY);
    const isSpanish = order.customer_language === 'es' || order.customer_language === 'spanish';

    const trackingUrl = `${FRONTEND_URL}/order-tracking?orderNumber=${encodeURIComponent(order.order_number)}`;

    const subject = isSpanish
      ? `¡Tu Pedido #${order.order_number} Está Listo! - Eli's Bakery`
      : `Your Order #${order.order_number} is Ready! - Eli's Bakery`;

    const htmlContent = generateReadyEmail(order, trackingUrl, isSpanish);
    const textContent = generateReadyText(order, trackingUrl, isSpanish);

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
    console.error("Error in send-ready-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateReadyEmail(order: ReadyNotificationData, trackingUrl: string, isSpanish: boolean): string {
  const isDelivery = order.delivery_option === 'delivery';
  const biz = getBusinessInfo(isSpanish ? 'es' : 'en');

  const labels = {
    title: isSpanish ? '¡Tu Pedido Está Listo!' : 'Your Order is Ready!',
    greeting: isSpanish ? 'Estimado/a' : 'Dear',
    intro: isSpanish ? '¡Buenas noticias! ¡Tu pedido de pastel personalizado está listo!' : 'Great news! Your custom cake order is ready!',
    deliveryInfo: isSpanish ? 'Información de Entrega' : 'Delivery Information',
    pickupInfo: isSpanish ? 'Información de Recogida' : 'Pickup Information',
    orderNumber: isSpanish ? 'Número de Orden:' : 'Order Number:',
    deliveryAddress: isSpanish ? 'Dirección de Entrega:' : 'Delivery Address:',
    deliveryNote: isSpanish ? 'Tu pedido será entregado pronto. Por favor asegúrate de que haya alguien disponible para recibirlo.' : 'Your order will be delivered soon. Please ensure someone is available to receive it.',
    pickupNote: isSpanish ? 'Puedes recoger tu pedido en nuestra panadería. Por favor trae una identificación válida.' : 'You can pick up your order at our bakery location. Please bring a valid ID.',
    pickupLocation: isSpanish ? 'Ubicación de Recogida:' : 'Pickup Location:',
    phone: isSpanish ? 'Teléfono:' : 'Phone:',
    viewDetails: isSpanish ? 'Ver Detalles del Pedido' : 'View Order Details',
    questions: isSpanish ? '¿Preguntas?' : 'Questions?',
    contactUs: isSpanish ? 'Contáctanos al' : 'Contact us at',
    or: isSpanish ? 'o' : 'or',
    thanks: isSpanish ? "¡Gracias por elegir Eli's Bakery!" : "Thank you for choosing Eli's Bakery!"
  };

  const bodyContent = `
    <p style="font-size:16px;color:#333;margin:0 0 8px;">${labels.greeting} <strong>${escapeHtml(order.customer_name)}</strong>,</p>
    <p style="font-size:15px;color:#555;margin:0 0 24px;">${labels.intro}</p>

    <div style="background:#faf8f4;border-radius:10px;padding:24px 28px;margin:0 0 24px;border-left:4px solid #22a15e;">
      <h2 style="color:#1a6b3c;font-family:'Playfair Display',Georgia,serif;font-size:16px;font-weight:700;margin:0 0 14px;">
        ${isDelivery ? `🚗 ${labels.deliveryInfo}` : `📍 ${labels.pickupInfo}`}
      </h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;width:44%;border-bottom:1px solid #f0ead8;">${labels.orderNumber}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:700;border-bottom:1px solid #f0ead8;">${escapeHtml(order.order_number)}</td>
        </tr>
        ${isDelivery ? `
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">${labels.deliveryAddress}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${escapeHtml(order.delivery_address)}${order.delivery_apartment ? `, ${escapeHtml(order.delivery_apartment)}` : ''}</td>
        </tr>` : `
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">${labels.pickupLocation}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">324 W Marshall St, Norristown, PA 19401</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#777;font-size:13px;">${labels.phone}</td>
          <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;">${biz.phone}</td>
        </tr>`}
      </table>
      <p style="color:#555;font-size:13px;margin:14px 0 0;padding-top:12px;border-top:1px solid #e8dcc8;">
        ${isDelivery ? labels.deliveryNote : labels.pickupNote}
      </p>
    </div>

    <div style="text-align:center;margin:28px 0 16px;">
      <a href="${trackingUrl}" style="background:linear-gradient(135deg,#C6A649 0%,#d4af37 100%);color:#1A1A2E;padding:14px 36px;text-decoration:none;border-radius:7px;display:inline-block;font-weight:700;font-size:15px;letter-spacing:0.5px;font-family:'Nunito',Arial,sans-serif;">
        ${labels.viewDetails} &rarr;
      </a>
    </div>

    <p style="font-size:14px;color:#888;text-align:center;margin:0;">${labels.thanks}</p>
  `;

  return buildEmailHtml({
    titleEmoji: '🎉',
    title: labels.title,
    titleBandStyle: 'success',
    bodyContent,
    frontendUrl: FRONTEND_URL,
  });
}

function generateReadyText(order: ReadyNotificationData, trackingUrl: string, isSpanish: boolean): string {
  const isDelivery = order.delivery_option === 'delivery';
  const biz = getBusinessInfo(isSpanish ? 'es' : 'en');

  if (isSpanish) {
    return `
¡Tu Pedido Está Listo!

Estimado/a ${order.customer_name},

¡Buenas noticias! ¡Tu pedido de pastel personalizado está listo!

Número de Orden: ${order.order_number}

${isDelivery ? `
Información de Entrega:
- Dirección de Entrega: ${order.delivery_address}${order.delivery_apartment ? `, ${order.delivery_apartment}` : ''}
- Tu pedido será entregado pronto. Por favor asegúrate de que haya alguien disponible para recibirlo.
` : `
Información de Recogida:
- Puedes recoger tu pedido en nuestra panadería
- Por favor trae una identificación válida
- Ubicación: 324 W Marshall St, Norristown, PA 19401
- Teléfono: ${biz.phone}
`}

Ver detalles del pedido: ${trackingUrl}

¿Preguntas? Contáctanos al ${biz.phone} o ${biz.email}

¡Gracias por elegir Eli's Bakery! 🎂
    `;
  }

  return `
Your Order is Ready!

Dear ${order.customer_name},

Great news! Your custom cake order is ready!

Order Number: ${order.order_number}

${isDelivery ? `
Delivery Information:
- Delivery Address: ${order.delivery_address}${order.delivery_apartment ? `, ${order.delivery_apartment}` : ''}
- Your order will be delivered soon. Please ensure someone is available to receive it.
` : `
Pickup Information:
- You can pick up your order at our bakery location
- Please bring a valid ID
- Location: 324 W Marshall St, Norristown, PA 19401
- Phone: ${biz.phone}
`}

View order details: ${trackingUrl}

Questions? Contact us at ${biz.phone} or ${biz.email}

Thank you for choosing Eli's Bakery! 🎂
  `;
}
