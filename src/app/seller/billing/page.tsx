import { cancelDowngrade, choosePlan, sellerContext } from "@/app/actions/seller";
import { ActionButton, Field, Form, Submit } from "@/components/form";
import { Badge, Card, Empty, PageHead, statusTone, Table, Td } from "@/components/ui";
import { asUser } from "@/lib/db";
import { naira, shortDate } from "@/lib/format";
import { configuredProviders } from "@/lib/payments/providers";

export const metadata = { title: "Plan and billing" };
export default async function Billing() {
  const { user, plan } = await sellerContext();
  const d = await asUser(user.id, async (db) => ({
    plans: await db.rows("select * from subscription_plans order by sort"),
    sub: await db.one("select s.*, n.name next_name from subscriptions s left join subscription_plans n on n.id=s.next_plan_id where s.seller_id=$1 and s.status='active'", [user.id]),
    txns: await db.rows("select * from transactions where user_id=$1 and purpose in ('subscription','boost') order by created_at desc limit 20", [user.id]),
  }));
  const online = configuredProviders();
  return (
    <>
      <PageHead title="Plan and billing" sub={`You're on ${plan.name}${d.sub?.expires_at ? `, active until ${shortDate(d.sub.expires_at)}` : ""}`} />
      {d.sub?.next_plan_id && <Card className="mb-4 flex items-center justify-between gap-3"><p>You'll move to {d.sub.next_name} on {shortDate(d.sub.expires_at)}.</p><ActionButton action={cancelDowngrade}>Keep my plan</ActionButton></Card>}
      <div className="grid gap-3 md:grid-cols-3">
        {d.plans.map((p) => {
          const current = p.id === plan.id;
          const free = Number(p.price_kobo) === 0 && p.price_kobo != null;
          return (
            <Card key={p.id} className={current ? "border-palm" : ""}>
              <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{p.name}</h2>{current && <Badge tone="green">Current</Badge>}</div>
              <p className="display mt-1 text-2xl font-bold">{p.price_kobo == null ? "Price coming soon" : `${naira(p.price_kobo)}/mo`}</p>
              <p className="mt-1 text-sm text-mute">{p.listing_limit} listings, {p.photo_limit} photos each{p.monthly_boost_credits ? `, ${p.monthly_boost_credits} Boost credits a month` : ""}</p>
              <div className="mt-3">
                {p.price_kobo == null ? <p className="text-sm text-mute">Not on sale yet.</p>
                  : free ? (!current && <ActionButton action={choosePlan} values={{ plan_id: p.id }} confirm="Move to the free plan when your current plan ends?">Switch to {p.name}</ActionButton>)
                  : online.length === 0 ? <p className="text-sm text-mute">Online payment isn't switched on yet.</p> : (
                    <Form action={choosePlan} className="space-y-2">
                      <input type="hidden" name="plan_id" value={p.id} />
                      <Field label="Pay with" name="provider" as="select">{online.map((x) => <option key={x} value={x} className="capitalize">{x}</option>)}</Field>
                      <Submit size="sm" className="w-full">{current ? "Renew for 30 days" : `Move to ${p.name}`}</Submit>
                    </Form>
                  )}
              </div>
            </Card>
          );
        })}
      </div>
      <h2 className="mb-2 mt-8 text-xl font-bold">Billing history</h2>
      {d.txns.length === 0 ? <Empty title="No payments yet" /> : (
        <Table head={["Date", "For", "Amount", "Provider", "Status"]}>{d.txns.map((t) => <tr key={t.id}><Td>{shortDate(t.created_at)}</Td><Td className="capitalize">{t.purpose}</Td><Td>{naira(t.amount_kobo)}</Td><Td className="capitalize">{t.provider}</Td><Td><Badge tone={statusTone(t.status)}>{t.status}</Badge></Td></tr>)}</Table>
      )}
    </>
  );
}
