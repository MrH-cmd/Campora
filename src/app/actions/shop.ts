"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { action, id, optional, text } from "@/lib/action";
import { ActionError, currentUser, rateLimit, requireUser } from "@/lib/auth";
import { asSystem, asUser } from "@/lib/db";
import { notify } from "@/lib/notify";
import { changeOrderStatus, placeOrders } from "@/lib/orders";

async function signedIn(next = "/") {
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (u.status !== "active") throw new ActionError("Your account is restricted, so this action is unavailable.");
  return u;
}

export const addToCart = action(z.object({ listing_id: id, quantity: z.coerce.number().int().min(1).max(50).default(1), back: z.string().optional() }), async (d) => {
  const u = await signedIn(d.back);
  await asUser(u.id, async (db) => {
    const l = await db.one("select kind, price_type, in_stock, stock, storefront_id from listing_cards where id=$1 and status='active'", [d.listing_id]);
    if (!l) throw new ActionError("This listing is no longer available.");
    if (!l.in_stock) throw new ActionError("This item is out of stock.");
    if (l.price_type === "starting_from") throw new ActionError("This service is priced per job. Message the seller for a quote.");
    const mine = await db.one("select 1 from storefronts where id=$1 and owner_id=$2", [l.storefront_id, u.id]);
    if (mine) throw new ActionError("You can't buy from your own storefront.");
    await db.run(
      `insert into cart_items(user_id,listing_id,quantity) values ($1,$2,$3)
       on conflict (user_id,listing_id) do update set quantity = least(cart_items.quantity + excluded.quantity, 50)`, [u.id, d.listing_id, d.quantity]);
  });
  revalidatePath("/", "layout");
  return "Added to cart.";
});

export const setCartQuantity = action(z.object({ listing_id: id, quantity: z.coerce.number().int().min(0).max(50) }), async (d) => {
  const u = await signedIn("/cart");
  await asUser(u.id, (db) => d.quantity === 0
    ? db.run("delete from cart_items where user_id=$1 and listing_id=$2", [u.id, d.listing_id])
    : db.run("update cart_items set quantity=$3 where user_id=$1 and listing_id=$2", [u.id, d.listing_id, d.quantity]));
  revalidatePath("/", "layout");
  return d.quantity === 0 ? "Removed from cart." : "Cart updated.";
});

export const toggleFavourite = action(z.object({ listing_id: id.optional(), storefront_id: id.optional(), back: z.string().optional() }), async (d) => {
  const u = await signedIn(d.back);
  const col = d.listing_id ? "listing_id" : "storefront_id";
  const value = d.listing_id ?? d.storefront_id;
  const removed = await asUser(u.id, async (db) => {
    const n = await db.run(`delete from favourites where user_id=$1 and ${col}=$2`, [u.id, value]);
    if (!n) await db.run(`insert into favourites(user_id,${col}) values ($1,$2)`, [u.id, value]);
    return n > 0;
  });
  return removed ? "Removed from favourites." : "Saved to favourites.";
});

export const checkout = action(z.object({
  pay: z.string({ error: "Choose how to pay" }),
  pickup_point: text(2, 120, "Pickup point"), note: optional(300), coupon: optional(20),
}), async (d) => {
  const u = await signedIn("/checkout");
  const [method, provider] = d.pay.split(":");
  if (method !== "online" && method !== "pay_on_pickup") throw new ActionError("Choose how to pay.");
  const r = await placeOrders(u, { paymentMethod: method, provider, pickupPoint: d.pickup_point, note: d.note, coupon: d.coupon });
  redirect(r.paymentUrl ?? "/account/orders?placed=1");
});

export const buyerCancel = action(z.object({ order_id: id }), async (d) => {
  const u = await signedIn();
  await changeOrderStatus(u, d.order_id, "cancelled", { note: "Cancelled by buyer" });
  return "Order cancelled.";
});

export const submitReview = action(z.object({ order_item_id: id, rating: z.coerce.number().int().min(1, "Pick a star rating").max(5), body: optional(1000) }), async (d) => {
  const u = await signedIn();
  await asSystem(async (db) => {
    const it = await db.one(
      `select i.id, i.listing_id, o.storefront_id, s.owner_id from order_items i join orders o on o.id=i.order_id join storefronts s on s.id=o.storefront_id
       where i.id=$1 and o.buyer_id=$2 and o.status='completed'`, [d.order_item_id, u.id]);
    if (!it) throw new ActionError("You can review items from completed orders only.");
    const n = await db.run(
      "insert into reviews(order_item_id,listing_id,storefront_id,author_id,rating,body) values ($1,$2,$3,$4,$5,$6) on conflict do nothing",
      [it.id, it.listing_id, it.storefront_id, u.id, d.rating, d.body]);
    if (!n) throw new ActionError("You've already reviewed this item.");
    await notify(db, it.owner_id, `New ${d.rating}-star review`, d.body, "/seller");
  });
  return "Review published.";
});

