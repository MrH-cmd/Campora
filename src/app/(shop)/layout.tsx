import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { ScrollProgress } from "@/components/motion";
import { currentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  const counts = u ? await asUser(u.id, async (db) => db.one(
    `select (select coalesce(sum(quantity),0)::int from cart_items where user_id=$1) cart,
            (select count(*)::int from notifications where user_id=$1 and read_at is null) unread`, [u.id])) : null;
  return (
    <>
      <ScrollProgress />
      <Header user={u ? { name: u.full_name, role: u.role } : null} cart={counts?.cart ?? 0} unread={counts?.unread ?? 0} />
      <main className="min-h-[60vh]">{children}</main>
      <Footer />
    </>
  );
}
