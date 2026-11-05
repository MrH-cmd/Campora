import { Card, LinkButton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asSystem } from "@/lib/db";
import { settleTransaction } from "@/lib/payments/settle";

export const metadata = { title: "Payment" };

/** The browser landing here proves nothing. The result shown comes only from the provider's own answer. */
export default async function Callback({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const { reference } = await searchParams;
  const u = await requireUser();
  const own = reference ? await asSystem((db) => db.one("select purpose from transactions where reference=$1 and user_id=$2", [reference, u.id])) : null;
  let status = "unknown";
  if (own) { try { status = (await settleTransaction(reference!)).status; } catch { status = "unknown"; } }
  const next = own?.purpose === "order" ? "/account/orders" : own?.purpose === "boost" ? "/seller/boosts" : "/seller/billing";
  const copy: Record<string, [string, string]> = {
    success: ["Payment confirmed", "Your payment was verified with the provider."],
    failed: ["Payment failed", "You weren't charged, or the amount didn't match. Try again."],
    initiated: ["Payment still processing", "We'll update this as soon as the provider confirms it."],
    unknown: ["We couldn't check this payment", "If you were charged, it will appear once the provider confirms it."],
  };
  const [title, body] = copy[status] ?? copy.unknown;
  return <div className="mx-auto max-w-md px-4 py-16"><Card><h1 className="text-2xl font-bold">{title}</h1><p className="mt-1 text-mute">{body}</p><LinkButton href={next} className="mt-4">Continue</LinkButton></Card></div>;
}