/** Starts or continues the single buyer-seller thread, then delivers the message. */
export const sendEnquiry = action(z.object({
  storefront_id: id, body: text(1, 2000, "Message"), listing_id: id.optional(), order_id: id.optional(), back: z.string().optional(),
}), async (d) => {
  const u = await signedIn(d.back);
  await rateLimit(`msg:${u.id}`, 40, 60);
  const convoId = await asUser(u.id, async (db) => {
    const store = await db.one("select owner_id from storefronts where id=$1", [d.storefront_id]);
    if (!store) throw new ActionError("Storefront not found.");
    if (store.owner_id === u.id) throw new ActionError("This is your own storefront.");
    await db.run("insert into conversations(buyer_id,storefront_id) values ($1,$2) on conflict do nothing", [u.id, d.storefront_id]);
    const c = await db.one("select id from conversations where buyer_id=$1 and storefront_id=$2", [u.id, d.storefront_id]);
    await db.run("insert into messages(conversation_id,sender_id,body,listing_id,order_id) values ($1,$2,$3,$4,$5)", [c.id, u.id, d.body, d.listing_id ?? null, d.order_id ?? null]);
    await db.run("update conversations set last_message_at=now() where id=$1", [c.id]);
    return c.id as string;
  });
  await asSystem(async (db) => {
    const s = await db.one("select owner_id, name from storefronts where id=$1", [d.storefront_id]);
    await notify(db, s.owner_id, `Enquiry from ${u.full_name}`, d.body.slice(0, 100), `/messages/${convoId}`);
    if (d.listing_id) await db.run(
      `insert into listing_daily_stats(listing_id, enquiries) values ($1,1)
       on conflict (listing_id, day) do update set enquiries = listing_daily_stats.enquiries + 1`, [d.listing_id]);
  });
  redirect(`/messages/${convoId}`);
});

export const reply = action(z.object({ conversation_id: id, body: text(1, 2000, "Message") }), async (d) => {
  const u = await signedIn();
  await rateLimit(`msg:${u.id}`, 40, 60);
  const c = await asUser(u.id, async (db) => {
    const convo = await db.one("select c.id, c.buyer_id, s.owner_id from conversations c join storefronts s on s.id=c.storefront_id where c.id=$1", [d.conversation_id]);
    if (!convo || (convo.buyer_id !== u.id && convo.owner_id !== u.id)) throw new ActionError("You can't post in this conversation.");
    await db.run("insert into messages(conversation_id,sender_id,body) values ($1,$2,$3)", [d.conversation_id, u.id, d.body]);
    await db.run("update conversations set last_message_at=now() where id=$1", [d.conversation_id]);
    return convo;
  });
  const other = c.buyer_id === u.id ? c.owner_id : c.buyer_id;
  await asSystem((db) => notify(db, other, `Message from ${u.full_name}`, d.body.slice(0, 100), `/messages/${d.conversation_id}`));
  return "Sent.";
});

export const report = action(z.object({
  target_type: z.enum(["listing", "storefront", "user", "review"]), target_id: id, reason: text(3, 80, "Reason"), details: optional(800),
}), async (d) => {
  const u = await signedIn();
  await rateLimit(`report:${u.id}`, 10, 3600);
  await asUser(u.id, (db) => db.run("insert into reports(reporter_id,target_type,target_id,reason,details) values ($1,$2,$3,$4,$5)", [u.id, d.target_type, d.target_id, d.reason, d.details]));
  return "Report sent to the Campora team.";
});

export const openDispute = action(z.object({ order_id: id, reason: text(10, 800, "Reason") }), async (d) => {
  const u = await requireUser();
  await asSystem(async (db) => {
    const o = await db.one("select o.id, o.buyer_id, s.owner_id from orders o join storefronts s on s.id=o.storefront_id where o.id=$1", [d.order_id]);
    if (!o || (o.buyer_id !== u.id && o.owner_id !== u.id)) throw new ActionError("You don't have access to this order.");
    const n = await db.run("insert into disputes(order_id,opened_by,reason) values ($1,$2,$3) on conflict do nothing", [d.order_id, u.id, d.reason]);
    if (!n) throw new ActionError("A dispute is already open on this order.");
  });
  return "Dispute opened. An admin will step in.";
});

export const markAllRead = action(z.object({}), async () => {
  const u = await requireUser();
  await asUser(u.id, (db) => db.run("update notifications set read_at=now() where user_id=$1 and read_at is null", [u.id]));
  revalidatePath("/", "layout");
  return "All caught up.";
});
