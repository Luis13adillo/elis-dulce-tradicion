// =====================================================================
// Field validation for the public submission Edge Functions
// (submit-contact, submit-order-issue).
//
// Pure functions, no I/O — unit-tested with `deno test` in
// supabase/functions/_tests/submissionValidation.test.ts.
// =====================================================================

export interface FieldError {
    field: string;
    message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Uploads land in the private reference-images bucket under orders/ — the
// only folder the anon INSERT storage policy allows. No slashes beyond the
// prefix, no "..", just the flat filename our uploader generates.
const STORAGE_PATH_RE = /^orders\/[A-Za-z0-9._-]{1,200}$/;
const ORDER_NUMBER_RE = /^[A-Za-z0-9-]{3,40}$/;

export const CONTACT_SUBJECTS = ["General", "Order Issue", "Custom Request", "Feedback"] as const;
export const ISSUE_CATEGORIES = ["Wrong order", "Quality issue", "Late delivery", "Other"] as const;

export function isEmail(v: unknown): v is string {
    return typeof v === "string" && v.length <= 255 && EMAIL_RE.test(v.trim());
}

export function isUuid(v: unknown): v is string {
    return typeof v === "string" && UUID_RE.test(v);
}

export function isStoragePath(v: unknown): v is string {
    return typeof v === "string" && STORAGE_PATH_RE.test(v);
}

export function isOrderNumber(v: unknown): v is string {
    return typeof v === "string" && ORDER_NUMBER_RE.test(v.trim());
}

function isFilledString(v: unknown, max: number): v is string {
    return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}

export interface ContactPayload {
    name: string;
    email: string;
    phone?: string;
    subject: (typeof CONTACT_SUBJECTS)[number];
    message: string;
    attachment_path?: string;
    order_number?: string;
    client_token: string;
    honeypot?: string;
}

export function validateContactPayload(body: Record<string, unknown>): FieldError[] {
    const errors: FieldError[] = [];
    if (!isFilledString(body.name, 120)) errors.push({ field: "name", message: "Name is required (max 120 chars)" });
    if (!isEmail(body.email)) errors.push({ field: "email", message: "A valid email is required" });
    if (body.phone != null && body.phone !== "" && !isFilledString(body.phone, 30)) {
        errors.push({ field: "phone", message: "Phone must be at most 30 chars" });
    }
    if (!CONTACT_SUBJECTS.includes(body.subject as never)) {
        errors.push({ field: "subject", message: "Invalid subject" });
    }
    if (!isFilledString(body.message, 5000)) {
        errors.push({ field: "message", message: "Message is required (max 5000 chars)" });
    }
    if (body.attachment_path != null && !isStoragePath(body.attachment_path)) {
        errors.push({ field: "attachment_path", message: "Invalid attachment path" });
    }
    if (body.order_number != null && body.order_number !== "" && !isOrderNumber(body.order_number)) {
        errors.push({ field: "order_number", message: "Invalid order number" });
    }
    if (!isUuid(body.client_token)) {
        errors.push({ field: "client_token", message: "client_token must be a UUID" });
    }
    return errors;
}

export interface OrderIssuePayload {
    order_number: string;
    email: string;
    issue_category: (typeof ISSUE_CATEGORIES)[number];
    issue_description: string;
    photo_paths?: string[];
    client_token: string;
    honeypot?: string;
}

export function validateOrderIssuePayload(body: Record<string, unknown>): FieldError[] {
    const errors: FieldError[] = [];
    if (!isOrderNumber(body.order_number)) {
        errors.push({ field: "order_number", message: "A valid order number is required" });
    }
    if (!isEmail(body.email)) {
        errors.push({ field: "email", message: "A valid email is required" });
    }
    if (!ISSUE_CATEGORIES.includes(body.issue_category as never)) {
        errors.push({ field: "issue_category", message: "Invalid issue category" });
    }
    if (!isFilledString(body.issue_description, 5000)) {
        errors.push({ field: "issue_description", message: "Description is required (max 5000 chars)" });
    }
    if (body.photo_paths != null) {
        const paths = body.photo_paths;
        if (!Array.isArray(paths) || paths.length > 3 || !paths.every(isStoragePath)) {
            errors.push({ field: "photo_paths", message: "photo_paths must be up to 3 valid storage paths" });
        }
    }
    if (!isUuid(body.client_token)) {
        errors.push({ field: "client_token", message: "client_token must be a UUID" });
    }
    return errors;
}

/** First hop of x-forwarded-for, or a shared fallback bucket (never bypass). */
export function clientIpFrom(headers: Headers): string {
    const xff = headers.get("x-forwarded-for") ?? "";
    const first = xff.split(",")[0]?.trim() ?? "";
    return first !== "" ? first.slice(0, 64) : "unknown";
}

/** Mask an email the way get_public_order does: abc***@domain. */
export function maskEmail(email: string | null | undefined): string | null {
    if (!email || !email.includes("@")) return null;
    const [local, domain] = email.split("@");
    return `${local.slice(0, 3)}***@${domain}`;
}
