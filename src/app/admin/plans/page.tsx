import Link from "next/link";
import { saveFeatureRule, savePlanNumbers } from "@/app/actions/admin-storefront";
import { Field, Form, Submit } from "@/components/form";
import { PlanComparison } from "@/components/plan-comparison";
import { Card, PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";

export const metadata = { title: "Plan features" };
const PLANS: [string, string][] = [["k-leg", "K-Leg"], ["no-dulling", "No Dulling"], ["odogwu", "Odogwu"]];

export default async function Plans() {
  const a = await requireAdmin();
  const { plans, features } = await asUser(a.id, async (db) => ({
    plans: await db.rows("select code, name, storefront_limit, effect_layers from subscription_plans order by sort"),
    features: await db.rows("select * from plan_features order by sort"),
  }));
  const groups = [...new Set(features.map((f) => f.grp))];
  return (
    <>
      <PageHead title="Plan features" sub="Change what each plan unlocks. Changes apply straight away; sellers who lose something fall back safely and are told." />
      <p className="mb-4 text-sm text-mute">Templates and effects have their own minimum plans on <Link className="underline" href="/admin/templates">Store templates</Link>. Prices and listing limits are unchanged here.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.code}>
            <h2 className="font-bold">{p.name}</h2>
            <Form action={savePlanNumbers} toastOnly className="mt-2 space-y-2">
              <input type="hidden" name="code" value={p.code} />
              <Field label="Storefronts" name="storefront_limit" type="number" min={1} max={50} defaultValue={p.storefront_limit} />
              <Field label="Effect layers per store" name="effect_layers" type="number" min={0} max={6} defaultValue={p.effect_layers} />
              <Submit size="sm" variant="outline">Save {p.name}</Submit>
            </Form>
          </Card>
        ))}
      </div>
      {groups.map((g) => (
        <section key={g} className="mt-6">
          <h2 className="mb-2 font-bold">{g}</h2>
          <div className="space-y-2">{features.filter((f) => f.grp === g).map((f) => (
            <Card key={f.key} className="flex flex-wrap items-end justify-between gap-3" data-feature={f.key}>
              <div className="min-w-0 flex-1"><p className="font-semibold">{f.label}</p><p className="text-sm text-mute">{f.description}</p></div>
              <Form action={saveFeatureRule} toastOnly className="flex items-end gap-2">
                <input type="hidden" name="key" value={f.key} />
                <Field label="Starts on" name="min_plan_code" as="select" defaultValue={f.min_plan_code}>{PLANS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</Field>
                <Submit size="sm" variant="outline">Save</Submit>
              </Form>
            </Card>
          ))}</div>
        </section>
      ))}
      <h2 className="mt-10 mb-3 text-xl font-bold">What sellers see</h2>
      <PlanComparison />
    </>
  );
}
