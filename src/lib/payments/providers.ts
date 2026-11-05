import { createHmac, timingSafeEqual } from "node:crypto";
import { ActionError } from "../auth";

export type ProviderName = "paystack" | "flutterwave";
export type Verified = { status: "success" | "failed" | "pending"; amountKobo: number; currency: string; providerReference: string };
export type WebhookHit = { reference: string; eventId: string; event?: string };

export type Provider = {
  name: ProviderName;
  configured: () => boolean;
  initialize: (p: { reference: string; amountKobo: number; email: string; callbackUrl: string }) => Promise<string>;
  verify: (reference: string) => Promise<Verified>;
  parseWebhook: (raw: string, headers: Headers) => WebhookHit | null;
  refund: (p: { reference: string; providerReference: string | null; amountKobo: number }) => Promise<string>;
};

async function call(url: string, secret: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init, headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new Error(`Payment provider error ${res.status}: ${json?.message ?? "no body"}`);
  return json;
}

const paystackBase = () => process.env.PAYSTACK_BASE_URL ?? "https://api.paystack.co";
const flutterwaveBase = () => process.env.FLUTTERWAVE_BASE_URL ?? "https://api.flutterwave.com/v3";

const paystack: Provider = {
  name: "paystack",
  configured: () => !!process.env.PAYSTACK_SECRET_KEY,
  async initialize({ reference, amountKobo, email, callbackUrl }) {
    const j = await call(`${paystackBase()}/transaction/initialize`, process.env.PAYSTACK_SECRET_KEY!, {
      method: "POST", body: JSON.stringify({ reference, amount: amountKobo, email, callback_url: callbackUrl, currency: "NGN" }),
    });
    return j.data.authorization_url;
  },
  async verify(reference) {
    const j = await call(`${paystackBase()}/transaction/verify/${encodeURIComponent(reference)}`, process.env.PAYSTACK_SECRET_KEY!);
    const s = j.data.status;
    return {
      status: s === "success" ? "success" : s === "failed" || s === "abandoned" ? "failed" : "pending",
      amountKobo: Number(j.data.amount), currency: j.data.currency, providerReference: String(j.data.id),
    };
  },
  parseWebhook(raw, headers) {
    const sig = headers.get("x-paystack-signature") ?? "";
    const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY ?? "").update(raw).digest("hex");
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const body = JSON.parse(raw);
    const eventId = `${body.event}:${body.data?.id ?? body.data?.reference}`;
    if (body.event === "charge.success" || String(body.event).startsWith("transfer.")) return { reference: body.data.reference, eventId, event: body.event };
    return { reference: "", eventId, event: body.event };
  },
  async refund({ reference, amountKobo }) {
    const j = await call(`${paystackBase()}/refund`, process.env.PAYSTACK_SECRET_KEY!, {
      method: "POST", body: JSON.stringify({ transaction: reference, amount: amountKobo }),
    });
    return String(j.data?.id ?? j.data?.transaction?.id ?? reference);
  },
};

const flutterwave: Provider = {
  name: "flutterwave",
  configured: () => !!process.env.FLUTTERWAVE_SECRET_KEY,
  async initialize({ reference, amountKobo, email, callbackUrl }) {
    const j = await call(`${flutterwaveBase()}/payments`, process.env.FLUTTERWAVE_SECRET_KEY!, {
      method: "POST",
      body: JSON.stringify({ tx_ref: reference, amount: amountKobo / 100, currency: "NGN", redirect_url: callbackUrl, customer: { email } }),
    });
    return j.data.link;
  },
  async verify(reference) {
    const j = await call(`${flutterwaveBase()}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, process.env.FLUTTERWAVE_SECRET_KEY!);
    const s = j.data.status;
    return {
      status: s === "successful" ? "success" : s === "failed" ? "failed" : "pending",
      amountKobo: Math.round(Number(j.data.amount) * 100), currency: j.data.currency, providerReference: String(j.data.id),
    };
  },
  parseWebhook(raw, headers) {
    const sig = headers.get("verif-hash") ?? "";
    const expected = process.env.FLUTTERWAVE_WEBHOOK_HASH ?? "";
    if (!expected || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const body = JSON.parse(raw);
    return { reference: body.data?.tx_ref ?? "", eventId: `${body.event}:${body.data?.id}` };
  },
  async refund({ providerReference, amountKobo }) {
    if (!providerReference) throw new ActionError("This payment has no Flutterwave ID to refund against.");
    const j = await call(`${flutterwaveBase()}/transactions/${providerReference}/refund`, process.env.FLUTTERWAVE_SECRET_KEY!, {
      method: "POST", body: JSON.stringify({ amount: amountKobo / 100 }),
    });
    return String(j.data?.id ?? providerReference);
  },
};

type Json = Record<string, any>;
const ps = (path: string, body?: Json) => call(`${paystackBase()}${path}`, process.env.PAYSTACK_SECRET_KEY!, body ? { method: "POST", body: JSON.stringify(body) } : undefined);

/** Paystack transfers: used for seller payouts. */
export const transfers = {
  configured: () => !!process.env.PAYSTACK_SECRET_KEY,
  banks: async () => (await ps("/bank?currency=NGN&perPage=200")).data as { name: string; code: string }[],
  resolve: async (accountNumber: string, bankCode: string) =>
    (await ps(`/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`)).data.account_name as string,
  createRecipient: async (name: string, accountNumber: string, bankCode: string) =>
    (await ps("/transferrecipient", { type: "nuban", name, account_number: accountNumber, bank_code: bankCode, currency: "NGN" })).data.recipient_code as string,
  send: async (p: { amountKobo: number; recipient: string; reference: string; reason: string }) =>
    (await ps("/transfer", { source: "balance", amount: p.amountKobo, recipient: p.recipient, reference: p.reference, reason: p.reason })).data as { status: string; transfer_code: string },
  verify: async (reference: string) => (await ps(`/transfer/verify/${encodeURIComponent(reference)}`)).data as { status: string },
};

export const providers: Record<ProviderName, Provider> = { paystack, flutterwave };
export const configuredProviders = () => Object.values(providers).filter((p) => p.configured()).map((p) => p.name);
export const getProvider = (name: string) => {
  const p = providers[name as ProviderName];
  if (!p?.configured()) throw new ActionError("Online payment isn't available yet. The provider has not been set up.");
  return p;
};
