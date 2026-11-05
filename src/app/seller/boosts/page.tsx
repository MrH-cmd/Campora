import { buyBoost, sellerContext } from "@/app/actions/seller";
import { Field, Form, Submit } from "@/components/form";
import { Badge, Card, Empty, LinkButton, PageHead, Stat, statusTone, Table, Td } from "@/components/ui";
import { asUser } from "@/lib/db";
import { naira, PLACEMENT_LABEL, shortDate } from "@/lib/format";
import { configuredProviders } from "@/lib/payments/providers";

export const metadata = { title: "Store Boosts" };
export default async function Boosts() {
  const { user, store } = await sellerContext();
  if (!store) return <Empty title="Set up your storefront first" action={<LinkButton href="/seller/storefront">Set up storefront</LinkButton>} />;
  const d = await asUser(user.id, async (db) => ({
    credits: (await db.one("select coalesce(sum(delta),0)::int n from boost_credit_ledger where seller_id=$1", [user.id])).n,
    packages: await db.rows("select * from boost_packages where is_active order by price_kobo nulls last"),
    listings: await db.rows("select id,title from listings where storefront_id=$1 and status='active' order by title", [store.id]),
    boosts: await db.rows("select b.*, p.name, l.title from store_boosts b join boost_packages p on p.id=b.package_id left join listings l on l.id=b.listing_id where b.storefront_id=$1 and b.status<>'pending_payment' order by b.created_at desc limit 20", [store.id]),
  }));
  const online = configuredProviders();
  return (
    <>
      <PageHead title="Store Boosts" sub="Pay to appear higher. Boosted placements are labelled Sponsored." />
      <div className="mb-4 max-w-48"><Stat label="Boost credits" value={d.credits} /></div>
      {d.packages.length === 0 ? <Empty title="No boosts on offer right now" /> : (
        <div className="grid gap-3 md:grid-cols-3">
          {d.packages.map((p) => {
            const canPay = p.price_kobo != null && Number(p.price_kobo) > 0 && online.length > 0;
            const canCredit = d.credits >= p.credit_cost;
            return (
              <Card key={p.id}>
                <h2 className="text-lg font-bold">{p.name}</h2>
                <p className="text-sm text-mute">{PLACEMENT_LABEL[p.placement]} for {p.duration_days} days</p>
                <p className="mt-1 font-semibold">{p.price_kobo != null ? naira(p.price_kobo) : "Price coming soon"} or {p.credit_cost} credit{p.credit_cost === 1 ? "" : "s"}</p>
                {canPay || canCredit ? (
                  <Form action={buyBoost} className="mt-3 space-y-2">
                    <input type="hidden" name="package_id" value={p.id} />
                    <Field label="Boost" name="listing_id" as="select" required={p.placement === "homepage_featured"}>
                      {p.placement !== "homepage_featured" && <option value="">Whole storefront</option>}
                      {d.listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                    </Field>
                    <Field label="Pay with" name="pay_with" as="select">{canCredit && <option value="credits">Boost credits</option>}{canPay && <option value="payment">Card or transfer</option>}</Field>
                    {canPay && <Field label="Provider" name="provider" as="select">{online.map((x) => <option key={x} value={x}>{x}</option>)}</Field>}
                    <Submit size="sm" className="w-full">Start boost</Submit>
                  </Form>
                ) : <p className="mt-2 text-sm text-mute">{online.length ? "Not enough credits." : "Online payment isn't switched on yet, and you don't have enough credits."}</p>}
              </Card>
            );
          })}
        </div>
      )}
      <h2 className="mb-2 mt-8 text-xl font-bold">Your boosts</h2>
      {d.boosts.length === 0 ? <Empty title="No boosts yet" /> : (
        <Table head={["Boost", "On", "Paid with", "Ends", "Status"]}>{d.boosts.map((b) => <tr key={b.id}><Td>{b.name}</Td><Td>{b.title ?? "Whole storefront"}</Td><Td className="capitalize">{b.paid_with}</Td><Td>{b.ends_at ? shortDate(b.ends_at) : ""}</Td><Td><Badge tone={statusTone(b.status)}>{b.status}</Badge></Td></tr>)}</Table>
      )}
    </>
  );
}
