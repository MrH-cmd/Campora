"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { action, id, optional } from "@/lib/action";
import { ActionError, rateLimit } from "@/lib/auth";
import { asSystem, asUser, type Db } from "@/lib/db";
import { saveImage } from "@/lib/storage";
import { designFromTemplate, type Design } from "@/lib/storefront-catalog";
import { canUseEffect, canUseMedia, canUseTemplate, featurePlan, limits, planName, violations, type Violation } from "@/lib/storefront-access";
import { DesignError, parseDesign, SOCIAL_HOSTS, socialUrl, type Social } from "@/lib/storefront-design";
import { MEDIA_LIMITS, checkLottie, checkMedia, deleteStored, fetchStored, inspectMedia, signedUpload, storageConfigured } from "@/lib/storefront-media";
import { accessFor, loadCatalog, loadMedia, mediaMap, readDesign, syncDowngrade } from "@/lib/storefront";
import { sellerContext } from "./seller";

/** The signed-in seller's store, plan and catalogue. Every builder action starts here. */
async function builder() {
  const { user, store } = await sellerContext();
  if (!store) throw new ActionError("Create your storefront first.");
  if (user.status !== "active") throw new ActionError("Your account is restricted, so selling is paused.");
  return asUser(user.id, async (db) => {
    const [catalog, access, media, row] = await Promise.all([
      loadCatalog(db), accessFor(db, user.id), loadMedia(db, store.id),
      db.one("select * from storefront_designs where storefront_id=$1", [store.id]),
    ]);
    const published = row?.published ? readDesign(row.published, catalog, store) : null;
    const draft = readDesign(row?.draft ?? row?.published, catalog, store);
    return { user, store, catalog, access, media, row, published, draft };
  });
}
type Ctx = Awaited<ReturnType<typeof builder>>;

/** Locked items a seller adds are refused. Items already in their published design (from before a downgrade) may stay in the draft. */
function newViolations(ctx: Ctx, d: Design): Violation[] {
  const media = mediaMap(ctx.media);
  const before = new Set(ctx.published ? violations(ctx.published, ctx.access, ctx.catalog, media).map((v) => v.message) : []);
  return violations(d, ctx.access, ctx.catalog, media).filter((v) => v.need && !before.has(v.message));
}

async function writeDraft(ctx: Ctx, d: Design) {
  const t = ctx.catalog.templates.find((x) => x.slug === d.template);
  await asUser(ctx.user.id, (db) => db.run(
    `insert into storefront_designs(storefront_id, draft) values ($1,$2)
     on conflict (storefront_id) do update set draft=excluded.draft, updated_at=now()`, [ctx.store.id, JSON.stringify(d)]));
  if (t?.id) await asSystem((db) => db.run("update storefront_designs set template_id=$2 where storefront_id=$1", [ctx.store.id, t.id]));
}

const parse = (raw: string) => { try { return parseDesign(raw); } catch (e) { if (e instanceof DesignError) throw new ActionError(e.message); throw e; } };

export const saveDraft = action(z.object({ design: z.string().max(40_000) }), async (d) => {
  const ctx = await builder();
  const design = parse(d.design);
  if (!ctx.catalog.templates.some((t) => t.slug === design.template)) throw new ActionError("That template doesn't exist.");
  const bad = newViolations(ctx, design);
  if (bad.length) throw new ActionError(bad[0].message);
  await writeDraft(ctx, design);
  return "Draft saved. Your public store hasn't changed.";
});

export const chooseTemplate = action(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,60}$/) }), async (d) => {
  const ctx = await builder();
  const t = ctx.catalog.templates.find((x) => x.slug === d.slug);
  if (!t || t.is_active === false) throw new ActionError("That template isn't available.");
  if (!canUseTemplate(ctx.catalog, ctx.access, t)) throw new ActionError(`The ${t.name} template needs the ${planName(ctx.catalog, t.min_plan_code)} plan.`);
  // Banner, section order and product display carry over. Colours, fonts and effects come from the template.
  const next = designFromTemplate(t, ctx.draft);
  next.effects = next.effects.filter((e) => ctx.catalog.assets.some((a) => a.slug === e.asset && canUseEffect(ctx.catalog, ctx.access, a)))
    .slice(0, limits(ctx.access).layers);
  if (next.hero.mediaId) {
    const m = ctx.media.find((x) => x.id === next.hero.mediaId);
    if (!m || !canUseMedia(ctx.access, m.kind)) next.hero = { ...next.hero, mediaId: null };
  }
  if (next.hero.parallax && !ctx.access.features.parallax) next.hero = { ...next.hero, parallax: false };
  await writeDraft(ctx, next);
  revalidatePath("/seller/storefront");
  return `${t.name} applied to your draft. Open the editor to fine-tune it, then publish.`;
});

