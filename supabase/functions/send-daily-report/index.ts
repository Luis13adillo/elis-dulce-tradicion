import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@^4.0.0";
import { buildEmailHtml, getBusinessInfo } from "../_shared/emailTemplates.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "orders@elisbakery.com";
const FROM_NAME = Deno.env.get("FROM_NAME") || "Eli's Bakery";
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") || "owner@elisbakery.com";
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://elisbakery.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface DailyMetrics {
  dateLabel: string;
  totalRevenue: number;
  orderCount: number;
  avgOrderValue: number;
  byStatus: Record<string, number>;
  topProducts: { name: string; revenue: number; count: number }[];
  deliveryCount: number;
  pickupCount: number;
}

/**
 * Get date range based on preset string
 */
function getDateRange(preset: string): { start: string; end: string; label: string } {
  const now = new Date();
  const end = now.toISOString();

  switch (preset) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { start: start.toISOString(), end, label: formatDateLabel(start) };
    }
    case "yesterday": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { start: start.toISOString(), end: endOfYesterday.toISOString(), label: formatDateLabel(start) };
    }
    case "this_week": {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
      return { start: start.toISOString(), end, label: `${formatDateLabel(start)} - ${formatDateLabel(now)}` };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: start.toISOString(), end, label: `${formatDateLabel(start)} - ${formatDateLabel(now)}` };
    }
    case "last_30": {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: start.toISOString(), end, label: `${formatDateLabel(start)} - ${formatDateLabel(now)}` };
    }
    default: {
      // Default to yesterday for automated cron
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { start: start.toISOString(), end: endOfYesterday.toISOString(), label: formatDateLabel(start) };
    }
  }
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Compute metrics from order data
 */
