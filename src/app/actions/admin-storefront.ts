"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { action, id, optional, text } from "@/lib/action";
import { ActionError, requireAdmin } from "@/lib/auth";
import { asSystem, type Db } from "@/lib/db";
import { logAdmin, notify } from "@/lib/notify";
import { saveImage } from "@/lib/storage";
import { ARCHETYPES, BUTTONS, CARDS, EFFECT_CATEGORIES, FONT_IDS, HEROES, PALETTES } from "@/lib/storefront-catalog";
import { syncAllDowngrades, syncDowngrade } from "@/lib/storefront";
import { checkLottie, deleteStored } from "@/lib/storefront-media";

/** Authorise on the server, do the work, write the audit log, in one transaction. */
type Done = string | void | { message: string; after: () => Promise<unknown> };
function admin<S extends z.ZodType>(schema: S, name: string, target: string, fn: (d: z.output<S>, db: Db, adminId: string, form: FormData) => Promise<Done>) {
  return action(schema, async (d, form) => {
    const a = await requireAdmin();
    const done = await asSystem(async (db) => {
      const m = await fn(d, db, a.id, form);
      const { file: _f, preview: _p, mobile_preview: _m, ...meta } = d as Record<string, unknown>;
      await logAdmin(db, a.id, name, target, String((d as { id?: string }).id ?? (d as { slug?: string }).slug ?? ""), meta);
      return m;
    });
    // Runs once the change is committed, so follow-up work sees it.
    if (done && typeof done === "object") await done.after().catch((e) => console.error(e));
    revalidatePath("/admin", "layout"); revalidatePath("/seller/storefront", "layout");
    return (done && typeof done === "object" ? done.message : done) ?? "Saved.";
  });
}

export const setStoreStatus = admin(z.object({ id, status: z.enum(["active", "hidden", "suspended"]), reason: optional(300) }), "storefront.status", "storefront", async (d, db) => {
  if (d.status !== "active" && !d.reason) throw new ActionError("Give a reason. The seller sees it.");
  const s = await db.one("update storefronts set status=$2, status_reason=$3 where id=$1 returning owner_id, name, slug", [d.id, d.status, d.status === "active" ? null : d.reason]);
  if (!s) throw new ActionError("Storefront not found.");
  await notify(db, s.owner_id, d.status === "active" ? "Your storefront is visible again" : `Your storefront was ${d.status === "hidden" ? "hidden" : "suspended"}`,
    d.status === "active" ? `${s.name} is back on Vybe Market.` : `Reason: ${d.reason}. Reply to support if you think this is a mistake.`, "/seller/storefront");
  revalidatePath(`/store/${s.slug}`);
  return d.status === "active" ? "Storefront is live again." : `Storefront ${d.status}. The seller has been told why.`;
});

export const setFeatured = admin(z.object({ id, featured: z.enum(["true", "false"]) }), "storefront.feature", "storefront", async (d, db) => {
  const s = await db.one("update storefronts set is_featured=$2 where id=$1 returning name", [d.id, d.featured === "true"]);
  if (!s) throw new ActionError("Storefront not found.");
  revalidatePath("/");
  return d.featured === "true" ? `${s.name} is featured on the home page.` : `${s.name} is no longer featured.`;
});

export const removeStoreMedia = admin(z.object({ id, reason: text(3, 300, "Reason") }), "storefront.media.remove", "storefront_media", async (d, db) => {
  const m = await db.one(
    "update storefront_media m set status='removed', removed_reason=$2 from storefronts s where m.id=$1 and s.id=m.storefront_id and m.status<>'removed' returning m.path, m.storefront_id, s.owner_id", [d.id, d.reason]);
  if (!m) throw new ActionError("That file is already gone.");
  if (m.path.startsWith("sb/")) await deleteStored(m.path);
  await notify(db, m.owner_id, "A file was removed from your storefront", `Reason: ${d.reason}. Your store shows your cover image or other effects in its place.`, "/seller/storefront/media");
  return { message: "File removed and the seller notified.", after: () => syncDowngrade(m.storefront_id) };
});

const plan = z.enum(["k-leg", "no-dulling", "odogwu"]);
const tags = optional(200).transform((s) => (s ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 12));
const font = z.enum(FONT_IDS as [string, ...string[]]);
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes").max(60);

async function preview(form: FormData, key: string, adminId: string) {
  const f = form.get(key);
  return f instanceof File && f.size ? saveImage(f, "template-previews", adminId) : null;
}