export const publishDesign = action(z.object({ design: z.string().max(40_000).optional() }), async (d) => {
  const ctx = await builder();
  await rateLimit(`publish:${ctx.user.id}`, 30, 3600);
  const design = d.design ? parse(d.design) : ctx.draft;
  // Publishing re-checks everything against the plan as it is right now.
  const bad = violations(design, ctx.access, ctx.catalog, mediaMap(ctx.media));
  if (bad.length) throw new ActionError(bad[0].message);
  const t = ctx.catalog.templates.find((x) => x.slug === design.template)!;
  const json = JSON.stringify(design);
  await asSystem(async (db) => {
    // If the seller is replacing a design their plan stopped covering, keep that design so an upgrade can bring it back.
    const keep = ctx.published && violations(ctx.published, ctx.access, ctx.catalog, mediaMap(ctx.media)).some((v) => v.need);
    await db.run(
      `insert into storefront_designs(storefront_id, template_id, draft, published, published_at, version) values ($1,$2,$3,$3,now(),1)
       on conflict (storefront_id) do update set template_id=$2, draft=$3, published=$3, published_at=now(), version=storefront_designs.version+1,
         backup = case when $4 then coalesce(storefront_designs.backup, storefront_designs.published) else storefront_designs.backup end, updated_at=now()`,
      [ctx.store.id, t.id, json, !!keep]);
  });
  await syncDowngrade(ctx.store.id);
  revalidatePath(`/store/${ctx.store.slug}`); revalidatePath("/seller/storefront");
  return "Published. Your store page now shows this design.";
});

export const discardDraft = action(z.object({}), async () => {
  const ctx = await builder();
  if (!ctx.published) throw new ActionError("There's no published design to go back to yet.");
  await writeDraft(ctx, ctx.published);
  return "Draft reset to your published design.";
});

/** Brings back the design a seller had before a downgrade, once their plan covers it again. */
export const restoreDesign = action(z.object({}), async () => {
  const ctx = await builder();
  const saved = ctx.row?.backup ? readDesign(ctx.row.backup, ctx.catalog, ctx.store) : null;
  if (!saved) throw new ActionError("There's no earlier design to restore.");
  const bad = violations(saved, ctx.access, ctx.catalog, mediaMap(ctx.media));
  if (bad.length) throw new ActionError(`Your current plan doesn't cover that design yet. ${bad[0].message}`);
  await asSystem((db) => db.run(
    "update storefront_designs set draft=backup, published=backup, backup=null, published_at=now(), version=version+1 where storefront_id=$1", [ctx.store.id]));
  await syncDowngrade(ctx.store.id);
  revalidatePath(`/store/${ctx.store.slug}`); revalidatePath("/seller/storefront");
  return "Your earlier design is back and published.";
});

const social = Object.fromEntries((Object.keys(SOCIAL_HOSTS) as Social[]).map((k) => [k, optional(200)]));
export const saveStoreExtras = action(z.object({ ...social, policies: optional(2000), announcement: optional(160) }), async (d) => {
  const ctx = await builder();
  const links: Record<string, string> = {};
  for (const k of Object.keys(SOCIAL_HOSTS) as Social[]) {
    const raw = (d as Record<string, string | undefined>)[k];
    if (!raw) continue;
    const url = socialUrl(k, raw);
    if (!url) throw new ActionError(`The ${k} link must be an https link on ${SOCIAL_HOSTS[k]}.`);
    links[k] = url;
  }
  await asUser(ctx.user.id, (db) => db.run("update storefronts set social_links=$2, policies=$3, announcement=$4 where id=$1",
    [ctx.store.id, JSON.stringify(links), d.policies ?? null, d.announcement ?? null]));
  revalidatePath(`/store/${ctx.store.slug}`); revalidatePath("/seller/storefront");
  return "Store details saved. They show on your store straight away.";
});

const rights = z.literal("on", { message: "Confirm you own the rights to this artwork." });
const insertMedia = (db: Db, row: Record<string, unknown>) => {
  const k = Object.keys(row);
  return db.one<{ id: string }>(`insert into storefront_media(${k.join(",")}) values (${k.map((_, i) => `$${i + 1}`).join(",")}) returning id`, k.map((x) => row[x]));
};
const countMedia = (db: Db, sid: string) => db.one<{ n: number }>("select count(*)::int n from storefront_media where storefront_id=$1 and status<>'removed'", [sid]);

