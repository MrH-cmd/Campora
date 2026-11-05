import { Check } from "lucide-react";
import { Reveal } from "@/components/motion";
import { LinkButton } from "@/components/ui";
import { asUser } from "@/lib/db";
import { naira } from "@/lib/format";

export const metadata = { title: "Seller plans" };

export default async function Pricing() {
  const plans = await asUser(null, (db) => db.rows("select * from subscription_plans order by sort"));
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="max-w-2xl text-4xl font-bold sm:text-6xl">Start with K-Leg. Grow into Odogwu.</h1>
      <p className="mt-3 max-w-lg text-lg text-mute">Every plan gets one storefront. You move up when you need more listings, photos and reach.</p>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {plans.map((p, i) => {
          const hero = i === plans.length - 1;
          return (
            <Reveal key={p.id} delay={i * .08} className={`flex flex-col rounded-[24px] p-6 ${hero ? "border border-palm bg-mint-soft text-white shadow-[0_20px_60px_-30px_#7c3aed]" : "border border-line bg-card"}`}>
              <h2 className="text-2xl font-bold">{p.name}</h2>
              <p className={hero ? "text-white/70" : "text-mute"}>{p.tagline}</p>
              <p className="display mt-4 text-4xl font-bold">
                {p.price_kobo == null ? <span className="text-2xl">Price coming soon</span> : <>{naira(p.price_kobo)}<span className="text-base font-medium">/month</span></>}
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-[15px]">
                {p.features.map((f: string) => <li key={f} className="flex gap-2"><Check size={18} className="mt-0.5 shrink-0 text-palm-deep" aria-hidden />{f}</li>)}
              </ul>
              <LinkButton href={i === 0 ? "/account/become-seller" : "/seller/billing"} className="mt-6" variant={hero ? "primary" : "dark"}>{i === 0 ? "Start for free" : `Choose ${p.name}`}</LinkButton>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
