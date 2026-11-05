import { asSystem } from "@/lib/db";
import { providers, type ProviderName } from "@/lib/payments/providers";
import { settleTransaction } from "@/lib/payments/settle";

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const name = (await params).provider as ProviderName;
  const provider = providers[name];
  if (!provider?.configured()) return new Response("Unknown provider", { status: 404 });
  const raw = await req.text();
  const hit = provider.parseWebhook(raw, req.headers);
  if (!hit) return new Response("Invalid signature", { status: 401 });
  const fresh = await asSystem((db) => db.run(
    "insert into webhook_events(provider,event_id,payload) values ($1,$2,$3) on conflict do nothing", [name, hit.eventId, raw]));
  if (fresh && hit.reference) {
    try { await settleTransaction(hit.reference); }
    catch (e) {
      // Let the provider retry: forget the event so the retry isn't skipped.
      console.error("Webhook settle failed", e);
      await asSystem((db) => db.run("delete from webhook_events where provider=$1 and event_id=$2", [name, hit.eventId]));
      return new Response("Retry", { status: 500 });
    }
  }
  return new Response("ok");
}