async function mediaSlot(ctx: Ctx) {
  await rateLimit(`media:${ctx.user.id}`, 40, 3600);
  const n = await asSystem((db) => countMedia(db, ctx.store.id));
  if (n!.n >= 30) throw new ActionError("You have 30 files already. Remove some in the banner manager first.");
}

export const uploadBannerImage = action(z.object({ rights }), async (_d, form) => {
  const ctx = await builder();
  await mediaSlot(ctx);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new ActionError("Choose an image to upload.");
  const path = await saveImage(file, "banners", ctx.user.id);
  await asSystem((db) => insertMedia(db, { storefront_id: ctx.store.id, kind: "image", path, mime: "image", bytes: file.size, rights_confirmed: true }));
  revalidatePath("/seller/storefront/media");
  return "Image uploaded. Choose it as your banner in the editor.";
});

/** Step one of a GIF or video upload: checks the plan and hands the browser a one-time upload URL. */
export async function startMediaUpload(input: { kind: "gif" | "video"; ext: string; bytes: number; rights: boolean }) {
  try {
    const ctx = await builder();
    const p = z.object({ kind: z.enum(["gif", "video"]), ext: z.enum(["gif", "mp4", "webm"]), bytes: z.number().int().positive(), rights: z.literal(true, { message: "Confirm you own the rights to this artwork." }) }).safeParse(input);
    if (!p.success) return { error: p.error.issues[0]?.message ?? "That file can't be used." };
    const { kind, ext, bytes } = p.data;
    const lim = limits(ctx.access);
    if (kind === "video" && !lim.video) return { error: `Video banners need the ${planName(ctx.catalog, featurePlan(ctx.catalog, "video_banner"))} plan.` };
    if (kind === "gif" && !lim.gif) return { error: `GIF banners need the ${planName(ctx.catalog, featurePlan(ctx.catalog, "gif_banner"))} plan.` };
    if (!storageConfigured()) return { error: "GIF and video banners aren't switched on for this site yet. Image banners still work." };
    if ((kind === "gif") !== (ext === "gif")) return { error: kind === "gif" ? "Upload a .gif file." : "Upload an MP4 or WebM video." };
    const limit = kind === "gif" ? lim.gifBytes : MEDIA_LIMITS.video;
    if (bytes > limit) return { error: kind === "gif" && limit < MEDIA_LIMITS.gif
      ? `GIFs on your plan can be up to ${limit / 1024 / 1024} MB. ${planName(ctx.catalog, featurePlan(ctx.catalog, "video_banner"))} allows ${MEDIA_LIMITS.gif / 1024 / 1024} MB.`
      : `${kind === "gif" ? "GIFs" : "Videos"} must be ${limit / 1024 / 1024} MB or smaller.` };
    await mediaSlot(ctx);
    const up = await signedUpload(ctx.store.id, ext);
    const row = await asSystem((db) => insertMedia(db, { storefront_id: ctx.store.id, kind, path: up.path, mime: "pending", bytes: 0, rights_confirmed: true, status: "pending" }));
    return { id: row!.id, uploadUrl: up.uploadUrl };
  } catch (e) { return { error: e instanceof ActionError ? e.message : "Couldn't start the upload. Try again." }; }
}

/** Step two: the server reads the stored file back and checks its real type, size and length before accepting it. */
export async function finishMediaUpload(mediaId: string) {
  try {
    const ctx = await builder();
    if (!z.string().uuid().safeParse(mediaId).success) return { error: "Unknown upload." };
    const m = await asSystem((db) => db.one("select * from storefront_media where id=$1 and storefront_id=$2 and status='pending'", [mediaId, ctx.store.id]));
    if (!m) return { error: "Unknown upload." };
    const data = await fetchStored(m.path);
    try {
      if (!data) throw new ActionError("The upload didn't arrive. Try again.");
      const info = checkMedia(m.kind, inspectMedia(data), data.length);
      if (!canUseMedia(ctx.access, m.kind, data.length)) throw new ActionError(`That ${m.kind === "gif" ? "GIF" : "file"} is bigger than your plan allows.`);
      await asSystem((db) => db.run(
        "update storefront_media set status='active', mime=$2, bytes=$3, width=$4, height=$5, duration_ms=$6 where id=$1",
        [m.id, info.mime, data.length, info.width ?? null, info.height ?? null, info.durationMs ?? null]));
    } catch (e) {
      await deleteStored(m.path);
      await asSystem((db) => db.run("delete from storefront_media where id=$1", [m.id]));
      throw e;
    }
    revalidatePath("/seller/storefront/media");
    return { ok: true, message: m.kind === "video" ? "Video uploaded. Add a poster image so it has a still frame." : "GIF uploaded." };
  } catch (e) { return { error: e instanceof ActionError ? e.message : "Couldn't check the upload. Try again." }; }
}

