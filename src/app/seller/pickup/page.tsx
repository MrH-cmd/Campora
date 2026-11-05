import { removePickupPoint, savePickupPoint, sellerContext } from "@/app/actions/seller";
import { ActionButton, Field, Form, Submit } from "@/components/form";
import { Card, Empty, LinkButton, PageHead } from "@/components/ui";
import { asUser } from "@/lib/db";

export const metadata = { title: "Pickup points" };
export default async function Pickup() {
  const { user, store } = await sellerContext();
  if (!store) return <Empty title="Set up your storefront first" action={<LinkButton href="/seller/storefront">Set up storefront</LinkButton>} />;
  const d = await asUser(user.id, async (db) => ({
    points: await db.rows("select * from storefront_pickup_points where storefront_id=$1 and is_active order by created_at", [store.id]),
    uni: await db.one("select pickup_points from universities where id=$1", [store.university_id]),
  }));
  return (
    <div className="max-w-2xl space-y-4">
      <PageHead title="Pickup points" sub="Buyers choose from these at checkout. With none set, they see every campus pickup point." />
      <Card>
        <Form action={savePickupPoint} resetOnSuccess className="space-y-2">
          <Field label="Pickup point" name="name" list="campus-points" />
          <datalist id="campus-points">{(d.uni?.pickup_points ?? []).map((p: string) => <option key={p} value={p} />)}</datalist>
          <div className="grid grid-cols-2 gap-2"><Field label="Days" name="available_days" placeholder="Weekdays" /><Field label="Time" name="time_window" placeholder="4pm to 6pm" /></div>
          <Field label="Instructions" name="instructions" placeholder="Call when you arrive" />
          <Submit size="sm">Add pickup point</Submit>
        </Form>
      </Card>
      {d.points.map((p) => (
        <Card key={p.id} className="flex items-center justify-between gap-3">
          <div><p className="font-semibold">{p.name}</p><p className="text-sm text-mute">{[p.available_days, p.time_window, p.instructions].filter(Boolean).join(", ")}</p></div>
          <ActionButton action={removePickupPoint} values={{ id: p.id }} variant="danger">Remove</ActionButton>
        </Card>
      ))}
    </div>
  );
}
