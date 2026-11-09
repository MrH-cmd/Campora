import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { violations } from "@/lib/storefront-access";
import { accessFor, clientAssets, loadCatalog, loadContent, loadMedia, mediaMap, readDesign } from "@/lib/storefront";
import { storageConfigured } from "@/lib/storefront-media";
import { sellerContext } from "@/app/actions/seller";

/** Everything the My Storefront pages need, read as the seller under Row Level Security. */
export async function loadBuilder(opts: { content?: boolean } = {}) {
  const { user, store } = await sellerContext();
  if (!store) redirect("/seller/storefront");
  return asUser(user.id, async (db) => {
    const [catalog, access, media, row, content] = await Promise.all([
      loadCatalog(db), accessFor(db, user.id), loadMedia(db, store.id, false),
      db.one("select * from storefront_designs where storefront_id=$1", [store.id]),
      opts.content ? loadContent(db, store) : null,
    ]);
    const published = row?.published ? readDesign(row.published, catalog, store) : null;
    const draft = readDesign(row?.draft ?? row?.published, catalog, store);
    const active = media.filter((m) => m.status === "active");
    const map = mediaMap(active);
    const backup = row?.backup ? readDesign(row.backup, catalog, store) : null;
    return {
      user, store, catalog, access, media, active, row, draft, published, content,
      assets: clientAssets(catalog), storage: storageConfigured(),
      publishedIssues: published ? violations(published, access, catalog, map) : [],
      backupReady: !!backup && violations(backup, access, catalog, map).length === 0,
      hasBackup: !!backup,
    };
  });
}