export const uploadPoster = action(z.object({ media_id: id }), async (d, form) => {
  const ctx = await builder();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new ActionError("Choose a still image for the poster.");
  const m = await asSystem((db) => db.one("select id from storefront_media where id=$1 and storefront_id=$2 and kind in ('video','gif') and status='active'", [d.media_id, ctx.store.id]));
  if (!m) throw new ActionError("That video isn't in your library.");
  const path = await saveImage(file, "posters", ctx.user.id);
  await asSystem((db) => db.run("update storefront_media set poster_path=$2 where id=$1", [m.id, path]));
  revalidatePath("/seller/storefront/media");
  return "Poster saved.";
});

export const uploadLottie = action(z.object({ rights }), async (_d, form) => {
  const ctx = await builder();
  if (!ctx.access.features.lottie) throw new ActionError(`Lottie animations need the ${planName(ctx.catalog, featurePlan(ctx.catalog, "lottie"))} plan.`);
  await mediaSlot(ctx);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new ActionError("Choose a Lottie .json file.");
  if (file.size > MEDIA_LIMITS.lottie) throw new ActionError("Lottie files must be 1 MB or smaller.");
  const text = await file.text();
  const info = checkLottie(text);
  const path = `public/lottie/${randomUUID()}.json`;
  await asSystem(async (db) => {
    await db.run("insert into file_blobs(path, content_type, data, is_private, owner_id) values ($1,'application/json',$2,false,$3)", [path, Buffer.from(text), ctx.user.id]);
    await insertMedia(db, { storefront_id: ctx.store.id, kind: "lottie", path, mime: "application/json", bytes: file.size, width: info.width, height: info.height, duration_ms: info.durationMs, rights_confirmed: true });
  });
  revalidatePath("/seller/storefront/media");
  return "Lottie animation uploaded. Add the \"Your own Lottie animation\" effect in the editor to use it.";
});

const RIVE_BYTES = 2 * 1024 * 1024;
export const uploadRive = action(z.object({ rights }), async (_d, form) => {
  const ctx = await builder();
  if (!ctx.access.features.rive) throw new ActionError(`Rive animations need the ${planName(ctx.catalog, featurePlan(ctx.catalog, "rive"))} plan.`);
  await mediaSlot(ctx);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new ActionError("Choose a Rive .riv file.");
  if (file.size > RIVE_BYTES) throw new ActionError("Rive files must be 2 MB or smaller.");
  const data = Buffer.from(await file.arrayBuffer());
  // Real Rive files start with the bytes "RIVE"; anything else is refused whatever its name.
  if (data.subarray(0, 4).toString("latin1") !== "RIVE") throw new ActionError("That isn't a Rive .riv file. Export it from Rive as a .riv file.");
  const path = `public/rive/${randomUUID()}.riv`;
  await asSystem(async (db) => {
    await db.run("insert into file_blobs(path, content_type, data, is_private, owner_id) values ($1,'application/octet-stream',$2,false,$3)", [path, data, ctx.user.id]);
    await insertMedia(db, { storefront_id: ctx.store.id, kind: "rive", path, mime: "application/octet-stream", bytes: file.size, rights_confirmed: true });
  });
  revalidatePath("/seller/storefront/media");
  return "Rive animation uploaded. Add the \"Your own Rive animation\" effect in the editor to use it.";
});

export const removeMedia = action(z.object({ media_id: id }), async (d) => {
  const ctx = await builder();
  const m = await asSystem((db) => db.one("update storefront_media set status='removed', removed_reason='Removed by seller' where id=$1 and storefront_id=$2 and status<>'removed' returning path", [d.media_id, ctx.store.id]));
  if (!m) throw new ActionError("That file isn't in your library.");
  if (m.path.startsWith("sb/")) await deleteStored(m.path);
  await syncDowngrade(ctx.store.id);
  revalidatePath("/seller/storefront/media"); revalidatePath(`/store/${ctx.store.slug}`);
  return "Removed. If it was your banner, your store now shows your cover image instead.";
});
