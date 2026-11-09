import { removeMedia, uploadBannerImage, uploadLottie, uploadPoster } from "@/app/actions/storefront";
import { ActionButton, Form, Submit } from "@/components/form";
import { AnimatedUpload } from "@/components/storefront/media-upload";
import { Badge, Card, Empty, PageHead } from "@/components/ui";
import { limits, planForLevel, planName } from "@/lib/storefront-access";
import { loadBuilder } from "../data";
import { StoreTabs } from "../tabs";

export const metadata = { title: "Banners and media" };
const kb = (n?: number) => (n ? (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`) : "");
const Rights = () => (
  <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="rights" className="mt-1" required />I own the rights to this artwork. It contains no copyrighted characters or logos I don't own.</label>
);

export default async function Media() {
  const b = await loadBuilder();
  const lim = limits(b.access.level);
  const inUse = new Set([b.published?.hero.mediaId, b.draft.hero.mediaId, ...b.draft.effects.map((e) => e.mediaId), ...(b.published?.effects.map((e) => e.mediaId) ?? [])].filter(Boolean));
  const items = b.media.filter((m) => m.status !== "removed");
  const animReason = !lim.animatedBanner ? `GIF and video banners come with ${planName(b.catalog, planForLevel(b.catalog, 1))} and ${planName(b.catalog, planForLevel(b.catalog, 2))}.`
    : !b.storage ? "GIF and video uploads aren't switched on for this site yet (media storage isn't connected). Image banners work now." : null;
  return (
    <div>
      <PageHead title="My Storefront" sub="Upload banners here, then choose one in the editor." />
      <StoreTabs on="/media" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="font-bold">Image banner</h2>
          <p className="mt-1 text-sm text-mute">JPG, PNG or WebP, up to 5 MB. Wide images (about 1600 by 600) look best.</p>
          <Form action={uploadBannerImage} resetOnSuccess className="mt-3 space-y-2">
            <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required aria-label="Banner image" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-palm file:px-3 file:py-1.5 file:font-semibold file:text-white" />
            <Rights /><Submit size="sm">Upload image</Submit>
          </Form>
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 font-bold">GIF or video banner{!lim.animatedBanner && <Badge>{planName(b.catalog, planForLevel(b.catalog, 1))}</Badge>}</h2>
          <div className="mt-3"><AnimatedUpload enabled={!animReason} reason={animReason} /></div>
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 font-bold">Lottie animation{!lim.lottie && <Badge>{planName(b.catalog, planForLevel(b.catalog, 2))}</Badge>}</h2>
          {lim.lottie ? (
            <Form action={uploadLottie} resetOnSuccess className="mt-3 space-y-2">
              <p className="text-sm text-mute">A Lottie .json file up to 1 MB, exported without expressions.</p>
              <input type="file" name="file" accept=".json,application/json" required aria-label="Lottie file" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-palm file:px-3 file:py-1.5 file:font-semibold file:text-white" />
              <Rights /><Submit size="sm">Upload Lottie</Submit>
            </Form>
          ) : <p className="mt-1 text-sm text-mute">Play your own Lottie animations as effect layers on {planName(b.catalog, planForLevel(b.catalog, 2))}.</p>}
        </Card>
      </div>

      <h2 className="mt-8 mb-3 text-lg font-bold">Your library ({items.length} of 30)</h2>
      {items.length === 0 ? <Empty title="No uploads yet" body="Your store uses your cover image until you upload a banner." /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((m) => (
            <Card key={m.id} className="space-y-2">
              <div className="aspect-video overflow-hidden rounded-lg bg-black/40">
                {m.status === "pending" ? <p className="grid h-full place-items-center text-sm text-mute">Upload didn't finish</p>
                  : m.kind === "video" ? <video src={m.url} poster={m.posterUrl ?? undefined} muted loop playsInline controls preload="metadata" className="size-full object-cover" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : m.kind === "lottie" ? <p className="grid h-full place-items-center text-sm text-mute">Lottie animation, plays in the editor preview</p> : <img src={m.url} alt="" className="size-full object-cover" loading="lazy" />}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge>{m.kind}</Badge><span className="text-mute">{kb(m.bytes)}{m.duration_ms ? `, ${Math.round(m.duration_ms / 100) / 10}s` : ""}</span>
                {inUse.has(m.id) && <Badge tone="green">In use</Badge>}
                {m.kind !== "image" && m.kind !== "lottie" && !lim.animatedBanner && <Badge tone="amber">Plan doesn't cover</Badge>}
              </div>
              {(m.kind === "video" || m.kind === "gif") && m.status === "active" && (
                <Form action={uploadPoster} resetOnSuccess className="space-y-1">
                  <input type="hidden" name="media_id" value={m.id} />
                  <p className="text-xs text-mute">{m.posterUrl ? "Poster set. It shows while loading, on reduced motion, and if your plan changes." : m.kind === "video" ? "Needs a poster image before it can be published." : "Optional still image used if your plan changes."}</p>
                  <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required aria-label="Poster image" className="block w-full text-xs" />
                  <Submit size="sm" variant="outline">{m.posterUrl ? "Replace poster" : "Add poster"}</Submit>
                </Form>
              )}
              <ActionButton action={removeMedia} values={{ media_id: m.id }} confirm={inUse.has(m.id) ? "This file is in use. Remove it anyway? Your store falls back to your cover image." : "Remove this file?"}>Remove</ActionButton>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