function computeMetrics(orders: any[], dateLabel: string): DailyMetrics {
  const nonCancelled = orders.filter((o: any) => o.status !== "cancelled");

  const totalRevenue = nonCancelled.reduce(
    (sum: number, o: any) => sum + (Number(o.total_amount) || 0),
    0
  );
  const orderCount = orders.length;
  const avgOrderValue = nonCancelled.length > 0 ? totalRevenue / nonCancelled.length : 0;

  // Status breakdown
  const byStatus: Record<string, number> = {};
  for (const o of orders) {
    const s = o.status || "unknown";
    byStatus[s] = (byStatus[s] || 0) + 1;
  }

  // Top products by cake_size
  const productMap: Record<string, { revenue: number; count: number }> = {};
  for (const o of nonCancelled) {
    const product = o.cake_size || "Other";
    if (!productMap[product]) productMap[product] = { revenue: 0, count: 0 };
    productMap[product].revenue += Number(o.total_amount) || 0;
    productMap[product].count += 1;
  }
  const topProducts = Object.entries(productMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Delivery vs pickup
  const deliveryCount = nonCancelled.filter((o: any) => o.delivery_option === "delivery").length;
  const pickupCount = nonCancelled.filter((o: any) => o.delivery_option === "pickup").length;

  return {
    dateLabel,
    totalRevenue,
    orderCount,
    avgOrderValue,
    byStatus,
    topProducts,
    deliveryCount,
    pickupCount,
  };
}

/**
 * Generate branded HTML email for the daily report
 */
function generateReportEmail(metrics: DailyMetrics): { html: string; text: string; subject: string } {
  const biz = getBusinessInfo("es");
  const subject = `Eli's Bakery — Reporte Diario (${metrics.dateLabel})`;

  // Status labels (bilingual)
  const statusLabels: Record<string, string> = {
    pending: "Pendiente / Pending",
    confirmed: "Confirmada / Confirmed",
    in_progress: "En Progreso / In Progress",
    ready: "Lista / Ready",
    out_for_delivery: "En Camino / Out for Delivery",
    delivered: "Entregada / Delivered",
    completed: "Completada / Completed",
    cancelled: "Cancelada / Cancelled",
  };

  // Build status rows
  const statusRows = Object.entries(metrics.byStatus)
    .map(
      ([status, count]) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#4a5568;">
            ${statusLabels[status] || status}
          </td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1a202c;font-weight:600;text-align:right;">
            ${count}
          </td>
        </tr>`
    )
    .join("");

  // Build product rows
  const productRows = metrics.topProducts
    .map(
      (p) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#4a5568;">
            ${p.name}
          </td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1a202c;text-align:right;">
            ${formatCurrency(p.revenue)}
          </td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#718096;text-align:right;">
            ${p.count} ${p.count === 1 ? "orden" : "ordenes"}
          </td>
        </tr>`
    )
    .join("");

  const reportBodyContent = `
    <p style="color:#888;font-size:13px;text-align:center;margin:0 0 20px;">${metrics.dateLabel}</p>

    <!-- Summary Cards -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:4px;">
          <div style="background:#faf8f4;border-radius:10px;padding:14px 10px;text-align:center;border:1px solid #e8dcc8;">
            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Ingresos / Revenue</div>
            <div style="font-size:24px;font-weight:700;color:#1A1A2E;">${formatCurrency(metrics.totalRevenue)}</div>
          </div>
        </td>
        <td style="padding:4px;">
          <div style="background:#faf8f4;border-radius:10px;padding:14px 10px;text-align:center;border:1px solid #e8dcc8;">
            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Ordenes / Orders</div>
            <div style="font-size:24px;font-weight:700;color:#1A1A2E;">${metrics.orderCount}</div>
          </div>
        </td>
        <td style="padding:4px;">
          <div style="background:#faf8f4;border-radius:10px;padding:14px 10px;text-align:center;border:1px solid #e8dcc8;">
            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Promedio / Avg</div>
            <div style="font-size:24px;font-weight:700;color:#1A1A2E;">${formatCurrency(metrics.avgOrderValue)}</div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Status Breakdown -->
    <h3 style="font-size:14px;color:#1A1A2E;margin:0 0 10px;padding-bottom:8px;border-bottom:2px solid #C6A649;font-family:'Playfair Display',Georgia,serif;">
      Por Estado / By Status
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${statusRows || '<tr><td style="padding:12px;color:#aaa;text-align:center;font-size:14px;">Sin ordenes / No orders</td></tr>'}
    </table>

    <!-- Top Products -->
    ${metrics.topProducts.length > 0 ? `
    <h3 style="font-size:14px;color:#1A1A2E;margin:0 0 10px;padding-bottom:8px;border-bottom:2px solid #C6A649;font-family:'Playfair Display',Georgia,serif;">
      Top Productos / Top Products
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr style="background:#faf8f4;">
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#888;text-transform:uppercase;font-weight:600;">Producto</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;color:#888;text-transform:uppercase;font-weight:600;">Ingresos</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;color:#888;text-transform:uppercase;font-weight:600;">Ordenes</th>
      </tr>
      ${productRows}
    </table>
    ` : ""}

    <!-- Delivery vs Pickup -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:4px;" width="50%">
          <div style="background:#faf8f4;border-radius:10px;padding:14px;text-align:center;border:1px solid #e8dcc8;">
            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Entregas / Deliveries</div>
            <div style="font-size:22px;font-weight:700;color:#C6A649;">${metrics.deliveryCount}</div>
          </div>
        </td>
        <td style="padding:4px;" width="50%">
          <div style="background:#faf8f4;border-radius:10px;padding:14px;text-align:center;border:1px solid #e8dcc8;">
            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Recolecciones / Pickups</div>
            <div style="font-size:22px;font-weight:700;color:#C6A649;">${metrics.pickupCount}</div>
          </div>
        </td>
      </tr>
    </table>
  `;

  const html = buildEmailHtml({
    titleEmoji: '📊',
    title: 'Reporte Diario',
    titleBandStyle: 'gold',
    bodyContent: reportBodyContent,
    frontendUrl: FRONTEND_URL,
  });

  // Plain text version
  const statusText = Object.entries(metrics.byStatus)
    .map(([status, count]) => `  ${statusLabels[status] || status}: ${count}`)
    .join("\n");

  const productText = metrics.topProducts
    .map((p, i) => `  ${i + 1}. ${p.name} — ${formatCurrency(p.revenue)} (${p.count} orders)`)
    .join("\n");

  const text = `Eli's Bakery — Reporte Diario
${metrics.dateLabel}

RESUMEN / SUMMARY
  Ingresos / Revenue: ${formatCurrency(metrics.totalRevenue)}
  Ordenes / Orders: ${metrics.orderCount}
  Promedio / Average: ${formatCurrency(metrics.avgOrderValue)}

POR ESTADO / BY STATUS
${statusText || "  No orders"}

TOP PRODUCTOS / TOP PRODUCTS
${productText || "  No products"}

ENTREGAS / DELIVERIES: ${metrics.deliveryCount}
RECOLECCIONES / PICKUPS: ${metrics.pickupCount}

---
${FROM_NAME} · ${biz.phone} · ${biz.email}`;

  return { html, text, subject };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }

    // Auth: accept cron secret OR standard Supabase auth
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("authorization");
    const isCronAuth = cronSecret && CRON_SECRET && cronSecret === CRON_SECRET;
    const isBearerAuth = authHeader && authHeader.startsWith("Bearer ");

    if (!isCronAuth && !isBearerAuth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const datePreset = body.datePreset || "yesterday";

    // Get date range
    const { start, end, label } = getDateRange(datePreset);

    // Query orders using service role key (bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: orders, error: queryError } = await supabase
      .from("orders")
      .select("id, order_number, status, total_amount, cake_size, delivery_option, created_at")
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false });

    if (queryError) {
      throw new Error(`Failed to query orders: ${queryError.message}`);
    }

    const metrics = computeMetrics(orders || [], label);
    const { html, text, subject } = generateReportEmail(metrics);

    // Send email via Resend
    const resend = new Resend(RESEND_API_KEY);
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [OWNER_EMAIL],
      subject,
      html,
      text,
    });

    if (emailError) {
      throw new Error(`Email send failed: ${JSON.stringify(emailError)}`);
    }

    const response = {
      success: true,
      messageId: emailResult?.id,
      metrics: {
        dateLabel: label,
        orderCount: metrics.orderCount,
        totalRevenue: metrics.totalRevenue,
        avgOrderValue: metrics.avgOrderValue,
      },
    };

    console.log("Daily report sent:", JSON.stringify(response));

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in send-daily-report:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
