import { saveEffect, saveTemplate } from "@/app/actions/admin-storefront";
import { Field, Form, Submit } from "@/components/form";
import { Badge, Card, PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { ARCHETYPES, ARCHETYPE_LABEL, BUTTONS, CARDS, EFFECT_CATEGORIES, FONTS, FONT_IDS, HEROES, HERO_LABEL, PALETTES, type Template } from "@/lib/storefront-catalog";

export const metadata = { title: "Store templates" };
const PLANS: [string, string][] = [["k-leg", "K-Leg"], ["no-dulling", "No Dulling"], ["odogwu", "Odogwu"]];
const Opt = ({ list }: { list: readonly string[] | [string, string][] }) => <>{list.map((x) => Array.isArray(x) ? <option key={x[0]} value={x[0]}>{x[1]}</option> : <option key={x} value={x}>{x}</option>)}</>;

function TemplateForm({ t }: { t?: Template & { id: string } }) {
  const c = t?.config;
  return (
    <Form action={saveTemplate} toastOnly={!!t} resetOnSuccess={!t} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="id" value={t?.id ?? ""} />
      <Field label="Name" name="name" defaultValue={t?.name} /><Field label="Slug" name="slug" defaultValue={t?.slug} />
      <Field label="Category" name="category" defaultValue={t?.category} /><Field label="Sort order" name="sort" type="number" defaultValue={t?.sort ?? 500} />
      <div className="sm:col-span-2 lg:col-span-4"><Field label="Description" name="description" defaultValue={t?.description} /></div>
      <Field label="Industry tags (comma separated)" name="industry_tags" defaultValue={t?.industry_tags.join(", ")} /><Field label="Style tags" name="style_tags" defaultValue={t?.style_tags.join(", ")} />
      <Field label="Layout" name="archetype" as="select" defaultValue={t?.archetype}><Opt list={ARCHETYPES.map((a) => [a, ARCHETYPE_LABEL[a]] as [string, string])} /></Field>
      <Field label="Hero style" name="hero" as="select" defaultValue={c?.hero}><Opt list={HEROES.map((h) => [h, HERO_LABEL[h]] as [string, string])} /></Field>
      <Field label="Card style" name="card" as="select" defaultValue={c?.card}><Opt list={CARDS} /></Field>
      <Field label="Button" name="button" as="select" defaultValue={c?.button}><Opt list={BUTTONS} /></Field>
      <Field label="Heading font" name="heading" as="select" defaultValue={c?.fonts.heading}><Opt list={FONT_IDS.map((f) => [f, FONTS[f][0]] as [string, string])} /></Field>
      <Field label="Body font" name="body" as="select" defaultValue={c?.fonts.body}><Opt list={FONT_IDS.map((f) => [f, FONTS[f][0]] as [string, string])} /></Field>
      <Field label={t ? "Palette (leave to keep current)" : "Palette"} name="palette" as="select" defaultValue=""><option value="">{t ? "Keep current colours" : "Choose"}</option><Opt list={Object.keys(PALETTES)} /></Field>
      <Field label="Columns" name="columns" as="select" defaultValue={String(c?.columns ?? 3)}><Opt list={["2", "3", "4"]} /></Field>
      <Field label="Minimum plan" name="min_plan_code" as="select" defaultValue={t?.min_plan_code ?? "odogwu"}><Opt list={PLANS} /></Field>
      <label className="text-sm font-medium">Desktop preview image<input type="file" name="preview" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm" /></label>
      <label className="text-sm font-medium">Mobile preview image<input type="file" name="mobile_preview" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={t ? t.is_active !== false : true} />Enabled</label>
      <div className="sm:col-span-2 lg:col-span-4"><Submit size="sm">{t ? "Save template" : "Create template"}</Submit></div>
    </Form>
  );
}

export default async function Templates() {
  const a = await requireAdmin();
  const { templates, effects, use } = await asUser(a.id, async (db) => ({
    templates: await db.rows<Template & { id: string }>("select * from storefront_templates order by sort, name"),
    effects: await db.rows("select * from animation_assets order by sort, name"),
    use: Object.fromEntries((await db.rows("select template_id, count(*)::int n from storefront_designs where published is not null group by 1")).map((r) => [r.template_id, r.n])),
  }));
  const counts = PLANS.map(([code, name]) => `${name} ${templates.filter((t) => t.min_plan_code === code && t.is_active !== false).length}`).join(", ");
  return (
    <>
      <PageHead title="Store templates and effects" sub={`${templates.length} templates (${counts} by minimum plan). Changing a minimum plan applies straight away; stores that lose access fall back safely and their owners are told.`} />
      <Card><h2 className="mb-3 font-bold">New template</h2><TemplateForm /></Card>
      <div className="mt-4 space-y-2">{templates.map((t) => (
        <details key={t.id} className="rounded-tag border border-line bg-card p-3">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2">
            <span className="size-4 rounded" style={{ background: t.config.colors.accent }} aria-hidden /><b>{t.name}</b>
            <span className="text-sm text-mute">{ARCHETYPE_LABEL[t.archetype]}, {HERO_LABEL[t.config.hero]}</span>
            <Badge>{PLANS.find(([c]) => c === t.min_plan_code)?.[1] ?? t.min_plan_code}</Badge>{t.is_active === false && <Badge tone="red">Disabled</Badge>}
            {use[t.id] ? <span className="text-sm text-mute">{use[t.id]} live store{use[t.id] > 1 ? "s" : ""}</span> : null}
          </summary>
          <div className="mt-3"><TemplateForm t={t} /></div>
        </details>
      ))}</div>

      <h2 className="mt-10 mb-3 text-xl font-bold">Effects</h2>
      <Card>
        <h3 className="mb-2 font-bold">New Lottie effect</h3>
        <p className="mb-3 text-sm text-mute">Built-in effects are drawn in code. New ones are Lottie files you upload (1 MB max, no expressions).</p>
        <Form action={saveEffect} resetOnSuccess className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name" name="name" /><Field label="Slug" name="slug" />
          <Field label="Category" name="category" as="select"><Opt list={EFFECT_CATEGORIES} /></Field>
          <Field label="Minimum plan" name="min_plan_code" as="select" defaultValue="odogwu"><Opt list={PLANS} /></Field>
          <div className="sm:col-span-2"><Field label="Description" name="description" /></div>
          <label className="text-sm font-medium">Lottie file<input type="file" name="file" accept=".json,application/json" className="mt-1 block w-full text-sm" required /></label>
          <label className="text-sm font-medium">Preview image<input type="file" name="preview" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked />Enabled</label>
          <div className="sm:col-span-2 lg:col-span-4"><Submit size="sm">Create effect</Submit></div>
        </Form>
      </Card>
      <div className="mt-3 space-y-2">{effects.map((e) => (
        <details key={e.id} className="rounded-tag border border-line bg-card p-3">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2"><b>{e.name}</b><span className="text-sm text-mute">{e.category}, {e.renderer}</span>
            <Badge>{PLANS.find(([c]) => c === e.min_plan_code)?.[1] ?? e.min_plan_code}</Badge>{!e.is_active && <Badge tone="red">Disabled</Badge>}</summary>
          <Form action={saveEffect} toastOnly className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="id" value={e.id} />
            <Field label="Name" name="name" defaultValue={e.name} />
            <Field label="Category" name="category" as="select" defaultValue={e.category}><Opt list={EFFECT_CATEGORIES} /></Field>
            <Field label="Minimum plan" name="min_plan_code" as="select" defaultValue={e.min_plan_code}><Opt list={PLANS} /></Field>
            <label className="text-sm font-medium">Preview image<input type="file" name="preview" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm" /></label>
            <div className="sm:col-span-2"><Field label="Description" name="description" defaultValue={e.description} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={e.is_active} />Enabled</label>
            <div><Submit size="sm">Save effect</Submit></div>
          </Form>
        </details>
      ))}</div>
    </>
  );
}
