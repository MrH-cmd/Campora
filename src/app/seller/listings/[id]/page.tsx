import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteListing, removeImage, sellerContext } from "@/app/actions/seller";
import { ActionButton } from "@/components/form";
import { ListingForm } from "@/components/listing-form";
import { Badge, Card, Img, PageHead, statusTone } from "@/components/ui";
import { asUser } from "@/lib/db";
import { LISTING_STATUS_LABEL } from "@/lib/format";

export const metadata = { title: "Edit listing" };
export default async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, store, plan } = await sellerContext();
  const d = await asUser(user.id, async (db) => {
    const l = await db.one(
      `select l.*, p.stock, p.item_condition, s.price_type, s.availability, s.turnaround, s.is_available
       from listings l left join products p on p.listing_id=l.id left join services s on s.listing_id=l.id
       where l.id=$1 and l.storefront_id=$2`, [id, store?.id]).catch(() => null);
    if (!l) return null;
    return { l, images: await db.rows("select * from listing_images where listing_id=$1 order by position", [id]), cats: await db.rows("select id,name,kind from categories where is_active order by sort") };
  });
  if (!d) notFound();
  return (
    <div className="max-w-2xl">
      <PageHead title="Edit listing" action={<Badge tone={statusTone(d.l.status)}>{LISTING_STATUS_LABEL[d.l.status]}</Badge>} />
      {d.l.moderation_note && <p className="mb-3 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">Moderator note: {d.l.moderation_note}</p>}
      <Card className="mb-4">
        <h2 className="font-bold">Photos ({d.images.length} of {plan.photo_limit})</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {d.images.map((i) => <div key={i.id} className="w-24"><Img path={i.path} alt="" className="size-24 rounded-lg" /><ActionButton action={removeImage} values={{ image_id: i.id }} variant="ghost">Remove</ActionButton></div>)}
        </div>
      </Card>
      <Card><ListingForm l={d.l} cats={d.cats} photoLimit={plan.photo_limit} photoCount={d.images.length} /></Card>
      <div className="mt-4 flex items-center gap-3">
        {d.l.status === "active" && <Link className="text-sm font-semibold underline" href={`/listing/${d.l.slug}`}>View public page</Link>}
        <ActionButton action={deleteListing} values={{ id }} variant="danger" confirm="Delete this listing for good?">Delete listing</ActionButton>
      </div>
    </div>
  );
}
