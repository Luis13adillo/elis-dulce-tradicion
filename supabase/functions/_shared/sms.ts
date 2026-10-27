// SMS provider seam. Eli's has no SMS provider yet, so the only real
// implementation is a no-op that reports "disabled". When a provider
// (e.g. Twilio) is chosen, add it here behind the same interface and keep
// SMS_ENABLED as the master switch. No network calls happen unless
// SMS_ENABLED === "true" AND a provider is configured.

export interface SmsResult {
    sent: boolean;
    reason: "sent" | "disabled" | "no_provider" | "no_recipient" | "error";
    detail?: string;
}

export interface SmsProvider {
    readonly name: string;
    send(to: string, body: string): Promise<SmsResult>;
}

type EnvGetter = (key: string) => string | undefined;

export function smsEnabled(env: EnvGetter): boolean {
    return (env("SMS_ENABLED") ?? "").trim().toLowerCase() === "true";
}

/** Stub provider: never sends, always reports why. */
export const disabledProvider: SmsProvider = {
    name: "disabled",
    send: () => Promise.resolve({ sent: false, reason: "disabled" }),
};

export const noProvider: SmsProvider = {
    name: "none",
    send: () => Promise.resolve({ sent: false, reason: "no_provider" }),
};

/**
 * Resolve the active provider. Defaults to OFF. With SMS_ENABLED=true but
 * no SMS_PROVIDER implemented, returns noProvider so callers record that
 * the alert could not go out rather than silently pretending it did.
 */
export function getSmsProvider(env: EnvGetter): SmsProvider {
    if (!smsEnabled(env)) return disabledProvider;
    const provider = (env("SMS_PROVIDER") ?? "").trim().toLowerCase();
    switch (provider) {
        // case "twilio": return twilioProvider(env);  // not wired yet
        default:
            return noProvider;
    }
}

export function kitchenAlertSmsBody(order: { order_number?: string | null; customer_name?: string | null; time_needed?: string | null; date_needed?: string | null }): string {
    const num = order.order_number ?? "?";
    const when = [order.date_needed, order.time_needed].filter(Boolean).join(" ");
    return `Eli's: paid order #${num}${when ? ` (${when})` : ""} has not been accepted for 3+ min. Please open the Front Desk.`;
}