export const saveTemplate = admin(z.object({
  id: id.optional().or(z.literal("").transform(() => undefined)), slug, name: text(2, 60, "Name"), description: optional(240), category: text(2, 40, "Category"),
  industry_tags: tags, style_tags: tags, archetype: z.enum(ARCHETYPES), hero: z.enum(HEROES), card: z.enum(CARDS), heading: font, body: font,
  palette: z.enum(Object.keys(PALETTES) as [string, ...string[]]).optional().or(z.literal("").transform(() => undefined)),
  button: z.enum(BUTTONS), columns: z.coerce.number().int().min(2).max(4), min_plan_code: plan, sort: z.coerce.number().int().min(0).max(9999), is_active: z.string().optional(),
}), "template.save", "storefront_template", async (d, db, me, form) => {
  const [p1, p2] = await Promise.all([preview(form, "preview", me), preview(form, "mobile_preview", me)]);
  const old = d.id ? await db.one("select config from storefront_templates where id=$1", [d.id]) : null;
  if (d.id && !old) throw new ActionError("Template not found.");
  if (!d.id && !d.palette) throw new ActionError("Pick a colour palette for a new template.");
  const config = {
    ...(old?.config ?? { effects: [] }), hero: d.hero, card: d.card, fonts: { heading: d.heading, body: d.body }, button: d.button, columns: d.columns,
    ...(d.palette ? { colors: PALETTES[d.palette] } : {}),
  };
  const twin = await db.one(
    `select name from storefront_templates where id is distinct from $1 and (config->'fonts' = $2::jsonb or (archetype=$3 and config->>'hero'=$4)) limit 1`,
    [d.id ?? null, JSON.stringify(config.fonts), d.archetype, d.hero]);
  if (twin) throw new ActionError(`Too close to "${twin.name}". Every template needs its own font pairing and its own layout and hero combination.`);
  const vals = [d.slug, d.name, d.description ?? "", d.category, d.industry_tags, d.style_tags, d.archetype, JSON.stringify(config), d.min_plan_code, d.sort, !!d.is_active, p1, p2];
  if (d.id) await db.run(
    `update storefront_templates set slug=$2,name=$3,description=$4,category=$5,industry_tags=$6,style_tags=$7,archetype=$8,config=$9,min_plan_code=$10,sort=$11,is_active=$12,
       preview_path=coalesce($13,preview_path), mobile_preview_path=coalesce($14,mobile_preview_path) where id=$1`, [d.id, ...vals]);
  else await db.run(
    `insert into storefront_templates(slug,name,description,category,industry_tags,style_tags,archetype,config,min_plan_code,sort,is_active,preview_path,mobile_preview_path)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, vals).catch((e) => { if (String(e.message).includes("unique")) throw new ActionError("That slug is taken."); throw e; });
  return { message: d.id ? "Template saved." : "Template created. Sellers on the right plan can pick it now.", after: syncAllDowngrades };
});

export const saveEffect = admin(z.object({
  id: id.optional().or(z.literal("").transform(() => undefined)), slug: slug.optional(), name: text(2, 60, "Name"), description: optional(240),
  category: z.enum(EFFECT_CATEGORIES), min_plan_code: plan, is_active: z.string().optional(),
}), "effect.save", "animation_asset", async (d, db, me, form) => {
  const p = await preview(form, "preview", me);
  if (d.id) {
    const r = await db.one("update animation_assets set name=$2, description=$3, category=$4, min_plan_code=$5, is_active=$6, preview_path=coalesce($7,preview_path) where id=$1 returning id",
      [d.id, d.name, d.description ?? "", d.category, d.min_plan_code, !!d.is_active, p]);
    if (!r) throw new ActionError("Effect not found.");
    return { message: "Effect saved.", after: syncAllDowngrades };
  }
  // New effects are Lottie files. Code-drawn effects ship with the app.
  if (!d.slug) throw new ActionError("Give the new effect a slug.");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new ActionError("Upload the Lottie .json file for the new effect.");
  const textBody = await file.text();
  checkLottie(textBody);
  const path = `public/lottie/${randomUUID()}.json`;
  await db.run("insert into file_blobs(path, content_type, data, is_private, owner_id) values ($1,'application/json',$2,false,$3)", [path, Buffer.from(textBody), me]);
  await db.run(
    `insert into animation_assets(slug,name,description,category,renderer,min_plan_code,params_schema,asset_path,preview_path,is_active,sort)
     values ($1,$2,$3,$4,'lottie',$5,'{}',$6,$7,$8,(select coalesce(max(sort),0)+1 from animation_assets))`,
    [d.slug, d.name, d.description ?? "", d.category, d.min_plan_code, path, p, !!d.is_active]).catch((e) => { if (String(e.message).includes("unique")) throw new ActionError("That slug is taken."); throw e; });
  return "Effect created.";
});
