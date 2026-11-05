import Link from "next/link";
import { checkPayout, processPayout, processRefund, sendPayout } from "@/app/actions/admin";
import { ActionButton, Field, Form, Submit } from "@/components/form";
import { Badge, Card, Empty, PageHead, Stat, statusTone, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { naira, shortDate } from "@/lib/format";
import { configuredProviders } from "@/lib/payments/providers";

export const metadata = { title: "Finance" };
const TABS = [["transactions", "Payments"], ["commissions", "Commissions"], ["refunds", "Refunds"], ["payouts", "Payouts"], ["subscriptions", "Subscriptions"]];

export default async function Finance({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "transactions" } = await searchParams;
  const a = await requireAdmin();
  const d = await asUser(a.id, async (db) => ({
    t: await db.one(
      `select (select coalesce(sum(amount_kobo),0) from transactions where status='success' and purpose='order') gmv,
        (select coalesce(sum(commission_kobo),0) from commissions where status='earned') commission,
        (select coalesce(sum(amount_kobo),0) from transactions where status='success' and purpose='subscription') subs,
        (select coalesce(sum(amount_kobo),0) from transactions where status='success' and purpose='boost') boosts`),
    txns: tab === "transactions" ? await db.rows("select t.*, u.email from transactions t join users u on u.id=t.user_id order by t.created_at desc limit 100") : [],
    comm: tab === "commissions" ? await db.rows("select c.*, o.number, s.name from commissions c join orders o on o.id=c.order_id join storefronts s on s.id=c.storefront_id order by c.created_at desc limit 100") : [],
    refunds: tab === "refunds" ? await db.rows("select r.*, o.number from refunds r join orders o on o.id=r.order_id order by r.status='requested' desc, r.created_at desc limit 100") : [],
    payouts: tab === "payouts" ? await db.rows("select p.*, s.name from seller_payouts p join storefronts s on s.id=p.storefront_id order by p.status='requested' desc, p.created_at desc limit 100") : [],
    subs: tab === "subscriptions" ? await db.rows("select s.*, u.email, p.name from subscriptions s join users u on u.id=s.seller_id join subscription_plans p on p.id=s.plan_id order by s.created_at desc limit 100") : [],
  }));
  const online = configuredProviders();
  return (
    <>
      <PageHead title="Finance" sub={online.length ? `Live providers: ${online.join(", ")}` : "No payment provider is set up. Nothing can be charged until keys are added."} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Paid order value" value={naira(d.t.gmv)} /><Stat label="Commission earned" value={naira(d.t.commission)} /><Stat label="Subscription income" value={naira(d.t.subs)} /><Stat label="Boost income" value={naira(d.t.boosts)} /></div>
      <div className="my-4 flex gap-1 overflow-x-auto">{TABS.map(([k, l]) => <Link key={k} href={`/admin/finance?tab=${k}`} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${tab === k ? "bg-panel text-white" : "border border-line bg-card"}`}>{l}</Link>)}</div>
      {tab === "transactions" && (d.txns.length === 0 ? <Empty title="No payments recorded" /> : <Table head={["Reference", "User", "For", "Amount", "Provider", "Status", "Date"]}>{d.txns.map((t) => <tr key={t.id}><Td className="text-xs">{t.reference}</Td><Td>{t.email}</Td><Td className="capitalize">{t.purpose}</Td><Td>{naira(t.amount_kobo)}</Td><Td className="capitalize">{t.provider}</Td><Td><Badge tone={statusTone(t.status)}>{t.status}</Badge></Td><Td>{shortDate(t.created_at)}</Td></tr>)}</Table>)}
      {tab === "commissions" && (d.comm.length === 0 ? <Empty title="No commissions yet" /> : <Table head={["Order", "Store", "Sale", "Rate", "Commission", "Status"]}>{d.comm.map((c) => <tr key={c.id}><Td>{c.number}</Td><Td>{c.name}</Td><Td>{naira(c.gross_kobo)}</Td><Td>{c.rate_bps / 100}%</Td><Td>{naira(c.commission_kobo)}</Td><Td><Badge tone={statusTone(c.status)}>{c.status}</Badge></Td></tr>)}</Table>)}
      {tab === "refunds" && (d.refunds.length === 0 ? <Empty title="No refunds" /> : <div className="space-y-2">{d.refunds.map((r) => (
        <Card key={r.id} className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="font-semibold">{r.number}, {naira(r.amount_kobo)}</p><p className="text-sm text-mute">{r.reason}</p></div>
          {r.status === "requested" ? <div className="flex gap-1"><ActionButton action={processRefund} values={{ id: r.id, decision: "process" }} variant="primary" confirm="Send this refund through the payment provider?">Send refund</ActionButton><ActionButton action={processRefund} values={{ id: r.id, decision: "reject" }}>Reject</ActionButton></div> : <Badge tone={statusTone(r.status)}>{r.status}</Badge>}
        </Card>
      ))}</div>)}
      {tab === "payouts" && (d.payouts.length === 0 ? <Empty title="No payouts" /> : <div className="space-y-2">{d.payouts.map((p) => (
        <Card key={p.id}>
          <div className="flex justify-between gap-2"><p className="font-semibold">{p.name}, {naira(p.amount_kobo)}</p><Badge tone={statusTone(p.status)}>{p.status}</Badge></div>
          <p className="text-sm text-mute">{p.bank_snapshot.bank_name}, {p.bank_snapshot.account_number}, {p.bank_snapshot.account_name}</p>
          {p.status === "processing" && <div className="mt-2"><ActionButton action={checkPayout} values={{ id: p.id }}>Check with Paystack</ActionButton></div>}
          {p.status === "requested" && online.includes("paystack") && <div className="mt-2 flex gap-2"><ActionButton action={sendPayout} values={{ id: p.id }} variant="primary" confirm="Send this payout through Paystack?">Send with Paystack</ActionButton></div>}
          {p.status === "requested" && !online.includes("paystack") && (
            <Form action={processPayout} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={p.id} />
              <Field label="Bank transfer reference" name="bank_reference" />
              <Field label="Decision" name="decision" as="select"><option value="paid">I've sent the money</option><option value="rejected">Reject</option></Field>
              <Submit size="md">Record</Submit>
            </Form>
          )}
        </Card>
      ))}</div>)}
      {tab === "subscriptions" && (d.subs.length === 0 ? <Empty title="No subscriptions" /> : <Table head={["Seller", "Plan", "Status", "Started", "Ends"]}>{d.subs.map((s) => <tr key={s.id}><Td>{s.email}</Td><Td>{s.name}</Td><Td><Badge tone={statusTone(s.status)}>{s.status}</Badge></Td><Td>{shortDate(s.started_at)}</Td><Td>{s.expires_at ? shortDate(s.expires_at) : "No end date"}</Td></tr>)}</Table>)}
    </>
  );
}
